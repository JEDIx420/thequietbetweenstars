import * as Tone from 'tone';
import { ProceduralMusicGenome, type SystemMusicGenome } from './ProceduralMusicGenome';
import { HarmonyHelper } from './HarmonyHelper';

export type MusicPhaseContext =
  | 'title'
  | 'cinematic'
  | 'briefing'
  | 'cruise'
  | 'approach'
  | 'orbit'
  | 'entry'
  | 'surface'
  | 'deep_cruise'
  | 'sentient';

export class AudioDirector {
  private isMuted = false;
  private masterVolume = 0.72;
  private currentContext: MusicPhaseContext = 'title';
  private currentGenome: SystemMusicGenome | null = null;
  private currentSystemChords: string[][] = [];
  private currentSystemBass: string[] = [];
  private currentSystemScaleNotes: string[] = [];

  // Tone synths & instruments
  private padSynth: Tone.PolySynth | null = null;
  private bassSynth: Tone.MonoSynth | null = null;
  private leadSynth: Tone.PolySynth | null = null;
  private ambientNoise: Tone.Noise | null = null;

  // Tone FX chain
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;

  // Direct Web Audio engine for thrusters & responsive sound FX
  private webAudioCtx: AudioContext | null = null;
  private webAudioMasterGain: GainNode | null = null;

  // Spacecraft Propulsion Nodes (Physical Sub Mass, Propulsion Roar, Ion Spool)
  private jetAirflowNoise: AudioBufferSourceNode | null = null;
  private jetAirflowFilter: BiquadFilterNode | null = null;
  private jetAirflowGain: GainNode | null = null;
  private jetRumbleFilter: BiquadFilterNode | null = null;
  private jetRumbleGain: GainNode | null = null;
  private jetSpoolOsc: OscillatorNode | null = null;
  private jetSpoolGain: GainNode | null = null;
  private jetSubOsc: OscillatorNode | null = null;
  private jetSubGain: GainNode | null = null;
  private prevThrottle = 0;
  private lastTransientTime = 0;

  // Warp Hyperspace Audio Nodes
  private warpSlipstreamNode: AudioBufferSourceNode | null = null;
  private warpSlipstreamGain: GainNode | null = null;
  private warpDroneOsc: OscillatorNode | null = null;
  private warpDroneGain: GainNode | null = null;

  private loopSequenceId: number | null = null;
  private stepIndex = 0;
  private isOverturePlaying = false;
  private overtureTimerId: number | null = null;

  public async start(): Promise<void> {
    // 1. Initialize Tone.js
    await Tone.start();
    Tone.getTransport().bpm.value = 84;

    if (!this.padSynth) {
      this.reverb = new Tone.Reverb({ decay: 5.5, wet: 0.40 }).toDestination();
      this.delay = new Tone.FeedbackDelay('8n', 0.28).connect(this.reverb);
      this.filter = new Tone.Filter(2400, 'lowpass').connect(this.delay);

      this.padSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 2.2, decay: 3.0, sustain: 0.8, release: 3.5 },
      }).connect(this.filter);
      this.padSynth.volume.value = -14;

      this.bassSynth = new Tone.MonoSynth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.2, decay: 0.6, sustain: 0.7, release: 1.4 },
        filterEnvelope: { attack: 0.1, decay: 0.5, sustain: 0.5, baseFrequency: 65, octaves: 2.0 },
      }).connect(this.filter);
      this.bassSynth.volume.value = -12;

      this.leadSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.1, decay: 0.6, sustain: 0.4, release: 1.8 },
      }).connect(this.delay);
      this.leadSynth.volume.value = -16;

      this.ambientNoise = new Tone.Noise('pink');
      const noiseFilter = new Tone.Filter(350, 'lowpass').connect(this.reverb);
      this.ambientNoise.connect(noiseFilter);
      this.ambientNoise.volume.value = -34;
      this.ambientNoise.start();
    }

    // 2. Initialize low-latency Web Audio for procedural 4-engine thrusters & sound FX
    if (!this.webAudioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.webAudioCtx = new AudioCtx();
        this.webAudioMasterGain = this.webAudioCtx.createGain();
        this.webAudioMasterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.webAudioCtx.currentTime);
        this.webAudioMasterGain.connect(this.webAudioCtx.destination);
        this.setupThrusters();
      }
    }

    if (this.webAudioCtx && this.webAudioCtx.state === 'suspended') {
      try {
        await this.webAudioCtx.resume();
      } catch (err) {
        console.warn('[AudioDirector] AudioContext resume waiting for interaction', err);
      }
    }

    if (this.currentContext !== 'title') {
      this.startMusicSequencer();
    }
  }

  private setupThrusters(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain) return;
    const now = this.webAudioCtx.currentTime;

    // Create 2-second looped pink-weighted noise buffer (aerodynamic air rush)
    const bufferSize = this.webAudioCtx.sampleRate * 2;
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.10;
    }

    this.jetAirflowNoise = this.webAudioCtx.createBufferSource();
    this.jetAirflowNoise.buffer = noiseBuffer;
    this.jetAirflowNoise.loop = true;

    // 1. Aerodynamic Bypass Airflow (smooth, quiet jet whoosh)
    this.jetAirflowFilter = this.webAudioCtx.createBiquadFilter();
    this.jetAirflowFilter.type = 'lowpass';
    this.jetAirflowFilter.frequency.setValueAtTime(220, now);
    this.jetAirflowFilter.Q.setValueAtTime(1.0, now);

    this.jetAirflowGain = this.webAudioCtx.createGain();
    this.jetAirflowGain.gain.setValueAtTime(0.012, now); // Gentle idle whoosh

    this.jetAirflowNoise.connect(this.jetAirflowFilter);
    this.jetAirflowFilter.connect(this.jetAirflowGain);
    this.jetAirflowGain.connect(this.webAudioMasterGain);

    // 2. Deep Jet Body / Hull Displacement (warm low-end rumble)
    this.jetRumbleFilter = this.webAudioCtx.createBiquadFilter();
    this.jetRumbleFilter.type = 'lowpass';
    this.jetRumbleFilter.frequency.setValueAtTime(75, now);
    this.jetRumbleFilter.Q.setValueAtTime(0.8, now);

    this.jetRumbleGain = this.webAudioCtx.createGain();
    this.jetRumbleGain.gain.setValueAtTime(0.014, now); // Low body displacement

    this.jetAirflowNoise.connect(this.jetRumbleFilter);
    this.jetRumbleFilter.connect(this.jetRumbleGain);
    this.jetRumbleGain.connect(this.webAudioMasterGain);

    this.jetAirflowNoise.start(now);

    // 3. High-Bypass Jet Turbine Spool (subtle, pure sine spool-up)
    this.jetSpoolOsc = this.webAudioCtx.createOscillator();
    this.jetSpoolOsc.type = 'sine';
    this.jetSpoolOsc.frequency.setValueAtTime(540, now);

    this.jetSpoolGain = this.webAudioCtx.createGain();
    this.jetSpoolGain.gain.setValueAtTime(0.0018, now); // Whisper-quiet at idle

    this.jetSpoolOsc.connect(this.jetSpoolGain);
    this.jetSpoolGain.connect(this.webAudioMasterGain);
    this.jetSpoolOsc.start(now);

    // 4. Physical Sub / Hull Body Displacement (38–75 Hz physical mass)
    this.jetSubOsc = this.webAudioCtx.createOscillator();
    this.jetSubOsc.type = 'sine';
    this.jetSubOsc.frequency.setValueAtTime(42, now);

    this.jetSubGain = this.webAudioCtx.createGain();
    this.jetSubGain.gain.setValueAtTime(0.012, now);

    this.jetSubOsc.connect(this.jetSubGain);
    this.jetSubGain.connect(this.webAudioMasterGain);
    this.jetSubOsc.start(now);
  }

  public setSystemGenome(systemSeed: number): void {
    this.currentGenome = ProceduralMusicGenome.generateGenome(systemSeed);
    Tone.getTransport().bpm.value = this.currentGenome.bpm;

    const prog = this.currentGenome.progression[0] || [`${this.currentGenome.rootNote}maj7`, 'Gmaj7', 'Amaj7', `${this.currentGenome.rootNote}maj7`];
    this.currentSystemChords = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 3));
    this.currentSystemBass = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 1)[0] || `${this.currentGenome!.rootNote}1`);
    this.currentSystemScaleNotes = HarmonyHelper.getScaleNotes(this.currentGenome.rootNote, this.currentGenome.scaleType, [4, 5]);

    if (this.filter) {
      const baseCutoff = 1400 + this.currentGenome.brightness * 2200;
      this.filter.frequency.rampTo(baseCutoff, 2.0);
    }
  }

  public setPlanetGenome(planetSeed: number, _profile?: any): void {
    const surfaceSeed = (this.currentGenome ? this.currentGenome.seed : 42000) ^ (planetSeed * 37);
    const planetGenome = ProceduralMusicGenome.generateGenome(surfaceSeed);
    const prog = planetGenome.progression[1] || planetGenome.progression[0];
    this.currentSystemChords = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 3));
    this.currentSystemBass = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 1)[0] || `${planetGenome.rootNote}1`);
    this.currentSystemScaleNotes = HarmonyHelper.getScaleNotes(planetGenome.rootNote, planetGenome.scaleType, [3, 4]);

    if (this.filter) {
      const surfaceCutoff = 1100 + planetGenome.brightness * 1600;
      this.filter.frequency.rampTo(surfaceCutoff, 2.0);
    }
  }

  /**
   * Title Overture: 60-90s contemplative cinematic composition
   * 5 distinct movements:
   * 1. Void: Sub-bass fundamental and sparse celestial drone
   * 2. Awakening: Warm fifths and gentle mid pads
   * 3. Expansion: Full harmonic chord bed with stereo shimmer
   * 4. Theme: Lydian melodic motif evoking quiet awe
   * 5. Release: Tapering gentle resonance ready for flight
   */
  /**
   * Title Overture: 114 BPM propulsive sci-fi space-opera overture
   * Features rolling bass pulse, wide majestic synth pads, driving arpeggio motif,
   * and soaring melodic lines evoking cosmic grandeur and momentum.
   */
  public playTitleOverture(): void {
    if (this.isOverturePlaying) return;
    this.isOverturePlaying = true;
    this.setContext('title');

    if (this.loopSequenceId !== null) {
      clearInterval(this.loopSequenceId);
      this.loopSequenceId = null;
    }

    if (this.overtureTimerId !== null) {
      clearInterval(this.overtureTimerId);
      this.overtureTimerId = null;
    }

    Tone.getTransport().bpm.value = 114;

    // Harmonic space-opera chord progression (4 bars)
    const progression = [
      { chord: ['C3', 'G3', 'Eb4', 'G4', 'Bb4'], root: 'C2', bassNotes: ['C2', 'C2', 'C3', 'C2'] },
      { chord: ['Ab2', 'Eb3', 'Ab3', 'C4', 'Eb4'], root: 'Ab1', bassNotes: ['Ab1', 'Ab1', 'Ab2', 'Ab1'] },
      { chord: ['Eb3', 'Bb3', 'Eb4', 'G4', 'Bb4'], root: 'Eb2', bassNotes: ['Eb2', 'Eb2', 'Eb3', 'Eb2'] },
      { chord: ['Bb2', 'F3', 'Bb3', 'D4', 'F4'], root: 'Bb1', bassNotes: ['Bb1', 'Bb1', 'Bb2', 'Bb1'] },
    ];

    const arpeggioMap = [
      ['C4', 'Eb4', 'G4', 'Bb4', 'C5', 'G4', 'Eb4', 'G4'],
      ['Ab3', 'C4', 'Eb4', 'Ab4', 'C5', 'Eb4', 'C4', 'Eb4'],
      ['Eb4', 'G4', 'Bb4', 'Eb5', 'G5', 'Eb5', 'Bb4', 'G4'],
      ['Bb3', 'D4', 'F4', 'Bb4', 'D5', 'F5', 'D5', 'Bb4'],
    ];

    const leadMotifs = [
      ['Eb5', 'G5', 'F5', 'D5'],
      ['C5', 'Eb5', 'Ab5', 'G5'],
      ['Bb5', 'G5', 'Eb5', 'F5'],
      ['D5', 'F5', 'G5', 'Bb5'],
    ];

    let step = 0;
    // 114 BPM: 1 beat = 526ms, 8th note = 263ms
    const stepIntervalMs = 263;

    if (this.filter) {
      this.filter.frequency.rampTo(2800, 1.5);
    }
    if (this.padSynth) {
      this.padSynth.volume.rampTo(-11, 1.0);
    }
    if (this.bassSynth) {
      this.bassSynth.volume.rampTo(-9, 1.0);
    }
    if (this.leadSynth) {
      this.leadSynth.volume.rampTo(-14, 1.0);
    }

    const stepTick = () => {
      if (!this.isOverturePlaying || this.isMuted) return;

      const barIndex = Math.floor((step % 32) / 8);
      const isDownbeat = (step % 8) === 0;
      const currentBar = progression[barIndex];
      const now = Tone.now();

      // Pad on downbeat of each bar
      if (isDownbeat && this.padSynth) {
        this.padSynth.triggerAttackRelease(currentBar.chord, '1m', now, 0.75);
      }

      // Driving rolling bass on each 8th note
      if (this.bassSynth) {
        const bassNote = currentBar.bassNotes[step % 4];
        this.bassSynth.triggerAttackRelease(bassNote, '8n', now, (step % 2 === 0) ? 0.85 : 0.65);
      }

      // Propulsive arpeggiation / lead
      if (this.leadSynth) {
        const arpPatterns = arpeggioMap[barIndex];
        const note = arpPatterns[step % arpPatterns.length];
        this.leadSynth.triggerAttackRelease(note, '16n', now + 0.05, 0.50);

        // Soaring lead phrase on later repetitions
        if (step >= 16 && (step % 4 === 0)) {
          const leadPhrase = leadMotifs[barIndex];
          const leadNote = leadPhrase[(step / 4) % leadPhrase.length];
          this.leadSynth.triggerAttackRelease(leadNote, '4n', now + 0.12, 0.70);
        }
      }

      step++;
    };

    stepTick();
    this.overtureTimerId = window.setInterval(stepTick, stepIntervalMs);
  }

  public playTitleMusic(): void {
    if (this.isOverturePlaying) return;
    this.playTitleOverture();
  }

  public stopTitleOverture(): void {
    this.isOverturePlaying = false;
    if (this.overtureTimerId !== null) {
      clearInterval(this.overtureTimerId);
      this.overtureTimerId = null;
    }
  }

  public setContext(context: MusicPhaseContext): void {
    this.currentContext = context;

    // Keep title overture running smoothly across title screen, cinematic, and briefing
    if (context !== 'title' && context !== 'cinematic' && context !== 'briefing') {
      if (this.isOverturePlaying) {
        this.stopTitleOverture();
      }
      if (this.padSynth) {
        this.startMusicSequencer();
      }
    }

    if (!this.filter) return;

    switch (context) {
      case 'title':
      case 'cinematic':
      case 'briefing':
      case 'cruise':
        this.filter.frequency.rampTo(2400, 0.6);
        if (this.padSynth) this.padSynth.volume.rampTo(-12, 0.5);
        if (this.bassSynth) this.bassSynth.volume.rampTo(-10, 0.5);
        break;
      case 'approach':
        this.filter.frequency.rampTo(1800, 0.6);
        if (this.leadSynth) this.leadSynth.volume.rampTo(-18, 0.5);
        break;
      case 'orbit':
        this.filter.frequency.rampTo(3200, 0.6);
        if (this.leadSynth) this.leadSynth.volume.rampTo(-12, 0.5);
        break;
      case 'surface':
        this.filter.frequency.rampTo(2000, 0.6);
        if (this.padSynth) this.padSynth.volume.rampTo(-14, 0.5);
        break;
      case 'deep_cruise':
        this.filter.frequency.rampTo(4800, 0.4);
        if (this.bassSynth) this.bassSynth.volume.rampTo(-8, 0.4);
        break;
      case 'sentient':
        this.filter.frequency.rampTo(2800, 0.5);
        if (this.leadSynth) this.leadSynth.volume.rampTo(-10, 0.5);
        break;
    }
  }

  private startMusicSequencer(): void {
    if (this.loopSequenceId !== null) return;
    if (this.isMuted || !this.padSynth) return;

    // Procedurally generated chords from system or planet genome if available
    const chords = (this.currentSystemChords && this.currentSystemChords.length > 0)
      ? this.currentSystemChords
      : [
          ['Eb3', 'G3', 'Bb3', 'D4'],
          ['C3', 'Eb3', 'G3', 'Bb3'],
          ['Ab2', 'Eb3', 'Ab3', 'C4'],
          ['Bb2', 'F3', 'Bb3', 'D4'],
        ];

    const bassNotes = (this.currentSystemBass && this.currentSystemBass.length > 0)
      ? this.currentSystemBass
      : ['Eb1', 'C1', 'Ab0', 'Bb0'];

    const scaleNotes = (this.currentSystemScaleNotes && this.currentSystemScaleNotes.length > 0)
      ? this.currentSystemScaleNotes
      : ['Eb4', 'G4', 'Bb4', 'D5', 'C5', 'F5'];

    const playStep = () => {
      if (this.isMuted || !this.padSynth || this.isOverturePlaying) return;

      const chord = chords[this.stepIndex % chords.length];
      const time = Tone.now();

      // Trigger chord pad
      this.padSynth.triggerAttackRelease(chord, '2n', time);

      // Trigger bass note
      if (this.bassSynth && this.stepIndex % 2 === 0) {
        const bass = bassNotes[this.stepIndex % bassNotes.length];
        this.bassSynth.triggerAttackRelease(bass, '1n', time);
      }

      // Trigger generative melodic lead arpeggio
      if (this.leadSynth && this.currentContext !== 'entry') {
        const note = scaleNotes[(this.stepIndex * 3) % scaleNotes.length];
        this.leadSynth.triggerAttackRelease(note, '8n', time + 0.4);
      }

      this.stepIndex++;
    };

    // Play immediately on start
    playStep();
    this.loopSequenceId = window.setInterval(playStep, 2400);
  }

  /**
   * Acceleration transient punch ("whump") when rapidly throttling up
   */
  public playAccelerationTransient(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;

    // Sub thump
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(85, now);
    subOsc.frequency.exponentialRampToValueAtTime(36, now + 0.3);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.35);

    // Mid air displacement whoosh
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.3);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(260, now);
    filter.Q.setValueAtTime(2.0, now);
    const gain = this.webAudioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    noise.start(now);
  }

  /**
   * Cinematic engine ignition cue for Scene 4 of New Journey
   */
  public playCinematicEngineIgnition(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;

    // 1. Spool-up capacitor whine (800Hz -> 2200Hz)
    const whineOsc = this.webAudioCtx.createOscillator();
    const whineGain = this.webAudioCtx.createGain();
    whineOsc.type = 'sine';
    whineOsc.frequency.setValueAtTime(800, now);
    whineOsc.frequency.exponentialRampToValueAtTime(2200, now + 0.8);

    whineGain.gain.setValueAtTime(0.001, now);
    whineGain.gain.linearRampToValueAtTime(0.08, now + 0.4);
    whineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    whineOsc.connect(whineGain);
    whineGain.connect(this.webAudioMasterGain);
    whineOsc.start(now);
    whineOsc.stop(now + 0.95);

    // 2. Heavy reactor combustion / ignition thud (at now + 0.75s)
    const tIgnition = now + 0.75;
    const thudOsc = this.webAudioCtx.createOscillator();
    const thudGain = this.webAudioCtx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(110, tIgnition);
    thudOsc.frequency.exponentialRampToValueAtTime(32, tIgnition + 0.7);

    thudGain.gain.setValueAtTime(0.001, tIgnition);
    thudGain.gain.linearRampToValueAtTime(0.32, tIgnition + 0.06);
    thudGain.gain.exponentialRampToValueAtTime(0.001, tIgnition + 0.8);

    thudOsc.connect(thudGain);
    thudGain.connect(this.webAudioMasterGain);
    thudOsc.start(tIgnition);
    thudOsc.stop(tIgnition + 0.85);

    // 3. Ignition exhaust blast noise
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 1.0);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, tIgnition);
    filter.frequency.exponentialRampToValueAtTime(180, tIgnition + 0.9);
    const gain = this.webAudioCtx.createGain();
    gain.gain.setValueAtTime(0.001, tIgnition);
    gain.gain.linearRampToValueAtTime(0.25, tIgnition + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, tIgnition + 0.95);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    noise.start(tIgnition);
  }

  public updateThrottle(throttle: number): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;

    const t = Math.max(0, Math.min(1, throttle));
    const now = this.webAudioCtx.currentTime;

    // Detect sudden acceleration punch
    if (t - this.prevThrottle > 0.25 && now - this.lastTransientTime > 0.45) {
      this.playAccelerationTransient();
      this.lastTransientTime = now;
    }
    this.prevThrottle = t;

    // 1. Aerodynamic Bypass Airflow: filter smoothly sweeps from 220Hz up to 520Hz
    if (this.jetAirflowFilter && this.jetAirflowGain) {
      this.jetAirflowFilter.frequency.setTargetAtTime(220 + t * 300, now, 0.08);
      // Quiet gain scaling: idle 0.012 -> full throttle 0.038
      this.jetAirflowGain.gain.setTargetAtTime(0.012 + t * 0.026, now, 0.08);
    }

    // 2. Low-frequency jet body displacement: 75Hz -> 125Hz
    if (this.jetRumbleFilter && this.jetRumbleGain) {
      this.jetRumbleFilter.frequency.setTargetAtTime(75 + t * 50, now, 0.10);
      // Quiet rumble: idle 0.014 -> full throttle 0.032
      this.jetRumbleGain.gain.setTargetAtTime(0.014 + t * 0.018, now, 0.10);
    }

    // 3. High-Bypass Turbine Spool-Up: 540Hz -> 1140Hz
    if (this.jetSpoolOsc && this.jetSpoolGain) {
      this.jetSpoolOsc.frequency.setTargetAtTime(540 + t * 600, now, 0.12);
      // Very quiet turbine whine: idle 0.0018 -> full throttle 0.0068
      this.jetSpoolGain.gain.setTargetAtTime(0.0018 + t * 0.0050, now, 0.12);
    }

    // 4. Physical Sub / Hull Body Displacement (38–75 Hz physical mass)
    if (this.jetSubOsc && this.jetSubGain) {
      this.jetSubOsc.frequency.setTargetAtTime(42 + t * 30, now, 0.10);
      // Sub gain scaling: idle 0.012 -> full throttle 0.036
      this.jetSubGain.gain.setTargetAtTime(0.012 + t * 0.024, now, 0.10);
    }
  }

  public playScanEffect(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;
    const osc = this.webAudioCtx.createOscillator();
    const gain = this.webAudioCtx.createGain();
    const filter = this.webAudioCtx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(622.25, now + 0.38);
    osc.frequency.exponentialRampToValueAtTime(311.13, now + 1.4);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(440, now);
    filter.Q.setValueAtTime(3.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);

    osc.start(now);
    osc.stop(now + 2.0);
  }

  public playCollisionDeflection(isDanger = false): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;
    const osc = this.webAudioCtx.createOscillator();
    const gain = this.webAudioCtx.createGain();

    osc.type = isDanger ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isDanger ? 140 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(isDanger ? 60 : 160, now + 0.3);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.webAudioMasterGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playBlip(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;
    const osc = this.webAudioCtx.createOscillator();
    const gain = this.webAudioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.webAudioMasterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playConnectChime(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      if (!this.webAudioCtx || !this.webAudioMasterGain) return;
      const osc = this.webAudioCtx.createOscillator();
      const gain = this.webAudioCtx.createGain();
      const t = now + i * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.webAudioMasterGain);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  /**
   * High-tech holographic warp countdown tick (5 to 1)
   */
  public playWarpCountdownTick(count: number): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;

    // Pitch rises from 440Hz at 5, up to 980Hz at 1
    const baseFreq = 440 + (5 - count) * 135;

    const osc = this.webAudioCtx.createOscillator();
    const gain = this.webAudioCtx.createGain();
    const filter = this.webAudioCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.12);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 1.2, now);
    filter.Q.setValueAtTime(3.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    osc.start(now);
    osc.stop(now + 0.30);

    // Deep sub charge pulse
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(60 + (5 - count) * 15, now);
    subGain.gain.setValueAtTime(0.20, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.26);
  }

  /**
   * Massive warp drive entry: gravitic implosion + energetic hyperspace flash
   */
  public playWarpEntry(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;

    // 1. Gravitic Implosion (descending sub-bass pitch drop)
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(160, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.6);

    subGain.gain.setValueAtTime(0.01, now);
    subGain.gain.linearRampToValueAtTime(0.35, now + 0.08);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.95);

    // 2. High-energy displacement boom
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.8);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noiseNode = this.webAudioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;

    const noiseFilter = this.webAudioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1400, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(120, now + 0.7);

    const noiseGain = this.webAudioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.28, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.webAudioMasterGain);
    noiseNode.start(now);
  }

  /**
   * Continuous 5-second hyperspace slipstream sound with stereo resonant sweep & gravitic drone
   */
  public startWarpSlipstream(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    this.stopWarpSlipstream();

    const now = this.webAudioCtx.currentTime;

    // 1. Hyperspace slipstream noise
    const bufferSize = this.webAudioCtx.sampleRate * 2;
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + white * 0.1;
      b1 = 0.95 * b1 + white * 0.2;
      output[i] = (b0 + b1) * 0.15;
    }

    this.warpSlipstreamNode = this.webAudioCtx.createBufferSource();
    this.warpSlipstreamNode.buffer = noiseBuffer;
    this.warpSlipstreamNode.loop = true;

    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.linearRampToValueAtTime(1100, now + 2.5);
    filter.frequency.linearRampToValueAtTime(500, now + 5.0);
    filter.Q.setValueAtTime(2.2, now);

    this.warpSlipstreamGain = this.webAudioCtx.createGain();
    this.warpSlipstreamGain.gain.setValueAtTime(0.001, now);
    this.warpSlipstreamGain.gain.linearRampToValueAtTime(0.12, now + 0.4);

    this.warpSlipstreamNode.connect(filter);
    filter.connect(this.warpSlipstreamGain);
    this.warpSlipstreamGain.connect(this.webAudioMasterGain);
    this.warpSlipstreamNode.start(now);

    // 2. Gravitic sub drone (deep interstellar hum)
    this.warpDroneOsc = this.webAudioCtx.createOscillator();
    this.warpDroneGain = this.webAudioCtx.createGain();
    this.warpDroneOsc.type = 'triangle';
    this.warpDroneOsc.frequency.setValueAtTime(58, now);
    this.warpDroneOsc.frequency.linearRampToValueAtTime(72, now + 2.5);
    this.warpDroneOsc.frequency.linearRampToValueAtTime(52, now + 5.0);

    this.warpDroneGain.gain.setValueAtTime(0.001, now);
    this.warpDroneGain.gain.linearRampToValueAtTime(0.15, now + 0.5);

    this.warpDroneOsc.connect(this.warpDroneGain);
    this.warpDroneGain.connect(this.webAudioMasterGain);
    this.warpDroneOsc.start(now);
  }

  public stopWarpSlipstream(): void {
    if (this.webAudioCtx) {
      const now = this.webAudioCtx.currentTime;
      if (this.warpSlipstreamGain) {
        this.warpSlipstreamGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
      }
      if (this.warpDroneGain) {
        this.warpDroneGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
      }
      const node = this.warpSlipstreamNode;
      const drone = this.warpDroneOsc;
      setTimeout(() => {
        try {
          node?.stop();
          node?.disconnect();
          drone?.stop();
          drone?.disconnect();
        } catch {}
      }, 350);
    }
    this.warpSlipstreamNode = null;
    this.warpSlipstreamGain = null;
    this.warpDroneOsc = null;
    this.warpDroneGain = null;
  }

  /**
   * Deceleration sonic snap / drop-out boom upon system arrival
   * Heavy 130 Hz -> 24 Hz sub deceleration thump + noise displacement boom + arrival chime
   */
  public playWarpExit(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    const now = this.webAudioCtx.currentTime;

    // 1. Heavy low-end deceleration thump (130Hz -> 24Hz)
    const osc = this.webAudioCtx.createOscillator();
    const gain = this.webAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.65);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);

    osc.connect(gain);
    gain.connect(this.webAudioMasterGain);
    osc.start(now);
    osc.stop(now + 0.72);

    // 2. Energetic displacement boom
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.6);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.55);
    const noiseGain = this.webAudioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.22, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.60);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.webAudioMasterGain);
    noise.start(now);

    // 3. Arrival harmonic chime
    this.playConnectChime();
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.webAudioMasterGain && this.webAudioCtx) {
      this.webAudioMasterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.webAudioCtx.currentTime);
    }
    if (this.filter) {
      Tone.getDestination().mute = this.isMuted;
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }
}

export const audio = new AudioDirector();

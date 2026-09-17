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

  // Spacecraft Propulsion Nodes (Physical Sub Mass, Propulsion Roar, Dual Ion Spool)
  private thrusterMasterGain: GainNode | null = null;
  private jetAirflowNoise: AudioBufferSourceNode | null = null;
  private jetAirflowFilter: BiquadFilterNode | null = null;
  private jetAirflowGain: GainNode | null = null;
  private jetRumbleFilter: BiquadFilterNode | null = null;
  private jetRumbleGain: GainNode | null = null;
  private jetSpoolOsc: OscillatorNode | null = null;
  private jetSpoolGain: GainNode | null = null;
  private jetSpoolOsc2: OscillatorNode | null = null;
  private jetSpoolFilter2: BiquadFilterNode | null = null;
  private jetSpoolGain2: GainNode | null = null;
  private jetSubOsc: OscillatorNode | null = null;
  private jetSubGain: GainNode | null = null;
  private jetSubOsc2: OscillatorNode | null = null;
  private jetSubGain2: GainNode | null = null;
  private prevThrottle = 0;
  private appliedThrottle = -1;
  private lastTransientTime = 0;
  private lastDecelTransientTime = 0;

  // Warp Hyperspace Audio Nodes
  private warpSlipstreamNode: AudioBufferSourceNode | null = null;
  private warpSlipstreamGain: GainNode | null = null;
  private warpDroneOsc: OscillatorNode | null = null;
  private warpDroneOsc2: OscillatorNode | null = null;
  private warpDroneGain: GainNode | null = null;
  private warpTachyonOsc: OscillatorNode | null = null;
  private warpTachyonGain: GainNode | null = null;

  private loopSequenceId: number | null = null;
  private stepIndex = 0;
  private isOverturePlaying = false;
  private overtureTimerId: number | null = null;

  public async start(): Promise<void> {
    // 1. Initialize Tone.js
    try {
      await Tone.start();
      if (Tone.getTransport()?.bpm) {
        Tone.getTransport().bpm.value = 84;
      }

      if (!this.padSynth) {
        this.reverb = new Tone.Reverb({ decay: 5.0, wet: 0.36 }).toDestination();
        this.delay = new Tone.FeedbackDelay('8n', 0.22).connect(this.reverb);
        this.filter = new Tone.Filter(2800, 'lowpass').connect(this.delay);

        // Lush warm analog poly-pad (fat triangle for rich, soft, shimmering warmth)
        this.padSynth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fattriangle', count: 3, spread: 20 },
          envelope: { attack: 1.2, decay: 2.5, sustain: 0.75, release: 2.8 },
        }).connect(this.filter);
        this.padSynth.volume.value = -12;

        // Warm round analog bass (deep, punchy sub-melodic presence)
        this.bassSynth = new Tone.MonoSynth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.06, decay: 0.45, sustain: 0.65, release: 1.0 },
          filterEnvelope: { attack: 0.03, decay: 0.35, sustain: 0.45, baseFrequency: 75, octaves: 2.2 },
        }).connect(this.filter);
        this.bassSynth.volume.value = -10;

        // Soft crystalline celestial lead / arpeggio
        this.leadSynth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fattriangle', count: 2, spread: 12 },
          envelope: { attack: 0.04, decay: 0.5, sustain: 0.25, release: 1.6 },
        }).connect(this.delay);
        this.leadSynth.volume.value = -15;

        this.ambientNoise = new Tone.Noise('pink');
        const noiseFilter = new Tone.Filter(350, 'lowpass').connect(this.reverb);
        this.ambientNoise.connect(noiseFilter);
        this.ambientNoise.volume.value = -34;
        this.ambientNoise.start();
      }
    } catch (err) {
      console.warn('[AudioDirector] Tone.js initialization deferred or unsupported:', err);
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
    if (this.thrusterMasterGain) return; // Already initialized

    const now = this.webAudioCtx.currentTime;

    // Master thruster gain bus (isolates propulsion audio from menus & title screen)
    this.thrusterMasterGain = this.webAudioCtx.createGain();
    const initialGain = (this.currentContext === 'title' || this.currentContext === 'cinematic') ? 0.0 : 1.0;
    this.thrusterMasterGain.gain.setValueAtTime(initialGain, now);
    this.thrusterMasterGain.connect(this.webAudioMasterGain);

    // Create 2-second looped pink-weighted noise buffer (aerodynamic plasma air rush & hull vibration)
    const bufferSize = this.webAudioCtx.sampleRate * 2;
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      // Nominal headroom output for clean audible presence without distortion
      output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.65;
    }

    this.jetAirflowNoise = this.webAudioCtx.createBufferSource();
    this.jetAirflowNoise.buffer = noiseBuffer;
    this.jetAirflowNoise.loop = true;

    // 1. Aerodynamic Bypass Plasma Airflow (clean, resonant spacecraft whoosh)
    this.jetAirflowFilter = this.webAudioCtx.createBiquadFilter();
    this.jetAirflowFilter.type = 'lowpass';
    this.jetAirflowFilter.frequency.setValueAtTime(280, now);
    this.jetAirflowFilter.Q.setValueAtTime(1.4, now);

    this.jetAirflowGain = this.webAudioCtx.createGain();
    this.jetAirflowGain.gain.setValueAtTime(0.065, now); // Audible, gentle idle whoosh

    this.jetAirflowNoise.connect(this.jetAirflowFilter);
    this.jetAirflowFilter.connect(this.jetAirflowGain);
    this.jetAirflowGain.connect(this.thrusterMasterGain);

    // 2. Deep Jet Body / Hull Displacement (warm low-end combustion rumble)
    this.jetRumbleFilter = this.webAudioCtx.createBiquadFilter();
    this.jetRumbleFilter.type = 'lowpass';
    this.jetRumbleFilter.frequency.setValueAtTime(85, now);
    this.jetRumbleFilter.Q.setValueAtTime(1.0, now);

    this.jetRumbleGain = this.webAudioCtx.createGain();
    this.jetRumbleGain.gain.setValueAtTime(0.08, now); // Solid physical hull presence

    this.jetAirflowNoise.connect(this.jetRumbleFilter);
    this.jetRumbleFilter.connect(this.jetRumbleGain);
    this.jetRumbleGain.connect(this.thrusterMasterGain);

    this.jetAirflowNoise.start(now);

    // 3. High-Bypass Jet Turbine Spool (dual-harmonic pure ion spool whine)
    // Fundamental spool (sine)
    this.jetSpoolOsc = this.webAudioCtx.createOscillator();
    this.jetSpoolOsc.type = 'sine';
    this.jetSpoolOsc.frequency.setValueAtTime(360, now);

    this.jetSpoolGain = this.webAudioCtx.createGain();
    this.jetSpoolGain.gain.setValueAtTime(0.035, now); // Soft, clean turbine idle

    this.jetSpoolOsc.connect(this.jetSpoolGain);
    this.jetSpoolGain.connect(this.thrusterMasterGain);
    this.jetSpoolOsc.start(now);

    // Overtone harmonic spool (triangle wave lowpassed for silky warmth)
    this.jetSpoolOsc2 = this.webAudioCtx.createOscillator();
    this.jetSpoolOsc2.type = 'triangle';
    this.jetSpoolOsc2.frequency.setValueAtTime(720, now);

    this.jetSpoolFilter2 = this.webAudioCtx.createBiquadFilter();
    this.jetSpoolFilter2.type = 'lowpass';
    this.jetSpoolFilter2.frequency.setValueAtTime(1800, now);

    this.jetSpoolGain2 = this.webAudioCtx.createGain();
    this.jetSpoolGain2.gain.setValueAtTime(0.018, now);

    this.jetSpoolOsc2.connect(this.jetSpoolFilter2);
    this.jetSpoolFilter2.connect(this.jetSpoolGain2);
    this.jetSpoolGain2.connect(this.thrusterMasterGain);
    this.jetSpoolOsc2.start(now);

    // 4. Physical Sub / Hull Body Displacement (detuned dual sine/triangle for warm analog beating)
    this.jetSubOsc = this.webAudioCtx.createOscillator();
    this.jetSubOsc.type = 'triangle';
    this.jetSubOsc.frequency.setValueAtTime(46, now);

    this.jetSubGain = this.webAudioCtx.createGain();
    this.jetSubGain.gain.setValueAtTime(0.12, now); // Physical mass in the subwoofer

    this.jetSubOsc.connect(this.jetSubGain);
    this.jetSubGain.connect(this.thrusterMasterGain);
    this.jetSubOsc.start(now);

    this.jetSubOsc2 = this.webAudioCtx.createOscillator();
    this.jetSubOsc2.type = 'sine';
    this.jetSubOsc2.frequency.setValueAtTime(46.5, now);

    this.jetSubGain2 = this.webAudioCtx.createGain();
    this.jetSubGain2.gain.setValueAtTime(0.08, now);

    this.jetSubOsc2.connect(this.jetSubGain2);
    this.jetSubGain2.connect(this.thrusterMasterGain);
    this.jetSubOsc2.start(now);
  }

  public setSystemGenome(systemSeed: number): void {
    this.currentGenome = ProceduralMusicGenome.generateGenome(systemSeed);
    Tone.getTransport().bpm.value = this.currentGenome.bpm;

    const root = this.currentGenome.rootNote;
    const r5 = HarmonyHelper.transposeRoot(root, 5);
    const r7 = HarmonyHelper.transposeRoot(root, 7);
    const r9 = HarmonyHelper.transposeRoot(root, 9);
    const defaultProg = [`${r5}maj9`, `${root}maj9`, `${r9}m9`, `${r7}add9`];

    const prog = this.currentGenome.progression[0] || defaultProg;
    this.currentSystemChords = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 3));
    this.currentSystemBass = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 1)[0] || `${this.currentGenome!.rootNote}1`);
    this.currentSystemScaleNotes = HarmonyHelper.getScaleNotes(this.currentGenome.rootNote, this.currentGenome.scaleType, [4, 5]);

    if (this.filter) {
      const baseCutoff = 1800 + this.currentGenome.brightness * 1800;
      this.filter.frequency.rampTo(baseCutoff, 2.0);
    }
  }

  public setPlanetGenome(planetSeed: number, _profile?: any): void {
    const surfaceSeed = (this.currentGenome ? this.currentGenome.seed : 42000) ^ (planetSeed * 37);
    const planetGenome = ProceduralMusicGenome.generateGenome(surfaceSeed);

    const root = planetGenome.rootNote;
    const r5 = HarmonyHelper.transposeRoot(root, 5);
    const r7 = HarmonyHelper.transposeRoot(root, 7);
    const r9 = HarmonyHelper.transposeRoot(root, 9);
    const defaultProg = [`${r5}maj9`, `${root}maj9`, `${r9}m9`, `${r7}add9`];

    const prog = planetGenome.progression[1] || planetGenome.progression[0] || defaultProg;
    this.currentSystemChords = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 3));
    this.currentSystemBass = prog.map((c: string) => HarmonyHelper.parseChordToNotes(c, 1)[0] || `${planetGenome.rootNote}1`);
    this.currentSystemScaleNotes = HarmonyHelper.getScaleNotes(planetGenome.rootNote, planetGenome.scaleType, [3, 4]);

    if (this.filter) {
      const surfaceCutoff = 1500 + planetGenome.brightness * 1500;
      this.filter.frequency.rampTo(surfaceCutoff, 2.0);
    }
  }

  /**
   * Title Overture: 98 BPM uplifting, vibey chillwave & space-opera composition
   * Features glowing analog pads, syncopated bounce bass, twinkling Lydian arpeggios,
   * and soaring optimistic lead phrases that evoke pure celestial wonder.
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

    Tone.getTransport().bpm.value = 98;

    // Euphoric, uplifting, sun-drenched chord progression (Gmaj9 -> Dmaj9 -> Bm9 -> Aadd9)
    // Voiced with wide, warm open intervals
    const progression = [
      {
        chord: ['G2', 'D3', 'B3', 'F#4', 'A4', 'D5'], // Gmaj9 (IVmaj9: soaring celestial lift)
        root: 'G1',
        bassNotes: ['G1', 'G2', 'D2', 'G1'],
      },
      {
        chord: ['D3', 'A3', 'F#4', 'C#5', 'E5'], // Dmaj9 (Imaj9: warm radiant home)
        root: 'D2',
        bassNotes: ['D2', 'D2', 'A2', 'D2'],
      },
      {
        chord: ['B2', 'F#3', 'D4', 'A4', 'C#5'], // Bm9 (vi9: golden starlight)
        root: 'B1',
        bassNotes: ['B1', 'B2', 'F#2', 'B1'],
      },
      {
        chord: ['A2', 'E3', 'A3', 'C#4', 'E4', 'B4'], // Aadd9 (Vadd9: bright upward resolution)
        root: 'A1',
        bassNotes: ['A1', 'A2', 'E2', 'A1'],
      },
    ];

    // Sparkling crystalline arpeggios that dance over the chords
    const arpeggioMap = [
      ['G4', 'B4', 'D5', 'F#5', 'A5', 'F#5', 'D5', 'B4'],
      ['D4', 'F#4', 'A4', 'C#5', 'E5', 'C#5', 'A4', 'F#4'],
      ['B3', 'D4', 'F#4', 'A4', 'C#5', 'A4', 'F#4', 'D4'],
      ['A3', 'C#4', 'E4', 'A4', 'B4', 'A4', 'E4', 'C#4'],
    ];

    // Soaring, optimistic lead melodies (warm, uplifting phrases)
    const leadMotifs = [
      ['F#5', 'A5', 'B5', 'D6'],
      ['E5', 'F#5', 'A5', 'F#5'],
      ['D5', 'F#5', 'A5', 'B5'],
      ['C#5', 'E5', 'F#5', 'A5'],
    ];

    let step = 0;
    // 98 BPM: 1 beat = 612ms, 8th note = 306ms
    const stepIntervalMs = 306;

    if (this.filter) {
      this.filter.frequency.rampTo(3000, 1.5);
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

      // Pad on downbeat of each bar (smooth sustained measure)
      if (isDownbeat && this.padSynth) {
        this.padSynth.triggerAttackRelease(currentBar.chord, '1m', now, 0.72);
      }

      // Warm syncopated bass groove on 8th notes (downbeat and gentle upbeat pulse)
      if (this.bassSynth) {
        const bassNote = currentBar.bassNotes[step % 4];
        const vel = (step % 4 === 0) ? 0.85 : (step % 2 === 0 ? 0.65 : 0.45);
        this.bassSynth.triggerAttackRelease(bassNote, '8n', now, vel);
      }

      // Sparkling starlight arpeggios
      if (this.leadSynth) {
        const arpPatterns = arpeggioMap[barIndex];
        const note = arpPatterns[step % arpPatterns.length];
        this.leadSynth.triggerAttackRelease(note, '16n', now + 0.05, 0.42);

        // Soaring uplifting melody phrase on later repetitions
        if (step >= 16 && (step % 4 === 0)) {
          const leadPhrase = leadMotifs[barIndex];
          const leadNote = leadPhrase[(step / 4) % leadPhrase.length];
          this.leadSynth.triggerAttackRelease(leadNote, '4n', now + 0.12, 0.65);
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

    // Smoothly manage spacecraft propulsion audio bus across phases
    if (this.thrusterMasterGain && this.webAudioCtx) {
      const now = this.webAudioCtx.currentTime;
      if (context === 'title' || context === 'cinematic') {
        this.thrusterMasterGain.gain.setTargetAtTime(0.0, now, 0.15);
      } else {
        this.thrusterMasterGain.gain.setTargetAtTime(1.0, now, 0.20);
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
          ['G2', 'D3', 'B3', 'F#4', 'A4', 'D5'], // Gmaj9 (IVmaj9)
          ['D3', 'A3', 'F#4', 'C#5', 'E5'],       // Dmaj9 (Imaj9)
          ['B2', 'F#3', 'D4', 'A4', 'C#5'],       // Bm9 (vi9)
          ['A2', 'E3', 'A3', 'C#4', 'E4'],        // Aadd9 (Vadd9)
        ];

    const bassNotes = (this.currentSystemBass && this.currentSystemBass.length > 0)
      ? this.currentSystemBass
      : ['G1', 'D1', 'B0', 'A0'];

    const scaleNotes = (this.currentSystemScaleNotes && this.currentSystemScaleNotes.length > 0)
      ? this.currentSystemScaleNotes
      : ['F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5'];

    const playStep = () => {
      if (this.isMuted || !this.padSynth || this.isOverturePlaying) return;

      const chord = chords[this.stepIndex % chords.length];
      const time = Tone.now();

      // Trigger lush sustaining chord pad (1 full measure with warm natural decay)
      this.padSynth.triggerAttackRelease(chord, '1m', time, 0.68);

      // Trigger warm bass pulse
      if (this.bassSynth) {
        const bass = bassNotes[this.stepIndex % bassNotes.length];
        this.bassSynth.triggerAttackRelease(bass, '2n', time, 0.72);
      }

      // Trigger sparkling generative melodic arpeggios (3 gentle staggered notes for lush vibes)
      if (this.leadSynth && this.currentContext !== 'entry') {
        const n1 = scaleNotes[(this.stepIndex * 2) % scaleNotes.length];
        const n2 = scaleNotes[(this.stepIndex * 2 + 2) % scaleNotes.length];
        const n3 = scaleNotes[(this.stepIndex * 2 + 4) % scaleNotes.length];
        this.leadSynth.triggerAttackRelease(n1, '8n', time + 0.35, 0.40);
        this.leadSynth.triggerAttackRelease(n2, '8n', time + 0.85, 0.36);
        this.leadSynth.triggerAttackRelease(n3, '8n', time + 1.45, 0.42);
      }

      this.stepIndex++;
    };

    // Play immediately on start
    playStep();
    this.loopSequenceId = window.setInterval(playStep, 2400);
  }

  /**
   * Acceleration transient punch ("whump" & ion combustion surge) when rapidly throttling up
   */
  public playAccelerationTransient(intensity = 0.5): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
    const now = this.webAudioCtx.currentTime;
    const normIntensity = Math.min(1.0, Math.max(0.25, intensity * 2.0));

    // 1. Sub injection thump (110Hz -> 32Hz deep kick)
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.32);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.36 * normIntensity, now + 0.035);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.36);

    // 2. Plasma combustion surge / thruster whoosh (bandpass sweep)
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.35);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(820, now + 0.22);
    filter.Q.setValueAtTime(2.2, now);
    const gain = this.webAudioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26 * normIntensity, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    noise.start(now);
  }

  /**
   * Deceleration transient (retro-thruster vectoring burst, air-brake gas purge, & turbine spool-down)
   */
  public playDecelerationTransient(intensity = 0.5): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
    const now = this.webAudioCtx.currentTime;
    const normIntensity = Math.min(1.0, Math.max(0.25, intensity * 2.0));

    // 1. Retro-thruster gas/plasma purge whoosh (bandpass downward sweep 920Hz -> 240Hz)
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.40);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.36);
    filter.Q.setValueAtTime(2.4, now);

    const gain = this.webAudioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24 * normIntensity, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    noise.start(now);

    // 2. Turbine spool-down decompression whine (540Hz -> 240Hz pitch drop)
    const spoolOsc = this.webAudioCtx.createOscillator();
    const spoolGain = this.webAudioCtx.createGain();
    spoolOsc.type = 'sine';
    spoolOsc.frequency.setValueAtTime(540, now);
    spoolOsc.frequency.exponentialRampToValueAtTime(240, now + 0.34);

    spoolGain.gain.setValueAtTime(0.001, now);
    spoolGain.gain.linearRampToValueAtTime(0.14 * normIntensity, now + 0.04);
    spoolGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    spoolOsc.connect(spoolGain);
    spoolGain.connect(this.webAudioMasterGain);
    spoolOsc.start(now);
    spoolOsc.stop(now + 0.36);

    // 3. Hull decompression sub pulse (75Hz -> 26Hz drop)
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(75, now);
    subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.24);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.18 * normIntensity, now + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.27);
  }

  /**
   * Cinematic engine ignition cue for Scene 4 of New Journey
   */
  public playCinematicEngineIgnition(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
    const now = this.webAudioCtx.currentTime;

    // 1. Spool-up capacitor whine (800Hz -> 2200Hz)
    const whineOsc = this.webAudioCtx.createOscillator();
    const whineGain = this.webAudioCtx.createGain();
    whineOsc.type = 'sine';
    whineOsc.frequency.setValueAtTime(800, now);
    whineOsc.frequency.exponentialRampToValueAtTime(2200, now + 0.8);

    whineGain.gain.setValueAtTime(0.001, now);
    whineGain.gain.linearRampToValueAtTime(0.14, now + 0.4);
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
    thudGain.gain.linearRampToValueAtTime(0.42, tIgnition + 0.06);
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
    gain.gain.linearRampToValueAtTime(0.32, tIgnition + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, tIgnition + 0.95);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    noise.start(tIgnition);
  }

  public updateThrottle(throttle: number): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;

    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }

    if (!this.thrusterMasterGain) {
      this.setupThrusters();
    }

    const t = Math.max(0, Math.min(1, throttle));
    const now = this.webAudioCtx.currentTime;

    // Detect sudden acceleration punch (throttle jump > 0.10)
    if (t - this.prevThrottle > 0.10 && now - this.lastTransientTime > 0.35) {
      this.playAccelerationTransient(t - this.prevThrottle);
      this.lastTransientTime = now;
    }

    // Detect deceleration punch / retro-thruster brake (throttle drop > 0.12)
    if (this.prevThrottle - t > 0.12 && now - this.lastDecelTransientTime > 0.38) {
      this.playDecelerationTransient(this.prevThrottle - t);
      this.lastDecelTransientTime = now;
    }

    this.prevThrottle = t;

    // Ensure thruster master gain is engaged during active flight
    if (this.thrusterMasterGain && this.currentContext !== 'title' && this.currentContext !== 'cinematic') {
      if (this.thrusterMasterGain.gain.value < 0.2) {
        this.thrusterMasterGain.gain.setTargetAtTime(1.0, now, 0.15);
      }
    }

    // Guard redundant AudioParam scheduling when throttle is unchanged
    if (Math.abs(t - this.appliedThrottle) < 0.005) return;
    this.appliedThrottle = t;

    // 1. Aerodynamic Bypass Airflow: filter smoothly sweeps from 280Hz up to 1250Hz
    if (this.jetAirflowFilter && this.jetAirflowGain) {
      this.jetAirflowFilter.frequency.setTargetAtTime(280 + t * 970, now, 0.08);
      // Audible gain scaling: idle 0.065 -> full throttle 0.24
      this.jetAirflowGain.gain.setTargetAtTime(0.065 + t * 0.175, now, 0.08);
    }

    // 2. Low-frequency jet body displacement: 85Hz -> 185Hz
    if (this.jetRumbleFilter && this.jetRumbleGain) {
      this.jetRumbleFilter.frequency.setTargetAtTime(85 + t * 100, now, 0.10);
      // Body rumble: idle 0.08 -> full throttle 0.22
      this.jetRumbleGain.gain.setTargetAtTime(0.08 + t * 0.14, now, 0.10);
    }

    // 3. High-Bypass Turbine Spool-Up: 360Hz -> 880Hz (fundamental) & 720Hz -> 1760Hz (overtone)
    if (this.jetSpoolOsc && this.jetSpoolGain) {
      this.jetSpoolOsc.frequency.setTargetAtTime(360 + t * 520, now, 0.12);
      // Turbine whine: idle 0.035 -> full throttle 0.095
      this.jetSpoolGain.gain.setTargetAtTime(0.035 + t * 0.060, now, 0.12);
    }
    if (this.jetSpoolOsc2 && this.jetSpoolGain2) {
      this.jetSpoolOsc2.frequency.setTargetAtTime(720 + t * 1040, now, 0.12);
      // Overtone whine: idle 0.018 -> full throttle 0.050
      this.jetSpoolGain2.gain.setTargetAtTime(0.018 + t * 0.032, now, 0.12);
    }

    // 4. Physical Sub / Hull Body Displacement (46-92 Hz)
    if (this.jetSubOsc && this.jetSubGain) {
      this.jetSubOsc.frequency.setTargetAtTime(46 + t * 46, now, 0.10);
      // Sub gain scaling: idle 0.12 -> full throttle 0.26
      this.jetSubGain.gain.setTargetAtTime(0.12 + t * 0.14, now, 0.10);
    }
    if (this.jetSubOsc2 && this.jetSubGain2) {
      this.jetSubOsc2.frequency.setTargetAtTime(46.5 + t * 46.5, now, 0.10);
      // Sub 2 gain scaling: idle 0.08 -> full throttle 0.18
      this.jetSubGain2.gain.setTargetAtTime(0.08 + t * 0.10, now, 0.10);
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
   * High-tech holographic warp countdown tick (5 to 1) with energetic charging coils
   */
  public playWarpCountdownTick(count: number): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
    const now = this.webAudioCtx.currentTime;

    // Pitch rises from 480Hz at 5, up to 1120Hz at 1
    const baseFreq = 480 + (5 - count) * 160;

    // 1. Holographic pulse ping
    const osc = this.webAudioCtx.createOscillator();
    const gain = this.webAudioCtx.createGain();
    const filter = this.webAudioCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.14);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 1.2, now);
    filter.Q.setValueAtTime(3.8, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    osc.start(now);
    osc.stop(now + 0.35);

    // 2. Capacitor charging sweep
    const chargeOsc = this.webAudioCtx.createOscillator();
    const chargeGain = this.webAudioCtx.createGain();
    chargeOsc.type = 'sine';
    chargeOsc.frequency.setValueAtTime(baseFreq * 0.6, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, now + 0.22);

    chargeGain.gain.setValueAtTime(0.001, now);
    chargeGain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    chargeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    chargeOsc.connect(chargeGain);
    chargeGain.connect(this.webAudioMasterGain);
    chargeOsc.start(now);
    chargeOsc.stop(now + 0.25);

    // 3. Deep gravitic sub charge pulse
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(55 + (5 - count) * 18, now);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.32, now + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.32);

    // 4. Final pre-jump ignition flare on count 1
    if (count === 1) {
      const flareOsc = this.webAudioCtx.createOscillator();
      const flareGain = this.webAudioCtx.createGain();
      flareOsc.type = 'sine';
      flareOsc.frequency.setValueAtTime(800, now + 0.1);
      flareOsc.frequency.exponentialRampToValueAtTime(2400, now + 0.55);

      flareGain.gain.setValueAtTime(0.001, now + 0.1);
      flareGain.gain.linearRampToValueAtTime(0.24, now + 0.35);
      flareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

      flareOsc.connect(flareGain);
      flareGain.connect(this.webAudioMasterGain);
      flareOsc.start(now + 0.1);
      flareOsc.stop(now + 0.60);
    }
  }

  /**
   * Massive warp drive entry: gravitic implosion, dimensional rupture, & hypersonic sonic crack
   */
  public playWarpEntry(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
    const now = this.webAudioCtx.currentTime;

    // 1. Gravitic Implosion (deep 220Hz -> 22Hz sub-bass punch)
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(220, now);
    subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.75);

    subGain.gain.setValueAtTime(0.01, now);
    subGain.gain.linearRampToValueAtTime(0.55, now + 0.06);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 1.0);

    // 2. High-energy spatial displacement explosion
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 1.0);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noiseNode = this.webAudioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;

    const noiseFilter = this.webAudioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(2400, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(110, now + 0.85);

    const noiseGain = this.webAudioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.01, now);
    noiseGain.gain.linearRampToValueAtTime(0.42, now + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.90);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.webAudioMasterGain);
    noiseNode.start(now);

    // 3. Hypersonic Warp Whip / Crack (dimensional snap)
    const whipOsc = this.webAudioCtx.createOscillator();
    const whipGain = this.webAudioCtx.createGain();
    whipOsc.type = 'sawtooth';
    whipOsc.frequency.setValueAtTime(1200, now);
    whipOsc.frequency.exponentialRampToValueAtTime(3600, now + 0.08);
    whipOsc.frequency.exponentialRampToValueAtTime(180, now + 0.35);

    const whipFilter = this.webAudioCtx.createBiquadFilter();
    whipFilter.type = 'bandpass';
    whipFilter.frequency.setValueAtTime(2400, now);
    whipFilter.Q.setValueAtTime(3.0, now);

    whipGain.gain.setValueAtTime(0.001, now);
    whipGain.gain.linearRampToValueAtTime(0.28, now + 0.04);
    whipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    whipOsc.connect(whipFilter);
    whipFilter.connect(whipGain);
    whipGain.connect(this.webAudioMasterGain);
    whipOsc.start(now);
    whipOsc.stop(now + 0.40);
  }

  /**
   * Continuous 5-second hyperspace slipstream sound with resonant multi-band sweep,
   * gravitic drone, and tachyon shimmer harmonics
   */
  public startWarpSlipstream(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
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
      output[i] = (b0 + b1) * 0.45;
    }

    this.warpSlipstreamNode = this.webAudioCtx.createBufferSource();
    this.warpSlipstreamNode.buffer = noiseBuffer;
    this.warpSlipstreamNode.loop = true;

    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.linearRampToValueAtTime(1450, now + 2.5);
    filter.frequency.linearRampToValueAtTime(500, now + 5.0);
    filter.Q.setValueAtTime(2.6, now);

    this.warpSlipstreamGain = this.webAudioCtx.createGain();
    this.warpSlipstreamGain.gain.setValueAtTime(0.001, now);
    this.warpSlipstreamGain.gain.linearRampToValueAtTime(0.28, now + 0.4);

    this.warpSlipstreamNode.connect(filter);
    filter.connect(this.warpSlipstreamGain);
    this.warpSlipstreamGain.connect(this.webAudioMasterGain);
    this.warpSlipstreamNode.start(now);

    // 2. Gravitic sub drone (deep interstellar hum with dual detune)
    this.warpDroneOsc = this.webAudioCtx.createOscillator();
    this.warpDroneGain = this.webAudioCtx.createGain();
    this.warpDroneOsc.type = 'triangle';
    this.warpDroneOsc.frequency.setValueAtTime(54, now);
    this.warpDroneOsc.frequency.linearRampToValueAtTime(76, now + 2.5);
    this.warpDroneOsc.frequency.linearRampToValueAtTime(48, now + 5.0);

    this.warpDroneGain.gain.setValueAtTime(0.001, now);
    this.warpDroneGain.gain.linearRampToValueAtTime(0.28, now + 0.5);

    this.warpDroneOsc.connect(this.warpDroneGain);
    this.warpDroneGain.connect(this.webAudioMasterGain);
    this.warpDroneOsc.start(now);

    // 3. Detuned secondary sub drone for pulsating gravitic wave
    this.warpDroneOsc2 = this.webAudioCtx.createOscillator();
    this.warpDroneOsc2.type = 'sine';
    this.warpDroneOsc2.frequency.setValueAtTime(55.2, now);
    this.warpDroneOsc2.frequency.linearRampToValueAtTime(77.6, now + 2.5);
    this.warpDroneOsc2.frequency.linearRampToValueAtTime(49.2, now + 5.0);
    this.warpDroneOsc2.connect(this.warpDroneGain);
    this.warpDroneOsc2.start(now);

    // 4. Tachyon shimmer harmonics
    this.warpTachyonOsc = this.webAudioCtx.createOscillator();
    this.warpTachyonGain = this.webAudioCtx.createGain();
    this.warpTachyonOsc.type = 'sine';
    this.warpTachyonOsc.frequency.setValueAtTime(960, now);
    this.warpTachyonOsc.frequency.linearRampToValueAtTime(1440, now + 2.5);
    this.warpTachyonOsc.frequency.linearRampToValueAtTime(880, now + 5.0);

    this.warpTachyonGain.gain.setValueAtTime(0.001, now);
    this.warpTachyonGain.gain.linearRampToValueAtTime(0.08, now + 0.6);

    this.warpTachyonOsc.connect(this.warpTachyonGain);
    this.warpTachyonGain.connect(this.webAudioMasterGain);
    this.warpTachyonOsc.start(now);
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
      if (this.warpTachyonGain) {
        this.warpTachyonGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
      }
      const node = this.warpSlipstreamNode;
      const drone = this.warpDroneOsc;
      const drone2 = this.warpDroneOsc2;
      const tachyon = this.warpTachyonOsc;
      setTimeout(() => {
        try {
          node?.stop();
          node?.disconnect();
          drone?.stop();
          drone?.disconnect();
          drone2?.stop();
          drone2?.disconnect();
          tachyon?.stop();
          tachyon?.disconnect();
        } catch {}
      }, 350);
    }
    this.warpSlipstreamNode = null;
    this.warpSlipstreamGain = null;
    this.warpDroneOsc = null;
    this.warpDroneOsc2 = null;
    this.warpDroneGain = null;
    this.warpTachyonOsc = null;
    this.warpTachyonGain = null;
  }

  /**
   * Deceleration sonic snap / drop-out boom upon system arrival
   * Heavy 160 Hz -> 18 Hz sub deceleration thump + noise displacement boom + arrival chime
   */
  public playWarpExit(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
    const now = this.webAudioCtx.currentTime;

    // 1. Heavy low-end deceleration arrival thump (160Hz -> 18Hz)
    const osc = this.webAudioCtx.createOscillator();
    const gain = this.webAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 0.80);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.58, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(gain);
    gain.connect(this.webAudioMasterGain);
    osc.start(now);
    osc.stop(now + 0.90);

    // 2. Energetic displacement arrival shockwave
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.7);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.65);
    const noiseGain = this.webAudioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.01, now);
    noiseGain.gain.linearRampToValueAtTime(0.38, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);

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

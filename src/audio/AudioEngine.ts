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
  private jetSpoolFilter: BiquadFilterNode | null = null;
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

  // Staged Harmonic Scan Audio Nodes
  private scanDroneOsc: OscillatorNode | null = null;
  private scanDroneOsc2: OscillatorNode | null = null;
  private scanDroneGain: GainNode | null = null;
  private scanDroneFilter: BiquadFilterNode | null = null;
  private isScanningActive = false;

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

    // 1. Deep Brownian Noise Buffer for velvet cosmic slipstream and hull mass
    // Generates brownian noise (integrated pink) that has -6dB/octave slope, rich, warm, and free of vacuum hiss
    const bufferSize = this.webAudioCtx.sampleRate * 2;
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.025 * white) / 1.025;
      output[i] = lastOut * 3.6;
    }

    this.jetAirflowNoise = this.webAudioCtx.createBufferSource();
    this.jetAirflowNoise.buffer = noiseBuffer;
    this.jetAirflowNoise.loop = true;

    // A. Cosmic Slipstream Exhaust: steep warm lowpass filter (strictly rolls off above 260Hz)
    this.jetAirflowFilter = this.webAudioCtx.createBiquadFilter();
    this.jetAirflowFilter.type = 'lowpass';
    this.jetAirflowFilter.frequency.setValueAtTime(75, now);
    this.jetAirflowFilter.Q.setValueAtTime(0.8, now);

    this.jetAirflowGain = this.webAudioCtx.createGain();
    this.jetAirflowGain.gain.setValueAtTime(0.05, now); // Soft, velvet background wash

    this.jetAirflowNoise.connect(this.jetAirflowFilter);
    this.jetAirflowFilter.connect(this.jetAirflowGain);
    this.jetAirflowGain.connect(this.thrusterMasterGain);

    // B. Sub-Acoustic Hull Rumble (physical airframe vibration)
    this.jetRumbleFilter = this.webAudioCtx.createBiquadFilter();
    this.jetRumbleFilter.type = 'lowpass';
    this.jetRumbleFilter.frequency.setValueAtTime(55, now);
    this.jetRumbleFilter.Q.setValueAtTime(1.1, now);

    this.jetRumbleGain = this.webAudioCtx.createGain();
    this.jetRumbleGain.gain.setValueAtTime(0.08, now);

    this.jetAirflowNoise.connect(this.jetRumbleFilter);
    this.jetRumbleFilter.connect(this.jetRumbleGain);
    this.jetRumbleGain.connect(this.thrusterMasterGain);

    this.jetAirflowNoise.start(now);

    // 2. Resonant Ion-Plasma Drive (Warm Sci-Fi Harmonic Tone, NO vacuum cleaner whine!)
    // Fundamental Drive: warm triangle wave centered at 88Hz (low F/G fundamental)
    this.jetSpoolOsc = this.webAudioCtx.createOscillator();
    this.jetSpoolOsc.type = 'triangle';
    this.jetSpoolOsc.frequency.setValueAtTime(88, now);

    // Resonant lowpass filter to sculpt warm, analog synthesizer body
    this.jetSpoolFilter = this.webAudioCtx.createBiquadFilter();
    this.jetSpoolFilter.type = 'lowpass';
    this.jetSpoolFilter.frequency.setValueAtTime(175, now);
    this.jetSpoolFilter.Q.setValueAtTime(2.2, now);

    this.jetSpoolGain = this.webAudioCtx.createGain();
    this.jetSpoolGain.gain.setValueAtTime(0.075, now);

    this.jetSpoolOsc.connect(this.jetSpoolFilter);
    this.jetSpoolFilter.connect(this.jetSpoolGain);
    this.jetSpoolGain.connect(this.thrusterMasterGain);
    this.jetSpoolOsc.start(now);

    // 3. Secondary Harmonic Shimmer (Fifth interval at 132Hz, silky futuristic ion glow)
    this.jetSpoolOsc2 = this.webAudioCtx.createOscillator();
    this.jetSpoolOsc2.type = 'sine';
    this.jetSpoolOsc2.frequency.setValueAtTime(132, now);

    this.jetSpoolFilter2 = this.webAudioCtx.createBiquadFilter();
    this.jetSpoolFilter2.type = 'bandpass';
    this.jetSpoolFilter2.frequency.setValueAtTime(160, now);
    this.jetSpoolFilter2.Q.setValueAtTime(1.6, now);

    this.jetSpoolGain2 = this.webAudioCtx.createGain();
    this.jetSpoolGain2.gain.setValueAtTime(0.025, now);

    this.jetSpoolOsc2.connect(this.jetSpoolFilter2);
    this.jetSpoolFilter2.connect(this.jetSpoolGain2);
    this.jetSpoolGain2.connect(this.thrusterMasterGain);
    this.jetSpoolOsc2.start(now);

    // 4. Sub-Bass Graviton Core (Dual Detuned Sub-Oscillators for 2Hz-6Hz Acoustic Pulsation)
    this.jetSubOsc = this.webAudioCtx.createOscillator();
    this.jetSubOsc.type = 'triangle';
    this.jetSubOsc.frequency.setValueAtTime(42, now);

    this.jetSubGain = this.webAudioCtx.createGain();
    this.jetSubGain.gain.setValueAtTime(0.12, now); // Deep physical bass mass

    this.jetSubOsc.connect(this.jetSubGain);
    this.jetSubGain.connect(this.thrusterMasterGain);
    this.jetSubOsc.start(now);

    this.jetSubOsc2 = this.webAudioCtx.createOscillator();
    this.jetSubOsc2.type = 'sine';
    this.jetSubOsc2.frequency.setValueAtTime(44.2, now); // ~2.2Hz acoustic throbbing at idle

    this.jetSubGain2 = this.webAudioCtx.createGain();
    this.jetSubGain2.gain.setValueAtTime(0.09, now);

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

    // 1. Sub injection thump (85Hz -> 26Hz deep gravitic punch)
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(85, now);
    subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.32);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.38 * normIntensity, now + 0.035);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    subOsc.connect(subGain);
    subGain.connect(this.webAudioMasterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.36);

    // 2. Plasma combustion surge / thruster whoosh (warm lowpass sweep, NO vacuum cleaner hiss)
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.35);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.03 * white) / 1.03;
      data[i] = lastOut * 3.5;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.08);
    filter.frequency.exponentialRampToValueAtTime(75, now + 0.30);
    filter.Q.setValueAtTime(1.8, now);

    const gain = this.webAudioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24 * normIntensity, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    noise.start(now);
  }

  /**
   * Deceleration transient (retro-thruster vectoring burst, magnetic gas purge, & inertia dampener)
   */
  public playDecelerationTransient(intensity = 0.5): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;
    if (this.webAudioCtx.state === 'suspended') {
      this.webAudioCtx.resume().catch(() => {});
    }
    const now = this.webAudioCtx.currentTime;
    const normIntensity = Math.min(1.0, Math.max(0.25, intensity * 2.0));

    // 1. Retro-thruster muffled plasma purge (warm lowpass downward sweep 160Hz -> 50Hz, NO vacuum hiss!)
    const bufferSize = Math.floor(this.webAudioCtx.sampleRate * 0.38);
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.03 * white) / 1.03;
      data[i] = lastOut * 3.5;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(160, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 0.34);
    filter.Q.setValueAtTime(1.4, now);

    const gain = this.webAudioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18 * normIntensity, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.webAudioMasterGain);
    noise.start(now);

    // 2. Hull inertial damping sub pulse (62Hz -> 22Hz drop)
    const subOsc = this.webAudioCtx.createOscillator();
    const subGain = this.webAudioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(62, now);
    subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.24);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.22 * normIntensity, now + 0.03);
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

    // 1. Spool-up capacitor charge (180Hz -> 480Hz warm harmonic lift)
    const whineOsc = this.webAudioCtx.createOscillator();
    const whineGain = this.webAudioCtx.createGain();
    whineOsc.type = 'triangle';
    whineOsc.frequency.setValueAtTime(180, now);
    whineOsc.frequency.exponentialRampToValueAtTime(480, now + 0.75);

    whineGain.gain.setValueAtTime(0.001, now);
    whineGain.gain.linearRampToValueAtTime(0.12, now + 0.35);
    whineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    whineOsc.connect(whineGain);
    whineGain.connect(this.webAudioMasterGain);
    whineOsc.start(now);
    whineOsc.stop(now + 0.90);

    // 2. Heavy reactor combustion / ignition thud (at now + 0.75s)
    const tIgnition = now + 0.75;
    const thudOsc = this.webAudioCtx.createOscillator();
    const thudGain = this.webAudioCtx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(95, tIgnition);
    thudOsc.frequency.exponentialRampToValueAtTime(28, tIgnition + 0.7);

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
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.03 * white) / 1.03;
      data[i] = lastOut * 3.5;
    }
    const noise = this.webAudioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, tIgnition);
    filter.frequency.exponentialRampToValueAtTime(90, tIgnition + 0.9);
    const gain = this.webAudioCtx.createGain();
    gain.gain.setValueAtTime(0.001, tIgnition);
    gain.gain.linearRampToValueAtTime(0.28, tIgnition + 0.05);
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

    // 1. Cosmic Slipstream Exhaust: sweeps 75Hz -> 250Hz cutoff (deep, smooth, NO high-pitch vacuum hiss!)
    if (this.jetAirflowFilter && this.jetAirflowGain) {
      this.jetAirflowFilter.frequency.setTargetAtTime(75 + t * 175, now, 0.08);
      this.jetAirflowGain.gain.setTargetAtTime(0.05 + t * 0.11, now, 0.08);
    }

    // 2. Sub-Acoustic Hull Resonance: 55Hz -> 95Hz
    if (this.jetRumbleFilter && this.jetRumbleGain) {
      this.jetRumbleFilter.frequency.setTargetAtTime(55 + t * 40, now, 0.09);
      this.jetRumbleGain.gain.setTargetAtTime(0.08 + t * 0.10, now, 0.09);
    }

    // 3. Resonant Ion-Plasma Drive: 88Hz -> 176Hz (warm harmonic octave swell)
    if (this.jetSpoolOsc && this.jetSpoolGain) {
      this.jetSpoolOsc.frequency.setTargetAtTime(88 + t * 88, now, 0.08);
      this.jetSpoolGain.gain.setTargetAtTime(0.075 + t * 0.145, now, 0.08);
    }
    if (this.jetSpoolFilter) {
      this.jetSpoolFilter.frequency.setTargetAtTime(175 + t * 215, now, 0.08);
    }

    // 4. Secondary Harmonic Shimmer: 132Hz -> 264Hz
    if (this.jetSpoolOsc2 && this.jetSpoolGain2) {
      this.jetSpoolOsc2.frequency.setTargetAtTime(132 + t * 132, now, 0.08);
      this.jetSpoolGain2.gain.setTargetAtTime(0.025 + t * 0.045, now, 0.08);
    }
    if (this.jetSpoolFilter2) {
      this.jetSpoolFilter2.frequency.setTargetAtTime(160 + t * 160, now, 0.08);
    }

    // 5. Sub-Bass Graviton Core: sweeps 42Hz -> 76Hz with accelerating 2.2Hz -> 6Hz acoustic pulse
    if (this.jetSubOsc && this.jetSubGain) {
      this.jetSubOsc.frequency.setTargetAtTime(42 + t * 34, now, 0.07);
      this.jetSubGain.gain.setTargetAtTime(0.12 + t * 0.14, now, 0.07);
    }
    if (this.jetSubOsc2 && this.jetSubGain2) {
      this.jetSubOsc2.frequency.setTargetAtTime(44.2 + t * 37.8, now, 0.07);
      this.jetSubGain2.gain.setTargetAtTime(0.09 + t * 0.11, now, 0.07);
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

  public setScanningActive(active: boolean, progress = 0, stage = 0): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) {
      if (this.scanDroneGain) {
        this.scanDroneGain.gain.setValueAtTime(0, this.webAudioCtx?.currentTime || 0);
      }
      return;
    }

    const now = this.webAudioCtx.currentTime;

    if (!active) {
      if (this.scanDroneGain && this.isScanningActive) {
        this.isScanningActive = false;
        this.scanDroneGain.gain.cancelScheduledValues(now);
        this.scanDroneGain.gain.setTargetAtTime(0.0001, now, 0.08);
      }
      return;
    }

    // Lazy init scanning nodes if needed
    if (!this.scanDroneOsc || !this.scanDroneGain) {
      this.scanDroneGain = this.webAudioCtx.createGain();
      this.scanDroneGain.gain.setValueAtTime(0.0001, now);

      this.scanDroneFilter = this.webAudioCtx.createBiquadFilter();
      this.scanDroneFilter.type = 'bandpass';
      this.scanDroneFilter.frequency.setValueAtTime(432, now);
      this.scanDroneFilter.Q.setValueAtTime(3.0, now);

      this.scanDroneOsc = this.webAudioCtx.createOscillator();
      this.scanDroneOsc.type = 'sine';
      this.scanDroneOsc.frequency.setValueAtTime(432, now);

      this.scanDroneOsc2 = this.webAudioCtx.createOscillator();
      this.scanDroneOsc2.type = 'triangle';
      this.scanDroneOsc2.frequency.setValueAtTime(864, now);

      this.scanDroneOsc.connect(this.scanDroneFilter);
      this.scanDroneOsc2.connect(this.scanDroneFilter);
      this.scanDroneFilter.connect(this.scanDroneGain);
      this.scanDroneGain.connect(this.webAudioMasterGain);

      this.scanDroneOsc.start(now);
      this.scanDroneOsc2.start(now);
    }

    this.isScanningActive = true;

    // Modulate pitch and resonance based on stage and progress (Harmonic tuning)
    const baseFreq = 432 + stage * 54;
    const targetFreq = baseFreq + progress * 140;

    this.scanDroneOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
    if (this.scanDroneOsc2) {
      this.scanDroneOsc2.frequency.setTargetAtTime(targetFreq * 1.5, now, 0.05);
    }
    if (this.scanDroneFilter) {
      this.scanDroneFilter.frequency.setTargetAtTime(targetFreq * 1.2, now, 0.05);
    }

    // Volume ramp: gentle onset (~0.12) rising with progress (~0.22)
    const targetGain = 0.12 + Math.min(1, Math.max(0, progress)) * 0.1;
    this.scanDroneGain.gain.setTargetAtTime(targetGain, now, 0.06);
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

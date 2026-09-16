import * as Tone from 'tone';
import { ProceduralMusicGenome, type SystemMusicGenome } from './ProceduralMusicGenome';

export type MusicPhaseContext =
  | 'title'
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
  // 4-Engine thruster cluster
  private thrusterOscs: OscillatorNode[] = [];
  private thrusterGains: GainNode[] = [];
  private ionWhineOscs: OscillatorNode[] = [];
  private ionWhineGains: GainNode[] = [];
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
  }

  // Aggressive Heavy Starfighter Propulsion Nodes
  private thrusterSubFilter: BiquadFilterNode | null = null;
  private thrusterRoarFilter: BiquadFilterNode | null = null;
  private thrusterTurbineOsc: OscillatorNode | null = null;
  private thrusterTurbineGain: GainNode | null = null;
  private thrusterDistortion: WaveShaperNode | null = null;
  private thrusterNoiseNode: AudioBufferSourceNode | null = null;
  private thrusterNoiseGain: GainNode | null = null;
  private thrusterNoiseFilter: BiquadFilterNode | null = null;

  private makeDistortionCurve(amount: number): Float32Array {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  private setupThrusters(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain) return;
    const now = this.webAudioCtx.currentTime;

    // 4-exhaust engine cluster base frequencies (aggressive guttural saw & triangle mix)
    const subFrequencies = [42.0, 43.8, 41.2, 44.5];
    const ionFrequencies = [185.0, 192.0, 180.0, 198.5];

    this.thrusterOscs = [];
    this.thrusterGains = [];
    this.ionWhineOscs = [];
    this.ionWhineGains = [];

    // Master Sub Bass Filter (Punchy low end roar)
    this.thrusterSubFilter = this.webAudioCtx.createBiquadFilter();
    this.thrusterSubFilter.type = 'lowpass';
    this.thrusterSubFilter.frequency.setValueAtTime(180, now);
    this.thrusterSubFilter.Q.setValueAtTime(3.5, now);

    // Warm Analog Distortion Waveshaper for aggressive military/starfighter engine bite
    this.thrusterDistortion = this.webAudioCtx.createWaveShaper();
    this.thrusterDistortion.curve = this.makeDistortionCurve(35) as any;
    this.thrusterDistortion.oversample = '4x';

    this.thrusterSubFilter.connect(this.thrusterDistortion);
    this.thrusterDistortion.connect(this.webAudioMasterGain);

    // 1. Four Guttural Engine Nozzles
    for (let i = 0; i < 4; i++) {
      // Sub rumble oscillator (sawtooth for aggressive engine roar harmonics)
      const sOsc = this.webAudioCtx.createOscillator();
      sOsc.type = 'sawtooth';
      sOsc.frequency.setValueAtTime(subFrequencies[i], now);

      const sGain = this.webAudioCtx.createGain();
      sGain.gain.setValueAtTime(0.02, now); // Quiet idle rumble

      sOsc.connect(sGain);
      sGain.connect(this.thrusterSubFilter);
      sOsc.start(now);

      this.thrusterOscs.push(sOsc);
      this.thrusterGains.push(sGain);

      // Magnetoplasma Ion Whine (triangle with subtle overdrive)
      const iOsc = this.webAudioCtx.createOscillator();
      iOsc.type = 'triangle';
      iOsc.frequency.setValueAtTime(ionFrequencies[i], now);

      const iGain = this.webAudioCtx.createGain();
      iGain.gain.setValueAtTime(0.005, now);

      iOsc.connect(iGain);
      iGain.connect(this.webAudioMasterGain);
      iOsc.start(now);

      this.ionWhineOscs.push(iOsc);
      this.ionWhineGains.push(iGain);
    }

    // 2. High-Thrust Turbo Jet Compressor Scream
    this.thrusterTurbineOsc = this.webAudioCtx.createOscillator();
    this.thrusterTurbineOsc.type = 'sawtooth';
    this.thrusterTurbineOsc.frequency.setValueAtTime(320, now);

    this.thrusterTurbineGain = this.webAudioCtx.createGain();
    this.thrusterTurbineGain.gain.setValueAtTime(0, now);

    this.thrusterRoarFilter = this.webAudioCtx.createBiquadFilter();
    this.thrusterRoarFilter.type = 'bandpass';
    this.thrusterRoarFilter.frequency.setValueAtTime(750, now);
    this.thrusterRoarFilter.Q.setValueAtTime(4.0, now);

    this.thrusterTurbineOsc.connect(this.thrusterRoarFilter);
    this.thrusterRoarFilter.connect(this.thrusterTurbineGain);
    this.thrusterTurbineGain.connect(this.webAudioMasterGain);
    this.thrusterTurbineOsc.start(now);

    // 3. Supersonic Jet Afterburner Exhaust Noise (Aerodynamic Plasma Blowtorch)
    const bufferSize = this.webAudioCtx.sampleRate * 2;
    const noiseBuffer = this.webAudioCtx.createBuffer(1, bufferSize, this.webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.thrusterNoiseNode = this.webAudioCtx.createBufferSource();
    this.thrusterNoiseNode.buffer = noiseBuffer;
    this.thrusterNoiseNode.loop = true;

    this.thrusterNoiseFilter = this.webAudioCtx.createBiquadFilter();
    this.thrusterNoiseFilter.type = 'bandpass';
    this.thrusterNoiseFilter.frequency.setValueAtTime(480, now);
    this.thrusterNoiseFilter.Q.setValueAtTime(1.8, now);

    this.thrusterNoiseGain = this.webAudioCtx.createGain();
    this.thrusterNoiseGain.gain.setValueAtTime(0, now);

    this.thrusterNoiseNode.connect(this.thrusterNoiseFilter);
    this.thrusterNoiseFilter.connect(this.thrusterNoiseGain);
    this.thrusterNoiseGain.connect(this.webAudioMasterGain);
    this.thrusterNoiseNode.start(now);
  }

  public setSystemGenome(systemSeed: number): void {
    this.currentGenome = ProceduralMusicGenome.generateGenome(systemSeed);
    Tone.getTransport().bpm.value = this.currentGenome.bpm;
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
  public playTitleOverture(): void {
    if (this.isOverturePlaying) return;
    this.isOverturePlaying = true;
    this.setContext('title');

    if (this.loopSequenceId !== null) {
      clearInterval(this.loopSequenceId);
      this.loopSequenceId = null;
    }

    const overtureMovements = [
      // 1. VOID (0 - 16s): Eb1 drone, gentle resonance
      {
        durationMs: 16000,
        pad: ['Eb3', 'Bb3'],
        bass: 'Eb2',
        melody: ['Eb4', 'Bb4'],
        filterFreq: 1200,
        padVol: -16,
      },
      // 2. AWAKENING (16 - 32s): Ebmaj9 expansion
      {
        durationMs: 16000,
        pad: ['Eb3', 'G3', 'Bb3', 'D4'],
        bass: 'Eb2',
        melody: ['G4', 'Bb4', 'D5', 'F5'],
        filterFreq: 1800,
        padVol: -13,
      },
      // 3. EXPANSION (32 - 48s): Cm9 to Abmaj7(#11)
      {
        durationMs: 16000,
        pad: ['C3', 'G3', 'Bb3', 'Eb4'],
        bass: 'C2',
        melody: ['Eb5', 'D5', 'Bb4', 'G4'],
        filterFreq: 2400,
        padVol: -11,
      },
      // 4. THEME (48 - 68s): Aurelia Lydian theme
      {
        durationMs: 20000,
        pad: ['Ab2', 'Eb3', 'G3', 'C4'],
        bass: 'Ab1',
        melody: ['C5', 'D5', 'Eb5', 'G5', 'F5', 'D5'],
        filterFreq: 3000,
        padVol: -10,
      },
      // 5. RELEASE (68s+): Soft Bb suspended into quiet loop
      {
        durationMs: 16000,
        pad: ['Bb2', 'F3', 'Bb3', 'D4'],
        bass: 'Bb1',
        melody: ['F5', 'D5', 'Bb4'],
        filterFreq: 2200,
        padVol: -14,
      },
    ];

    let movementIndex = 0;

    const playMovement = () => {
      if (!this.isOverturePlaying || this.isMuted || !this.padSynth) return;

      const mov = overtureMovements[movementIndex % overtureMovements.length];
      const now = Tone.now();

      if (this.filter) {
        this.filter.frequency.rampTo(mov.filterFreq, 3.0);
      }
      this.padSynth.volume.rampTo(mov.padVol, 2.0);
      this.padSynth.triggerAttackRelease(mov.pad, '1m', now);

      if (this.bassSynth && mov.bass) {
        this.bassSynth.triggerAttackRelease(mov.bass, '1m', now);
      }

      if (this.leadSynth && mov.melody.length > 0) {
        mov.melody.forEach((note, i) => {
          this.leadSynth?.triggerAttackRelease(note, '2n', now + 1.5 + i * 2.2);
        });
      }

      movementIndex++;
      this.overtureTimerId = window.setTimeout(playMovement, mov.durationMs);
    };

    playMovement();
  }

  public playTitleMusic(): void {
    if (this.isOverturePlaying) return;
    this.playTitleOverture();
  }

  public stopTitleOverture(): void {
    this.isOverturePlaying = false;
    if (this.overtureTimerId !== null) {
      clearTimeout(this.overtureTimerId);
      this.overtureTimerId = null;
    }
  }

  public setContext(context: MusicPhaseContext): void {
    this.currentContext = context;
    if (!this.filter) return;

    if (context !== 'title' && this.isOverturePlaying) {
      this.stopTitleOverture();
      this.startMusicSequencer();
    }

    switch (context) {
      case 'title':
      case 'cruise':
        this.filter.frequency.rampTo(2400, 0.6);
        if (this.padSynth) this.padSynth.volume.rampTo(-12, 0.5);
        if (this.bassSynth) this.bassSynth.volume.rampTo(-10, 0.5);
        break;
      case 'approach':
        this.filter.frequency.rampTo(1600, 0.6);
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

    // Generative chord progressions
    const chords = [
      ['Eb3', 'G3', 'Bb3', 'D4'],
      ['C3', 'Eb3', 'G3', 'Bb3'],
      ['Ab2', 'Eb3', 'Ab3', 'C4'],
      ['Bb2', 'F3', 'Bb3', 'D4'],
    ];

    const leadNotes = ['Eb4', 'G4', 'Bb4', 'D5', 'C5', 'F5'];

    this.loopSequenceId = window.setInterval(() => {
      if (this.isMuted || !this.padSynth || this.isOverturePlaying) return;

      const chord = chords[this.stepIndex % chords.length];
      const time = Tone.now();

      // Trigger chord pad
      this.padSynth.triggerAttackRelease(chord, '2n', time);

      // Trigger bass note
      if (this.bassSynth && this.stepIndex % 2 === 0) {
        this.bassSynth.triggerAttackRelease(chord[0], '1n', time);
      }

      // Trigger generative melodic lead arpeggio
      if (this.leadSynth && this.currentContext !== 'entry') {
        const note = leadNotes[(this.stepIndex * 3) % leadNotes.length];
        this.leadSynth.triggerAttackRelease(note, '8n', time + 0.4);
      }

      this.stepIndex++;
    }, 2400);
  }

  public updateThrottle(throttle: number): void {
    if (!this.webAudioCtx || this.thrusterGains.length === 0) return;

    const t = Math.max(0, Math.min(1, throttle));
    const now = this.webAudioCtx.currentTime;

    // Sub-bass heavy starfighter rumble across 4 exhausts
    const baseFreqs = [42.0, 43.8, 41.2, 44.5];
    const ionFreqs = [185.0, 192.0, 180.0, 198.5];

    // Ramp master sub bass filter cutoff upward as throttle increases for thunderous bite
    if (this.thrusterSubFilter) {
      this.thrusterSubFilter.frequency.setTargetAtTime(140 + t * 450, now, 0.08);
    }

    for (let i = 0; i < 4; i++) {
      if (this.thrusterOscs[i]) {
        // Base frequency aggressive octave pitch rise under heavy throttle
        this.thrusterOscs[i].frequency.setTargetAtTime(baseFreqs[i] + t * 68, now, 0.10);
      }
      if (this.thrusterGains[i]) {
        // High gain for gut-rumbling low end
        this.thrusterGains[i].gain.setTargetAtTime((0.02 + t * 0.42) / 4.0, now, 0.10);
      }
      if (this.ionWhineOscs[i]) {
        this.ionWhineOscs[i].frequency.setTargetAtTime(ionFreqs[i] + t * 720, now, 0.12);
      }
      if (this.ionWhineGains[i]) {
        this.ionWhineGains[i].gain.setTargetAtTime((0.005 + t * 0.12) / 4.0, now, 0.12);
      }
    }

    // High-thrust turbine compressor scream (piercing jet whine)
    if (this.thrusterTurbineOsc && this.thrusterTurbineGain && this.thrusterRoarFilter) {
      this.thrusterTurbineOsc.frequency.setTargetAtTime(320 + t * 1450, now, 0.14);
      this.thrusterRoarFilter.frequency.setTargetAtTime(750 + t * 1800, now, 0.14);
      this.thrusterTurbineGain.gain.setTargetAtTime(t * 0.16, now, 0.10);
    }

    // Supersonic plasma exhaust blowtorch noise (afterburner roar)
    if (this.thrusterNoiseGain && this.thrusterNoiseFilter) {
      this.thrusterNoiseFilter.frequency.setTargetAtTime(450 + t * 2400, now, 0.08);
      this.thrusterNoiseFilter.Q.setTargetAtTime(1.5 + t * 2.5, now, 0.08);
      this.thrusterNoiseGain.gain.setTargetAtTime(t * 0.22, now, 0.08);
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

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

  private setupThrusters(): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain) return;
    const now = this.webAudioCtx.currentTime;

    // 4-exhaust engine cluster detuned base frequencies for acoustic richness
    const subFrequencies = [52.0, 54.2, 53.8, 55.5];
    const ionFrequencies = [240.0, 243.5, 238.0, 245.2];

    this.thrusterOscs = [];
    this.thrusterGains = [];
    this.ionWhineOscs = [];
    this.ionWhineGains = [];

    const subMasterFilter = this.webAudioCtx.createBiquadFilter();
    subMasterFilter.type = 'lowpass';
    subMasterFilter.frequency.setValueAtTime(140, now);
    subMasterFilter.connect(this.webAudioMasterGain);

    for (let i = 0; i < 4; i++) {
      // Sub rumble
      const sOsc = this.webAudioCtx.createOscillator();
      sOsc.type = 'triangle';
      sOsc.frequency.setValueAtTime(subFrequencies[i], now);

      const sGain = this.webAudioCtx.createGain();
      sGain.gain.setValueAtTime(0, now);

      sOsc.connect(sGain);
      sGain.connect(subMasterFilter);
      sOsc.start(now);

      this.thrusterOscs.push(sOsc);
      this.thrusterGains.push(sGain);

      // Ion whine harmonic
      const iOsc = this.webAudioCtx.createOscillator();
      iOsc.type = 'sine';
      iOsc.frequency.setValueAtTime(ionFrequencies[i], now);

      const iGain = this.webAudioCtx.createGain();
      iGain.gain.setValueAtTime(0, now);

      iOsc.connect(iGain);
      iGain.connect(this.webAudioMasterGain);
      iOsc.start(now);

      this.ionWhineOscs.push(iOsc);
      this.ionWhineGains.push(iGain);
    }
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

    // Sub rumble ramps across all 4 exhausts
    const baseFreqs = [52.0, 54.2, 53.8, 55.5];
    const ionFreqs = [240.0, 243.5, 238.0, 245.2];

    for (let i = 0; i < 4; i++) {
      if (this.thrusterOscs[i]) {
        this.thrusterOscs[i].frequency.setTargetAtTime(baseFreqs[i] + t * 45, now, 0.12);
      }
      if (this.thrusterGains[i]) {
        this.thrusterGains[i].gain.setTargetAtTime((t * 0.18) / 4.0, now, 0.12);
      }
      if (this.ionWhineOscs[i]) {
        this.ionWhineOscs[i].frequency.setTargetAtTime(ionFreqs[i] + t * 480, now, 0.15);
      }
      if (this.ionWhineGains[i]) {
        this.ionWhineGains[i].gain.setTargetAtTime((t * 0.08) / 4.0, now, 0.15);
      }
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

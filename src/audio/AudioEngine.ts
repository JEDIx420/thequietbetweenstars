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
  // Jet Propulsion Engine Nodes (Aerodynamic Bypass Whoosh, Deep Body Displacement & Quiet Spool)
  private jetAirflowNoise: AudioBufferSourceNode | null = null;
  private jetAirflowFilter: BiquadFilterNode | null = null;
  private jetAirflowGain: GainNode | null = null;
  private jetRumbleFilter: BiquadFilterNode | null = null;
  private jetRumbleGain: GainNode | null = null;
  private jetSpoolOsc: OscillatorNode | null = null;
  private jetSpoolGain: GainNode | null = null;
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

    if (context !== 'title') {
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
    if (this.isMuted || !this.padSynth) return;

    // Generative peaceful cosmic chord progression
    const chords = [
      ['Eb3', 'G3', 'Bb3', 'D4'],
      ['C3', 'Eb3', 'G3', 'Bb3'],
      ['Ab2', 'Eb3', 'Ab3', 'C4'],
      ['Bb2', 'F3', 'Bb3', 'D4'],
    ];

    const leadNotes = ['Eb4', 'G4', 'Bb4', 'D5', 'C5', 'F5'];

    const playStep = () => {
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
    };

    // Play immediately on start
    playStep();
    this.loopSequenceId = window.setInterval(playStep, 2400);
  }

  public updateThrottle(throttle: number): void {
    if (!this.webAudioCtx || !this.webAudioMasterGain || this.isMuted) return;

    const t = Math.max(0, Math.min(1, throttle));
    const now = this.webAudioCtx.currentTime;

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

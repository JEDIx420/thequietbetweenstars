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
  private thrusterGain: GainNode | null = null;
  private thrusterOsc: OscillatorNode | null = null;
  private ionWhineOsc: OscillatorNode | null = null;
  private ionWhineGain: GainNode | null = null;

  private loopSequenceId: number | null = null;
  private stepIndex = 0;

  public async start(): Promise<void> {
    // 1. Initialize Tone.js
    await Tone.start();
    Tone.getTransport().bpm.value = 96;

    if (!this.padSynth) {
      this.reverb = new Tone.Reverb({ decay: 4.5, wet: 0.35 }).toDestination();
      this.delay = new Tone.FeedbackDelay('8n', 0.25).connect(this.reverb);
      this.filter = new Tone.Filter(2600, 'lowpass').connect(this.delay);

      this.padSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 1.2, decay: 1.8, sustain: 0.7, release: 2.5 },
      }).connect(this.filter);
      this.padSynth.volume.value = -12;

      this.bassSynth = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.1, decay: 0.4, sustain: 0.6, release: 0.8 },
        filterEnvelope: { attack: 0.05, decay: 0.3, sustain: 0.4, baseFrequency: 80, octaves: 2.5 },
      }).connect(this.filter);
      this.bassSynth.volume.value = -10;

      this.leadSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.05, decay: 0.4, sustain: 0.3, release: 1.2 },
      }).connect(this.delay);
      this.leadSynth.volume.value = -14;

      this.ambientNoise = new Tone.Noise('pink');
      const noiseFilter = new Tone.Filter(400, 'lowpass').connect(this.reverb);
      this.ambientNoise.connect(noiseFilter);
      this.ambientNoise.volume.value = -32;
      this.ambientNoise.start();
    }

    // 2. Initialize low-latency Web Audio for procedural ship thrusters & sound FX
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

    // Sub-bass rumble
    this.thrusterOsc = this.webAudioCtx.createOscillator();
    this.thrusterOsc.type = 'triangle';
    this.thrusterOsc.frequency.setValueAtTime(54, now);

    this.thrusterGain = this.webAudioCtx.createGain();
    this.thrusterGain.gain.setValueAtTime(0, now);

    const subFilter = this.webAudioCtx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(120, now);

    this.thrusterOsc.connect(subFilter);
    subFilter.connect(this.thrusterGain);
    this.thrusterGain.connect(this.webAudioMasterGain);
    this.thrusterOsc.start(now);

    // Ion whine harmonic
    this.ionWhineOsc = this.webAudioCtx.createOscillator();
    this.ionWhineOsc.type = 'sine';
    this.ionWhineOsc.frequency.setValueAtTime(240, now);

    this.ionWhineGain = this.webAudioCtx.createGain();
    this.ionWhineGain.gain.setValueAtTime(0, now);

    this.ionWhineOsc.connect(this.ionWhineGain);
    this.ionWhineGain.connect(this.webAudioMasterGain);
    this.ionWhineOsc.start(now);
  }

  public setSystemGenome(systemSeed: number): void {
    this.currentGenome = ProceduralMusicGenome.generateGenome(systemSeed);
    Tone.getTransport().bpm.value = this.currentGenome.bpm;
  }

  public playTitleMusic(): void {
    this.setContext('title');
    this.startMusicSequencer();
  }

  public setContext(context: MusicPhaseContext): void {
    this.currentContext = context;
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

    // Generative chord progressions
    const chords = [
      ['Eb3', 'G3', 'Bb3', 'D4'],
      ['C3', 'Eb3', 'G3', 'Bb3'],
      ['Ab2', 'Eb3', 'Ab3', 'C4'],
      ['Bb2', 'F3', 'Bb3', 'D4'],
    ];

    const leadNotes = ['Eb4', 'G4', 'Bb4', 'D5', 'C5', 'F5'];

    this.loopSequenceId = window.setInterval(() => {
      if (this.isMuted || !this.padSynth) return;

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
    if (!this.webAudioCtx || !this.thrusterGain || !this.thrusterOsc || !this.ionWhineGain || !this.ionWhineOsc) return;

    const t = Math.max(0, Math.min(1, throttle));
    const now = this.webAudioCtx.currentTime;

    // Sub rumble ramps with throttle
    this.thrusterOsc.frequency.setTargetAtTime(54 + t * 45, now, 0.12);
    this.thrusterGain.gain.setTargetAtTime(t * 0.18, now, 0.12);

    // Ion whine frequency & volume ramp
    this.ionWhineOsc.frequency.setTargetAtTime(240 + t * 480, now, 0.15);
    this.ionWhineGain.gain.setTargetAtTime(t * 0.08, now, 0.15);
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

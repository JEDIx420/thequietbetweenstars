/**
 * Procedural Space Synth & Ambient EDM Generative Audio Engine
 * Pure Web Audio API synthesis without external audio file dependencies.
 *
 * Implements:
 * - Inspiring Ambient EDM Title Theme (~96 BPM) with warm polyphonic pads, analog bassline,
 *   subtle electronic percussion pulse, and sparkling celestial arpeggios.
 * - Dynamic flight-phase music context layers (TITLE, CRUISE, APPROACH, ORBIT, ENTRY, SURFACE).
 * - Dynamic engine hum modulated by throttle.
 * - Resonant scan sweeps, collision deflections, and UI feedback tones.
 */

export type MusicPhaseContext =
  | 'title'
  | 'cruise'
  | 'approach'
  | 'orbit'
  | 'entry'
  | 'surface';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = false;
  private masterVolume = 0.72;

  // Active music mode
  private currentContext: MusicPhaseContext = 'title';

  // Synth nodes
  private musicBus: GainNode | null = null;
  private padGain: GainNode | null = null;
  private bassGain: GainNode | null = null;
  private leadGain: GainNode | null = null;
  private beatGain: GainNode | null = null;
  private droneGain: GainNode | null = null;

  // Master music filter
  private musicFilter: BiquadFilterNode | null = null;

  // Dynamic thruster synthesis
  private thrusterGain: GainNode | null = null;
  private thrusterOsc: OscillatorNode | null = null;

  // Sequencer loop timer
  private sequencerTimer: number | null = null;
  private beatCount = 0;

  public async start(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[Audio] Web Audio API not supported.');
        return;
      }
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.setupAudioBuses();
      this.setupThrusters();
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('[Audio] Autoplay policy prevented resume until user interaction.', err);
      }
    }
  }

  private setupAudioBuses(): void {
    if (!this.ctx || !this.masterGain) return;

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.setValueAtTime(3200, this.ctx.currentTime);
    this.musicFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.masterGain);

    // Sub-channel buses
    this.padGain = this.ctx.createGain();
    this.padGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
    this.padGain.connect(this.musicBus);

    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    this.bassGain.connect(this.musicBus);

    this.leadGain = this.ctx.createGain();
    this.leadGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    this.leadGain.connect(this.musicBus);

    this.beatGain = this.ctx.createGain();
    this.beatGain.gain.setValueAtTime(0.16, this.ctx.currentTime);
    this.beatGain.connect(this.musicBus);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.20, this.ctx.currentTime);
    this.droneGain.connect(this.musicBus);
  }

  /**
   * Generative EDM / Synth Space Sequencer (~96 BPM = 625ms per quarter-note, 156ms sixteenth)
   */
  public playTitleMusic(): void {
    if (!this.ctx || !this.masterGain) return;
    this.setContext('title');

    if (this.sequencerTimer !== null) return;

    // Harmonic progression in Eb Major / C Minor
    // Chords: Ebmaj9 (Eb-G-Bb-D), Cm9 (C-Eb-G-Bb-D), Abmaj7 (Ab-C-Eb-G), Bbadd9 (Bb-D-F-C)
    const chordRoots = [155.56, 130.81, 103.83, 116.54]; // Bass fundamentals
    const chordFrequencies = [
      [155.56, 196.00, 233.08, 293.66], // Eb3, G3, Bb3, D4
      [130.81, 155.56, 196.00, 233.08], // C3, Eb3, G3, Bb3
      [103.83, 155.56, 207.65, 233.08], // Ab2, Eb3, Ab3, Bb3
      [116.54, 174.61, 233.08, 261.63], // Bb2, F3, Bb3, C4
    ];

    // Melodic pentatonic motives
    const leadMotifs = [
      [311.13, 392.00, 466.16, 587.33], // Eb4, G4, Bb4, D5
      [523.25, 466.16, 392.00, 311.13], // C5, Bb4, G4, Eb4
      [392.00, 466.16, 523.25, 587.33], // G4, Bb4, C5, D5
      [622.25, 587.33, 466.16, 392.00], // Eb5, D5, Bb4, G4
    ];

    const sixteenthMs = 156;

    this.sequencerTimer = window.setInterval(() => {
      if (!this.ctx || this.isMuted) return;

      const now = this.ctx.currentTime;
      const step16 = this.beatCount % 64; // 4-bar phrase (16 sixteenth notes per bar)
      const bar = Math.floor(step16 / 16);
      const stepInBar = step16 % 16;

      // 1. Kick & Soft Percussion Pulse on Quarter Notes (steps 0, 4, 8, 12)
      if (stepInBar % 4 === 0) {
        if (this.currentContext === 'title' || this.currentContext === 'cruise') {
          this.triggerKick(now);
        }
      }

      // 2. Gentle Hi-Hat / Shimmer on 16ths
      if (stepInBar % 2 === 1 && (this.currentContext === 'title' || this.currentContext === 'cruise')) {
        this.triggerHat(now);
      }

      // 3. Sustained Pad Chords (every bar on step 0)
      if (stepInBar === 0) {
        const chord = chordFrequencies[bar];
        this.triggerPadChord(chord, now);
      }

      // 4. Synth Bassline on quarter beats
      if (stepInBar % 4 === 0) {
        const root = chordRoots[bar];
        this.triggerBass(root, now);
      }

      // 5. Crystalline Arpeggio Lead
      if (stepInBar % 2 === 0) {
        const motif = leadMotifs[bar];
        const note = motif[(stepInBar / 2) % motif.length];
        this.triggerLeadArp(note, now);
      }

      this.beatCount++;
    }, sixteenthMs);
  }

  private triggerKick(time: number): void {
    if (!this.ctx || !this.beatGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);

    gain.gain.setValueAtTime(0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.beatGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private triggerHat(time: number): void {
    if (!this.ctx || !this.beatGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'highpass' as any;
    osc.frequency.setValueAtTime(7000, time);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    gain.gain.setValueAtTime(0.04, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.beatGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private triggerPadChord(frequencies: number[], time: number): void {
    if (!this.ctx || !this.padGain) return;
    for (const freq of frequencies) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.05, time + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);

      osc.connect(gain);
      gain.connect(this.padGain);
      osc.start(time);
      osc.stop(time + 2.5);
    }
  }

  private triggerBass(frequency: number, time: number): void {
    if (!this.ctx || !this.bassGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency / 2, time);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, time);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bassGain);
    osc.start(time);
    osc.stop(time + 0.38);
  }

  private triggerLeadArp(freq: number, time: number): void {
    if (!this.ctx || !this.leadGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.07, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);

    osc.connect(gain);
    gain.connect(this.leadGain);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  /**
   * Set musical context according to current flight phase
   */
  public setContext(context: MusicPhaseContext): void {
    this.currentContext = context;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (!this.padGain || !this.bassGain || !this.beatGain || !this.leadGain || !this.musicFilter) return;

    switch (context) {
      case 'title':
        this.musicFilter.frequency.setTargetAtTime(3200, now, 0.5);
        this.padGain.gain.setTargetAtTime(0.28, now, 0.5);
        this.bassGain.gain.setTargetAtTime(0.22, now, 0.5);
        this.leadGain.gain.setTargetAtTime(0.18, now, 0.5);
        this.beatGain.gain.setTargetAtTime(0.16, now, 0.5);
        break;

      case 'cruise':
        this.musicFilter.frequency.setTargetAtTime(2400, now, 0.5);
        this.padGain.gain.setTargetAtTime(0.24, now, 0.5);
        this.bassGain.gain.setTargetAtTime(0.18, now, 0.5);
        this.leadGain.gain.setTargetAtTime(0.14, now, 0.5);
        this.beatGain.gain.setTargetAtTime(0.12, now, 0.5);
        break;

      case 'approach':
        this.musicFilter.frequency.setTargetAtTime(1600, now, 0.5);
        this.padGain.gain.setTargetAtTime(0.30, now, 0.5);
        this.bassGain.gain.setTargetAtTime(0.22, now, 0.5);
        this.leadGain.gain.setTargetAtTime(0.10, now, 0.5);
        this.beatGain.gain.setTargetAtTime(0.06, now, 0.5);
        break;

      case 'orbit':
        // Lyrical, ethereal arpeggio focus with soft filtered pad
        this.musicFilter.frequency.setTargetAtTime(2800, now, 0.5);
        this.padGain.gain.setTargetAtTime(0.32, now, 0.5);
        this.bassGain.gain.setTargetAtTime(0.10, now, 0.5);
        this.leadGain.gain.setTargetAtTime(0.22, now, 0.5);
        this.beatGain.gain.setTargetAtTime(0.02, now, 0.5);
        break;

      case 'entry':
        // Lowpass muffled atmospheric re-entry tension
        this.musicFilter.frequency.setTargetAtTime(900, now, 0.5);
        this.padGain.gain.setTargetAtTime(0.36, now, 0.5);
        this.bassGain.gain.setTargetAtTime(0.30, now, 0.5);
        this.leadGain.gain.setTargetAtTime(0.05, now, 0.5);
        this.beatGain.gain.setTargetAtTime(0.18, now, 0.5);
        break;

      case 'surface':
        // Warm ground reconnaissance atmosphere
        this.musicFilter.frequency.setTargetAtTime(2200, now, 0.5);
        this.padGain.gain.setTargetAtTime(0.26, now, 0.5);
        this.bassGain.gain.setTargetAtTime(0.16, now, 0.5);
        this.leadGain.gain.setTargetAtTime(0.15, now, 0.5);
        this.beatGain.gain.setTargetAtTime(0.08, now, 0.5);
        break;
    }
  }

  private setupThrusters(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    this.thrusterOsc = this.ctx.createOscillator();
    this.thrusterOsc.type = 'triangle';
    this.thrusterOsc.frequency.setValueAtTime(58, now);

    this.thrusterGain = this.ctx.createGain();
    this.thrusterGain.gain.setValueAtTime(0, now);

    const thrusterFilter = this.ctx.createBiquadFilter();
    thrusterFilter.type = 'lowpass';
    thrusterFilter.frequency.setValueAtTime(120, now);

    this.thrusterOsc.connect(thrusterFilter);
    thrusterFilter.connect(this.thrusterGain);
    this.thrusterGain.connect(this.masterGain);
    this.thrusterOsc.start(now);
  }

  public updateThrottle(throttle: number): void {
    if (!this.ctx || !this.thrusterGain || !this.thrusterOsc) return;

    const t = Math.max(0, Math.min(1, throttle));
    const now = this.ctx.currentTime;

    this.thrusterOsc.frequency.setTargetAtTime(58 + t * 52, now, 0.12);
    this.thrusterGain.gain.setTargetAtTime(t * 0.16, now, 0.12);
  }

  public playScanEffect(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

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
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 2.0);
  }

  public playCollisionDeflection(isDanger = false): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isDanger ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isDanger ? 140 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(isDanger ? 60 : 160, now + 0.3);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playBlip(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playConnectChime(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }
}

export const audio = new AudioEngine();

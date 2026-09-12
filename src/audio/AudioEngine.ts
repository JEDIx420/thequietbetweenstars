/**
 * THE QUIET BETWEEN STARS — Procedural Web Audio Engine
 * Generates an inspiring procedural title theme, in-flight cosmic bed, and tactile sci-fi sound design.
 */

export type AudioMode = 'idle' | 'title' | 'in_flight';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = false;
  private masterVolume = 0.7;
  private currentMode: AudioMode = 'idle';

  // Title music nodes
  private titleGain: GainNode | null = null;
  private titleInterval: number | null = null;
  private titleOscillators: OscillatorNode[] = [];

  // In-flight ambience nodes
  private flightGain: GainNode | null = null;
  private flightOscillators: OscillatorNode[] = [];
  private flightFilter: BiquadFilterNode | null = null;
  private flightLfo: OscillatorNode | null = null;

  // Dynamic thruster synthesis
  private thrusterGain: GainNode | null = null;
  private thrusterOsc: OscillatorNode | null = null;

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
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Title Screen Theme: Spacious, inspiring, gentle melodic arpeggios & warm pads
   */
  public playTitleMusic(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.currentMode === 'title') return;

    this.currentMode = 'title';
    this.fadeOutInFlightAmbience(1.5);

    const now = this.ctx.currentTime;
    this.titleGain = this.ctx.createGain();
    this.titleGain.gain.setValueAtTime(0.001, now);
    this.titleGain.gain.linearRampToValueAtTime(0.26, now + 2.0);
    this.titleGain.connect(this.masterGain);

    // Warm Chord Pad Progression in Eb Major (Ebmaj9 -> Cm9 -> Abmaj7 -> Bbadd9)
    const chordPads = [
      [155.56, 196.00, 233.08, 293.66], // Eb3, G3, Bb3, D4
      [130.81, 155.56, 196.00, 233.08], // C3, Eb3, G3, Bb3
      [103.83, 155.56, 207.65, 233.08], // Ab2, Eb3, Ab3, Bb3
      [116.54, 174.61, 233.08, 261.63], // Bb2, F3, Bb3, C4
    ];

    let chordIndex = 0;
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(320, now);
    padFilter.Q.setValueAtTime(1.8, now);
    padFilter.connect(this.titleGain);

    // Melodic Motifs (Pentatonic celestial arpeggio: Eb4, G4, Bb4, D5, C5, Bb4, G4, F4)
    const melodyNotes = [311.13, 392.00, 466.16, 587.33, 523.25, 466.16, 392.00, 349.23];
    let noteIndex = 0;

    // Trigger melodic notes in an ambient tempo
    this.titleInterval = window.setInterval(() => {
      if (!this.ctx || !this.titleGain || this.currentMode !== 'title') return;

      const t = this.ctx.currentTime;
      const freq = melodyNotes[noteIndex % melodyNotes.length];
      noteIndex++;

      // Cycle background chord every 8 melody beats
      if (noteIndex % 8 === 0) {
        chordIndex = (chordIndex + 1) % chordPads.length;
        const currentChord = chordPads[chordIndex];
        padFilter.frequency.linearRampToValueAtTime(380 + Math.random() * 60, t + 1.5);

        // Sustained pad notes
        currentChord.forEach((padFreq) => {
          if (!this.ctx || !this.titleGain) return;
          const padOsc = this.ctx.createOscillator();
          const padGain = this.ctx.createGain();

          padOsc.type = 'triangle';
          padOsc.frequency.setValueAtTime(padFreq, t);

          padGain.gain.setValueAtTime(0.001, t);
          padGain.gain.linearRampToValueAtTime(0.04, t + 1.2);
          padGain.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);

          padOsc.connect(padGain);
          padGain.connect(padFilter);

          padOsc.start(t);
          padOsc.stop(t + 7.8);
          this.titleOscillators.push(padOsc);
        });
      }

      // Play soft crystalline arpeggio note
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      // Delicate bell-like envelope with decay
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);

      osc.connect(gain);
      gain.connect(padFilter);

      osc.start(t);
      osc.stop(t + 1.9);
      this.titleOscillators.push(osc);
    }, 620);
  }

  /**
   * Exploration Mode: Deep breathing drone, spatial stereo texture, responsive thrusters
   */
  public playInFlightAmbience(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.currentMode === 'in_flight') return;

    this.currentMode = 'in_flight';
    this.fadeOutTitleMusic(2.0);

    const now = this.ctx.currentTime;
    this.flightGain = this.ctx.createGain();
    this.flightGain.gain.setValueAtTime(0.001, now);
    this.flightGain.gain.linearRampToValueAtTime(0.24, now + 2.5);
    this.flightGain.connect(this.masterGain);

    // Filter with LFO breathing
    this.flightFilter = this.ctx.createBiquadFilter();
    this.flightFilter.type = 'lowpass';
    this.flightFilter.frequency.setValueAtTime(260, now);
    this.flightFilter.Q.setValueAtTime(2.2, now);
    this.flightFilter.connect(this.flightGain);

    this.flightLfo = this.ctx.createOscillator();
    this.flightLfo.type = 'sine';
    this.flightLfo.frequency.setValueAtTime(0.04, now); // ~25 second period
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(95, now);
    this.flightLfo.connect(lfoGain);
    lfoGain.connect(this.flightFilter.frequency);
    this.flightLfo.start(now);

    // Warm deep chord bed: A1 (55Hz), E2 (82.4Hz), A2 (110Hz), C#3 (138.6Hz)
    const freqs = [55, 55.4, 82.4, 110, 110.5, 138.6];
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.flightFilter) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.18 / freqs.length, now);

      osc.connect(oscGain);
      oscGain.connect(this.flightFilter);
      osc.start(now);
      this.flightOscillators.push(osc);
    });

    // Dynamic Thruster Synthesis
    this.setupThrusters();
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

    // Pitch rises smoothly with thrust: 58Hz up to 110Hz
    this.thrusterOsc.frequency.setTargetAtTime(58 + t * 52, now, 0.12);
    // Purr volume rises with throttle
    this.thrusterGain.gain.setTargetAtTime(t * 0.16, now, 0.12);
  }

  public playScanEffect(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    // Resonance frequency sweep: 220 -> 620 -> 310
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(622.25, now + 0.38); // Eb5
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
    const filter = this.ctx.createBiquadFilter();

    osc.type = isDanger ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isDanger ? 120 : 82, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isDanger ? 350 : 160, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isDanger ? 0.22 : 0.14, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  public playConnectChime(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    // Eb5, G5, Bb5, Eb6
    [311.13, 392.00, 466.16, 622.25].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const noteTime = now + i * 0.11;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.16, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.65);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.7);
    });
  }

  public playBlip(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.06); // A5

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  private fadeOutTitleMusic(duration: number): void {
    if (!this.ctx || !this.titleGain) return;

    const now = this.ctx.currentTime;
    this.titleGain.gain.setValueAtTime(this.titleGain.gain.value, now);
    this.titleGain.gain.linearRampToValueAtTime(0.001, now + duration);

    if (this.titleInterval !== null) {
      clearInterval(this.titleInterval);
      this.titleInterval = null;
    }
  }

  private fadeOutInFlightAmbience(duration: number): void {
    if (!this.ctx || !this.flightGain) return;

    const now = this.ctx.currentTime;
    this.flightGain.gain.setValueAtTime(this.flightGain.gain.value, now);
    this.flightGain.gain.linearRampToValueAtTime(0.001, now + duration);
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getCurrentMode(): AudioMode {
    return this.currentMode;
  }
}

export const audio = new AudioEngine();

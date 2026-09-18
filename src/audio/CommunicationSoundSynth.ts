export type SpeakerAcousticProfile =
  | 'ship_ai'
  | 'dr_vance'
  | 'captain_zephyr'
  | 'titan'
  | 'anomaly'
  | 'station_control'
  | 'default';

export class CommunicationSoundSynth {
  private static instance: CommunicationSoundSynth | null = null;
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // 5-note Resonance Leitmotif frequencies (D maj9 arpeggio: D4, F#4, A4, C#5, E5)
  public static readonly LEITMOTIF_FREQUENCIES = [293.66, 369.99, 440.0, 554.37, 659.25];

  public static getInstance(): CommunicationSoundSynth {
    if (!CommunicationSoundSynth.instance) {
      CommunicationSoundSynth.instance = new CommunicationSoundSynth();
    }
    return CommunicationSoundSynth.instance;
  }

  public init(existingCtx?: AudioContext): void {
    if (this.audioCtx) return;

    if (existingCtx) {
      this.audioCtx = existingCtx;
    } else if (typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }

    if (this.audioCtx) {
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
    }
  }

  private ensureAudio(): boolean {
    if (!this.audioCtx) {
      this.init();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return !!(this.audioCtx && this.masterGain);
  }

  public resolveProfile(speakerIdOrName: string): SpeakerAcousticProfile {
    const s = speakerIdOrName.toLowerCase();
    if (s.includes('ship') || s.includes('mnemosyne') || s.includes('interface')) return 'ship_ai';
    if (s.includes('vance') || s.includes('valeria') || s.includes('human')) return 'dr_vance';
    if (s.includes('zephyr') || s.includes('wanderer') || s.includes('nomad')) return 'captain_zephyr';
    if (s.includes('titan') || s.includes('leviathan') || s.includes('orosen') || s.includes('giant')) return 'titan';
    if (s.includes('anomaly') || s.includes('monolith') || s.includes('relay') || s.includes('resonance')) return 'anomaly';
    if (s.includes('station') || s.includes('epsilon') || s.includes('traffic')) return 'station_control';
    return 'default';
  }

  /**
   * Plays a procedural non-verbal voiceprint signature when dialogue begins or types.
   */
  public playSpeechSignature(speakerId: string, syllableCount = 3): void {
    if (!this.ensureAudio()) return;
    const ctx = this.audioCtx!;
    const profile = this.resolveProfile(speakerId);
    const now = ctx.currentTime;

    const count = Math.min(6, Math.max(1, syllableCount));

    for (let i = 0; i < count; i++) {
      const startTime = now + i * 0.085;
      this.playSyllable(profile, startTime, i, speakerId);
    }
  }

  private playSyllable(
    profile: SpeakerAcousticProfile,
    startTime: number,
    index: number,
    seedString: string
  ): void {
    const ctx = this.audioCtx!;
    const hash = this.hashString(seedString + index);

    switch (profile) {
      case 'ship_ai': {
        // High-precision digital FM synth beeps
        const carrier = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        const gain = ctx.createGain();

        const baseFreq = 880 + (hash % 6) * 110;
        carrier.frequency.setValueAtTime(baseFreq, startTime);
        mod.frequency.setValueAtTime(baseFreq * 2, startTime);
        modGain.gain.setValueAtTime(150, startTime);

        mod.connect(carrier.frequency);
        carrier.connect(gain);
        gain.connect(this.masterGain!);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.07);

        carrier.start(startTime);
        mod.start(startTime);
        carrier.stop(startTime + 0.08);
        mod.stop(startTime + 0.08);
        break;
      }

      case 'dr_vance': {
        // Warm bandpass radio telemetry chatter
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        const freq = 420 + (hash % 8) * 45;
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.linearRampToValueAtTime(freq + (index % 2 === 0 ? 30 : -20), startTime + 0.08);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, startTime);
        filter.Q.setValueAtTime(3.5, startTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.14, startTime + 0.02);
        gain.gain.linearRampToValueAtTime(0.001, startTime + 0.09);

        osc.start(startTime);
        osc.stop(startTime + 0.1);
        break;
      }

      case 'captain_zephyr': {
        // Avian-nomad resonant dual harmonic whistle
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        const baseFreq = 587.33 + (hash % 5) * 65; // D5 base
        osc1.frequency.setValueAtTime(baseFreq, startTime);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, startTime + 0.12);

        osc2.frequency.setValueAtTime(baseFreq * 1.5, startTime); // Perfect fifth harmony
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, startTime + 0.12);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain!);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + 0.15);
        osc2.stop(startTime + 0.15);
        break;
      }

      case 'titan': {
        // Massive tectonic low rumble
        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        sub.type = 'sine';
        osc.frequency.setValueAtTime(45 + (hash % 4) * 8, startTime);
        sub.frequency.setValueAtTime(32, startTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(140, startTime);

        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        gain.gain.linearRampToValueAtTime(0.001, startTime + 0.22);

        osc.start(startTime);
        sub.start(startTime);
        osc.stop(startTime + 0.24);
        sub.stop(startTime + 0.24);
        break;
      }

      case 'anomaly':
      default: {
        // Crystalline bell chime
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const notes = [523.25, 659.25, 783.99, 1046.5];
        osc.frequency.setValueAtTime(notes[hash % notes.length], startTime);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
        break;
      }
    }
  }

  /**
   * Plays progressive notes of the Resonance Leitmotif depending on story advancement.
   * Notes revealed: 1 to 5
   */
  public playLeitmotif(notesCount = 1): void {
    if (!this.ensureAudio()) return;
    const ctx = this.audioCtx!;
    const now = ctx.currentTime;

    const count = Math.min(5, Math.max(1, notesCount));

    for (let i = 0; i < count; i++) {
      const freq = CommunicationSoundSynth.LEITMOTIF_FREQUENCIES[i];
      const startTime = now + i * 0.22;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc.start(startTime);
      osc.stop(startTime + 0.65);
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

export const commAudio = CommunicationSoundSynth.getInstance();

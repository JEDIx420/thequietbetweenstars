/**
 * Procedural Audio Engine using Web Audio API
 * Generates peaceful cosmic ambience and retro-futuristic sound effects without external files.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = false;
  private masterVolume = 0.7;

  // Drone nodes
  private isPlayingAmbience = false;
  private droneOscillators: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private lfoOsc: OscillatorNode | null = null;

  // Thruster audio
  private thrusterOsc: OscillatorNode | null = null;
  private thrusterGain: GainNode | null = null;

  public async start(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[Audio] Web Audio API not supported in this browser.');
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

    if (!this.isPlayingAmbience) {
      this.startCosmicAmbience();
    }
  }

  private startCosmicAmbience(): void {
    if (!this.ctx || !this.masterGain) return;

    this.isPlayingAmbience = true;

    // Filter for warm, dark sound
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(260, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(2.5, this.ctx.currentTime);

    // LFO for breathing cosmic filter movement (period ~22s)
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'sine';
    this.lfoOsc.frequency.setValueAtTime(0.045, this.ctx.currentTime);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(90, this.ctx.currentTime); // mod +/- 90Hz

    this.lfoOsc.connect(lfoGain);
    lfoGain.connect(this.filterNode.frequency);
    this.lfoOsc.start();

    // Ambience gain
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

    this.filterNode.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    // Multi-oscillator cluster: A1 (55Hz), E2 (82.4Hz), A2 (110Hz), C#3 (138.6Hz)
    // Peaceful cosmic major chord with subtle detuning
    const freqs = [55, 55.4, 82.4, 110, 110.6, 138.6];
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.filterNode) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.2 / freqs.length, this.ctx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(this.filterNode);
      osc.start();
      this.droneOscillators.push(osc);
    });

    // Gentle thruster purr setup
    this.thrusterOsc = this.ctx.createOscillator();
    this.thrusterOsc.type = 'triangle';
    this.thrusterOsc.frequency.setValueAtTime(65, this.ctx.currentTime);

    this.thrusterGain = this.ctx.createGain();
    this.thrusterGain.gain.setValueAtTime(0, this.ctx.currentTime);

    const thrusterFilter = this.ctx.createBiquadFilter();
    thrusterFilter.type = 'lowpass';
    thrusterFilter.frequency.setValueAtTime(140, this.ctx.currentTime);

    this.thrusterOsc.connect(thrusterFilter);
    thrusterFilter.connect(this.thrusterGain);
    this.thrusterGain.connect(this.masterGain);
    this.thrusterOsc.start();
  }

  public updateThrottle(throttle: number): void {
    if (!this.ctx || !this.thrusterGain || !this.thrusterOsc) return;

    const t = Math.max(0, Math.min(1, throttle));
    const now = this.ctx.currentTime;

    // Pitch rises slightly with throttle
    this.thrusterOsc.frequency.setTargetAtTime(65 + t * 50, now, 0.1);
    // Volume gently rises with throttle
    this.thrusterGain.gain.setTargetAtTime(t * 0.15, now, 0.1);
  }

  public playScanEffect(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    // Frequency sweep: 220 -> 580 -> 290
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.35); // D5
    osc.frequency.exponentialRampToValueAtTime(293.66, now + 1.2);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(440, now);
    filter.Q.setValueAtTime(3.0, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 1.9);
  }

  public playConnectChime(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    [329.63, 493.88, 659.25].forEach((freq, i) => { // E4, B4, E5
      if (!this.ctx || !this.masterGain) return;
      const noteTime = now + i * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.18, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.6);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.65);
    });
  }

  public playBlip(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.08); // G5

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.11);
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
}

export const audio = new AudioEngine();

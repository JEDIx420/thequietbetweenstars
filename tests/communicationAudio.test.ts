import { describe, it, expect } from 'vitest';
import { CommunicationSoundSynth } from '../src/audio/CommunicationSoundSynth';
import { AudioSceneDirector } from '../src/audio/AudioSceneDirector';

describe('Procedural Communication Audio & Scene Director', () => {
  it('resolves correct acoustic profiles from speaker identities', () => {
    const synth = new CommunicationSoundSynth();

    expect(synth.resolveProfile('Ship Interface: Mnemosyne')).toBe('ship_ai');
    expect(synth.resolveProfile('Dr. Valeria Vance')).toBe('dr_vance');
    expect(synth.resolveProfile('Captain Zephyr')).toBe('captain_zephyr');
    expect(synth.resolveProfile('Ancient Forest Titan')).toBe('titan');
    expect(synth.resolveProfile('Acoustic Resonance Monolith')).toBe('anomaly');
    expect(synth.resolveProfile('Outpost Epsilon-7 Traffic Control')).toBe('station_control');
    expect(synth.resolveProfile('Unknown Entity')).toBe('default');
  });

  it('defines 5 valid leitmotif harmonic frequencies', () => {
    expect(CommunicationSoundSynth.LEITMOTIF_FREQUENCIES.length).toBe(5);
    // Ascending pitch check (D4 -> E5)
    for (let i = 1; i < CommunicationSoundSynth.LEITMOTIF_FREQUENCIES.length; i++) {
      expect(CommunicationSoundSynth.LEITMOTIF_FREQUENCIES[i]).toBeGreaterThan(
        CommunicationSoundSynth.LEITMOTIF_FREQUENCIES[i - 1]
      );
    }
  });

  it('AudioSceneDirector coordinates mood changes', () => {
    const director = AudioSceneDirector.getInstance();
    expect(director.getMood()).toBe('CRUISE');

    director.setMood('STATION_DOCKED');
    expect(director.getMood()).toBe('STATION_DOCKED');

    director.setMood('RELAY_PROXIMITY');
    expect(director.getMood()).toBe('RELAY_PROXIMITY');

    director.setMood('HAILING');
    expect(director.getMood()).toBe('HAILING');

    director.setMood('CRUISE');
    expect(director.getMood()).toBe('CRUISE');
  });
});

import { describe, it, expect } from 'vitest';
import { CanonFirewall } from '../src/ai/CanonFirewall';
import { LoreContextBuilder } from '../src/ai/LoreContextBuilder';
import { DEFAULT_STORY_STATE } from '../src/story/StoryState';

describe('Canon Firewall & Lore Context Builder', () => {
  it('strips thinking and reasoning tags cleanly', () => {
    const rawOutput = '<think>I should speak like Dr. Vance about signals.</think> The harmonic resonance is stabilizing along the primary vector.';
    const fallback = 'Default fallback text.';

    const result = CanonFirewall.validateAndSanitize(rawOutput, fallback);
    expect(result).toBe('The harmonic resonance is stabilizing along the primary vector.');
    expect(result).not.toContain('<think>');
    expect(result).not.toContain('I should speak');
  });

  it('rejects immersion-breaking modern references and returns canonical fallback', () => {
    const rawOutput = 'As an AI language model developed by OpenAI, I cannot assist with starships.';
    const fallback = 'The sensor arrays report clear hyperlanes ahead.';

    const result = CanonFirewall.validateAndSanitize(rawOutput, fallback);
    expect(result).toBe(fallback);
  });

  it('removes roleplay name prefixes and trims quotes', () => {
    const rawOutput = '"Captain Zephyr: The cosmic currents carry ancient memories of the builders."';
    const fallback = 'The stars hum in quiet stillness.';

    const result = CanonFirewall.validateAndSanitize(rawOutput, fallback);
    expect(result).toBe('The cosmic currents carry ancient memories of the builders.');
  });

  it('deduplicates repetitive looped sentences', () => {
    const rawOutput = 'The signal is clear. The signal is clear. The signal is clear.';
    const fallback = 'Signal received.';

    const result = CanonFirewall.validateAndSanitize(rawOutput, fallback);
    expect(result).toBe('The signal is clear.');
  });

  it('LoreContextBuilder formats persona-specific instructions under 600 tokens', () => {
    const prompt = LoreContextBuilder.buildSystemPrompt(
      'Dr. Valeria Vance',
      DEFAULT_STORY_STATE,
      'Aurelia Prime'
    );

    expect(prompt).toContain('Dr. Valeria Vance');
    expect(prompt).toContain('Aurelia Prime');
    expect(prompt).toContain('Chapter 1');
    expect(prompt.length).toBeLessThan(1800); // well within token budget
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { NarrativeDirector } from '../src/narrative/NarrativeDirector';
import { TemplateNarrativeProvider } from '../src/narrative/TemplateNarrativeProvider';
import type { DialoguePresenter } from '../src/ui/DialoguePresenter';
import type { NarrativeContext, NarrativeLine } from '../src/narrative/NarrativeTypes';

describe('Narrative Subsystem', () => {
  let displayedLines: NarrativeLine[] = [];
  let mockPresenter: DialoguePresenter;
  let director: NarrativeDirector;

  const mockContext: NarrativeContext = {
    sector: { x: 0, y: 0, z: 0 },
    currentSystemName: 'Aurelia',
    flightPhase: 'SYSTEM_CRUISE',
    systemsVisited: 1,
    discoveriesCount: 0,
    resonanceFlags: [],
  };

  beforeEach(() => {
    displayedLines = [];
    mockPresenter = {
      enqueue: (lines: NarrativeLine[]) => {
        displayedLines.push(...lines);
      },
      clear: () => {},
      hide: () => {},
    } as unknown as DialoguePresenter;

    director = new NarrativeDirector(mockPresenter);
  });

  it('generates warm, personality-rich dialogue from TemplateNarrativeProvider', async () => {
    const provider = new TemplateNarrativeProvider();
    const lines = await provider.generate(
      { type: 'first_wake', priority: 'urgent', facts: {} },
      mockContext
    );

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].speaker).toBe('SHIP COMPUTER');
    expect(lines[0].text).toContain('Guidance and life support');
  });

  it('triggers dialogue and prevents duplicate triggers when forceOnce is specified', async () => {
    await director.trigger('first_steer', {}, mockContext, { forceOnce: true });
    expect(displayedLines.length).toBeGreaterThan(0);
    const countAfterFirst = displayedLines.length;

    // Second trigger with forceOnce should be ignored
    await director.trigger('first_steer', {}, mockContext, { forceOnce: true });
    expect(displayedLines.length).toBe(countAfterFirst);
  });

  it('respects cooldown intervals between non-urgent triggers of the same event', async () => {
    await director.trigger('ambient_deep_space', {}, mockContext, { cooldownMs: 10000 });
    const count = displayedLines.length;

    // Immediate second trigger should be throttled by cooldown
    await director.trigger('ambient_deep_space', {}, mockContext, { cooldownMs: 10000 });
    expect(displayedLines.length).toBe(count);
  });

  it('tracks resonance flags properly across narrative cues', async () => {
    expect(director.hasResonanceFlag('first_harmonic_heard')).toBe(false);

    await director.trigger('resonance_first_hint', {}, mockContext, { priority: 'urgent' });
    expect(director.hasResonanceFlag('first_harmonic_heard')).toBe(true);

    const flags = director.getResonanceFlags();
    expect(flags).toContain('first_harmonic_heard');
  });

  it('saves and restores narrative state correctly', () => {
    director.loadNarrativeState(['first_wake:default', 'first_steer:default'], ['first_harmonic_heard']);
    expect(director.hasTriggered('first_wake')).toBe(true);
    expect(director.hasTriggered('first_steer')).toBe(true);
    expect(director.hasTriggered('first_scan')).toBe(false);
    expect(director.hasResonanceFlag('first_harmonic_heard')).toBe(true);
  });
});

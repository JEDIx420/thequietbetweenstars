import type {
  NarrativeEvent,
  NarrativeContext,
  NarrativeTextProvider,
  NarrativeEventType,
} from './NarrativeTypes';
import { TemplateNarrativeProvider } from './TemplateNarrativeProvider';
import type { DialoguePresenter } from '../ui/DialoguePresenter';

export class NarrativeDirector {
  private provider: NarrativeTextProvider;
  private presenter: DialoguePresenter;
  private triggeredEvents = new Set<string>();
  private lastEventTime = -999999;
  private minEventCooldownMs = 3000;

  // Narrative resonance tracking flags
  public resonanceFlags = new Set<string>();

  constructor(presenter: DialoguePresenter, provider?: NarrativeTextProvider) {
    this.presenter = presenter;
    this.provider = provider || new TemplateNarrativeProvider();
  }

  public setProvider(provider: NarrativeTextProvider): void {
    this.provider = provider;
  }

  public loadNarrativeState(triggeredIds: string[], flags: string[]): void {
    for (const id of triggeredIds) this.triggeredEvents.add(id);
    for (const f of flags) this.resonanceFlags.add(f);
  }

  public getTriggeredEventIds(): string[] {
    return Array.from(this.triggeredEvents);
  }

  public getResonanceFlags(): string[] {
    return Array.from(this.resonanceFlags);
  }

  public recordTriggeredEvent(id: string): void {
    this.triggeredEvents.add(id);
  }

  public hasTriggered(type: NarrativeEventType, key = 'default'): boolean {
    return this.triggeredEvents.has(`${type}:${key}`);
  }

  public hasResonanceFlag(flag: string): boolean {
    return this.resonanceFlags.has(flag);
  }

  public async trigger(
    type: NarrativeEventType,
    facts: Record<string, string | number | boolean | undefined> = {},
    context: NarrativeContext,
    options: {
      key?: string;
      forceOnce?: boolean;
      priority?: 'urgent' | 'high' | 'normal' | 'ambient';
      cooldownMs?: number;
    } = {}
  ): Promise<boolean> {
    const key = options.key || 'default';
    const eventKey = `${type}:${key}`;

    if (options.forceOnce && this.triggeredEvents.has(eventKey)) {
      return false;
    }

    const now = performance.now();
    const priority = options.priority || 'normal';
    const cooldown = options.cooldownMs ?? this.minEventCooldownMs;

    if (priority !== 'urgent' && now - this.lastEventTime < cooldown) {
      return false;
    }

    this.triggeredEvents.add(eventKey);
    this.lastEventTime = now;

    if (type === 'resonance_first_hint') {
      this.resonanceFlags.add('first_harmonic_heard');
    } else if (type === 'resonance_second_hint') {
      this.resonanceFlags.add('second_harmonic_heard');
    }

    const event: NarrativeEvent = {
      id: eventKey,
      type,
      priority,
      facts,
      timestamp: Date.now(),
    };

    try {
      const lines = await this.provider.generate(event, context);
      if (lines && lines.length > 0) {
        this.presenter.enqueue(lines);
        return true;
      }
    } catch (e) {
      console.warn('[NarrativeDirector] Failed to generate narrative lines', e);
    }

    return false;
  }
}

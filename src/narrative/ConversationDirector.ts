import type { NPCIdentity } from '../game/ecology/SentientSpeciesProfile';

export interface DialogueChoice {
  text: string;
  topic: string;
}

export interface ConversationTurn {
  speakerName: string;
  speakerTitle: string;
  text: string;
  choices: DialogueChoice[];
  revealedLoreTitle?: string;
  revealedLoreContent?: string;
}

export class StructuredConversationProvider {
  public static startConversation(npc: NPCIdentity, timesMet: number): ConversationTurn {
    let greeting = npc.greeting;
    if (timesMet > 0) {
      greeting = `Welcome back, explorer. The horizon feels familiar with your ship in view. What brings your curiosity to our quiet stones today?`;
    }

    return {
      speakerName: npc.name,
      speakerTitle: npc.title,
      text: greeting,
      choices: [
        { text: 'Ask about this world and local life', topic: 'ecology' },
        { text: 'Inquire about your people and ancient history', topic: 'history' },
        { text: 'Ask about the strange 1420 kHz radio harmonic', topic: 'the_resonance' },
        { text: 'Express thanks and conclude communication', topic: 'farewell' },
      ],
    };
  }

  public static handleChoice(npc: NPCIdentity, topic: string): ConversationTurn {
    switch (topic) {
      case 'ecology':
        return {
          speakerName: npc.name,
          speakerTitle: npc.title,
          text: `The life here answers to subtle geological tides. ${npc.currentConcern} If you drift with low thrust, you will see how gently the creatures share this basin.`,
          choices: [
            { text: 'Ask about your people and ancient history', topic: 'history' },
            { text: 'Ask about the 1420 kHz harmonic', topic: 'the_resonance' },
            { text: 'Express thanks and conclude communication', topic: 'farewell' },
          ],
        };

      case 'history':
        return {
          speakerName: npc.name,
          speakerTitle: npc.title,
          text: npc.loreFactText,
          revealedLoreTitle: npc.loreFactTitle,
          revealedLoreContent: npc.loreFactText,
          choices: [
            { text: 'Ask about local life', topic: 'ecology' },
            { text: 'Ask about the 1420 kHz harmonic', topic: 'the_resonance' },
            { text: 'Express thanks and conclude communication', topic: 'farewell' },
          ],
        };

      case 'the_resonance':
        return {
          speakerName: npc.name,
          speakerTitle: npc.title,
          text: `Ah, the prime interval. We have watched it pulse across neighboring stars for cycles uncounted. It is no machine. It is the quiet tuning of the void itself.`,
          revealedLoreTitle: `The Great Tuning (${npc.name})`,
          revealedLoreContent: `According to ${npc.name}, the 1420 kHz harmonic is a universal celestial acoustic pulse that connects undisturbed star systems across the quiet void.`,
          choices: [
            { text: 'Ask about local life', topic: 'ecology' },
            { text: 'Ask about history', topic: 'history' },
            { text: 'Express thanks and conclude communication', topic: 'farewell' },
          ],
        };

      case 'farewell':
      default:
        return {
          speakerName: npc.name,
          speakerTitle: npc.title,
          text: `Safe travels through the stars, quiet voyager. May your flight remain peaceful.`,
          choices: [],
        };
    }
  }
}

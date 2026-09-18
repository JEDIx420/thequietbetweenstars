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
    const isWater = npc.title.toLowerCase().includes('depths') || npc.npcId.includes('water');
    const isAir = npc.title.toLowerCase().includes('ionosphere') || npc.title.toLowerCase().includes('sky') || npc.npcId.includes('air');
    const isLand = npc.title.toLowerCase().includes('strata') || npc.npcId.includes('land');

    switch (topic) {
      case 'ecology': {
        let text = `The life here answers to subtle geological tides. ${npc.currentConcern} If you drift with low thrust, you will see how gently the creatures share this basin.`;
        if (isWater) {
          text = `In the sunken abyssal trenches, hydrostatic pressure and living luminescence become one tongue. We shepherd the microscopic drifters whose bioluminescence illuminates the ocean floor at nightfall.`;
        } else if (isAir) {
          text = `The sky is our vast pasture. We drift along thermal jet streams, basking in solar coronal winds and guiding the migratory gliders away from severe electric storms.`;
        } else if (isLand) {
          text = `The bedrock supports the roots of all life above. We feel the slow growth of crystalline forests and the gentle footsteps of every small wanderer across these plains.`;
        }
        return {
          speakerName: npc.name,
          speakerTitle: npc.title,
          text,
          choices: [
            { text: 'Ask about your people and ancient history', topic: 'history' },
            { text: 'Ask about the 1420 kHz harmonic', topic: 'the_resonance' },
            { text: 'Express thanks and conclude communication', topic: 'farewell' },
          ],
        };
      }

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

      case 'the_resonance': {
        let text = `Ah, the prime interval. We have watched it pulse across neighboring stars for cycles uncounted. It is no machine. It is the quiet tuning of the void itself.`;
        if (isWater) {
          text = `Beneath the waves, the 1420 kHz harmonic reverberates like a deep bronze bell across thousands of leagues of saltwater, uniting all submerged life under the quiet stars.`;
        } else if (isAir) {
          text = `In the near-vacuum of the upper atmosphere, the 1420 kHz harmonic hums directly through our acoustic crests, clear as starlight through unclouded glass.`;
        } else if (isLand) {
          text = `The planetary mantle acts as a crystalline seismic tuning fork. The 1420 kHz signal resonates in every quartz vein embedded in the bedrock.`;
        }
        return {
          speakerName: npc.name,
          speakerTitle: npc.title,
          text,
          revealedLoreTitle: `The Great Tuning (${npc.name})`,
          revealedLoreContent: `According to ${npc.name}, the 1420 kHz harmonic is a universal celestial acoustic pulse that connects undisturbed star systems across the quiet void.`,
          choices: [
            { text: 'Ask about local life', topic: 'ecology' },
            { text: 'Ask about history', topic: 'history' },
            { text: 'Express thanks and conclude communication', topic: 'farewell' },
          ],
        };
      }

      case 'farewell':
      default: {
        let farewellText = `Safe travels through the stars, quiet voyager. May your flight remain peaceful.`;
        if (isWater) {
          farewellText = `May calm currents cradle your vessel, voyager. Return whenever the silent waters call to you.`;
        } else if (isAir) {
          farewellText = `May the gentle thermals carry you high above the clouds. The upper skies will remember your visit.`;
        } else if (isLand) {
          farewellText = `Walk lightly upon the strata of new worlds, voyager. The ancient bedrock bids you peace.`;
        }
        return {
          speakerName: npc.name,
          speakerTitle: npc.title,
          text: farewellText,
          choices: [],
        };
      }
    }
  }
}

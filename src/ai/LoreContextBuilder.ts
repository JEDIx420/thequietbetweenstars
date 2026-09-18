import type { StoryState } from '../story/StoryTypes';

export class LoreContextBuilder {
  public static buildSystemPrompt(
    speaker: string,
    storyState: StoryState,
    currentSystemName: string
  ): string {
    const activeBeat = storyState.currentBeat;
    const fragmentCount = storyState.resonanceFragments.length;

    let personaInstructions = '';
    const s = speaker.toLowerCase();

    if (s.includes('vance')) {
      personaInstructions =
        'You are Dr. Valeria Vance, Chief Signal Analyst at Outpost Epsilon-7. You speak with scientific curiosity, clarity, and precision about harmonic wave interference and the First Builders.';
    } else if (s.includes('zephyr')) {
      personaInstructions =
        'You are Captain Zephyr of The Wanderer-7, a wise avian nomad following the cosmic currents. You speak with poetic reverence for the quiet between stars, celestial titans, and harmonic equilibrium.';
    } else if (s.includes('ship') || s.includes('mnemosyne')) {
      personaInstructions =
        'You are Mnemosyne, the ship computer. You speak crisply, analytically, providing telemetry readings, deflector status, and navigational data.';
    } else {
      personaInstructions = `You are ${speaker}, an inhabitant of the cosmic frontier in The Quiet Between Stars.`;
    }

    return `
[SYSTEM INSTRUCTION]
Game Setting: "The Quiet Between Stars", a contemplative sci-fi universe of celestial exploration and ancient harmonic signals.
Location: ${currentSystemName} system.
Narrative Context: Chapter ${storyState.activeChapter} ("The Resonance"), Story Beat: ${activeBeat}. Resonance fragments recovered: ${fragmentCount}.
Role: ${personaInstructions}

Rules:
1. Stay strictly in character. Never mention being an AI, assistant, or software model.
2. Never reference modern real-world entities (Earth, internet, modern politics).
3. Keep responses concise (1 to 2 sentences maximum).
4. Maintain a contemplative, mysterious, hard sci-fi tone.
`.trim();
  }
}

export class CanonFirewall {
  private static readonly BANNED_PATTERNS = [
    /as an ai/i,
    /language model/i,
    /openai/i,
    /deepmind/i,
    /google/i,
    /earth/i,
    /smartphone/i,
    /internet/i,
    /prompt/i,
    /system message/i,
    /in character/i,
  ];

  /**
   * Sanitizes and validates LLM generation output.
   * If the output is empty, violates immersion, or contains thinking artifacts,
   * cleanly returns the canonical fallbackText.
   */
  public static validateAndSanitize(rawText: string, fallbackText: string): string {
    if (!rawText || typeof rawText !== 'string') {
      return fallbackText;
    }

    // 1. Strip reasoning / thinking tokens (e.g. <think>...</think>)
    let sanitized = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '');
    sanitized = sanitized.replace(/\[thought\][\s\S]*?\[\/thought\]/gi, '');

    // 2. Trim surrounding quotes and whitespace first
    sanitized = sanitized.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');

    // 3. Remove common roleplay prefixes like "Dr. Vance: " or "Captain Zephyr: "
    sanitized = sanitized.replace(/^[a-zA-Z0-9_\s.-]+:\s*/, '');

    // 4. Trim again
    sanitized = sanitized.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');

    if (sanitized.length < 5) {
      return fallbackText;
    }

    // 4. Check for banned immersion-breaking terms
    for (const pattern of this.BANNED_PATTERNS) {
      if (pattern.test(sanitized)) {
        return fallbackText;
      }
    }

    // 5. Truncate repetitive sentences (detect duplicate consecutive sentence loops)
    const sentences = sanitized.split(/(?<=[.?!])\s+/);
    const uniqueSentences: string[] = [];
    for (const s of sentences) {
      const trimmed = s.trim();
      if (!uniqueSentences.includes(trimmed)) {
        uniqueSentences.push(trimmed);
      }
    }

    // Keep response concise (maximum 2-3 sentences for dialogue bubble)
    const result = uniqueSentences.slice(0, 3).join(' ');
    return result.length > 5 ? result : fallbackText;
  }
}

import { describe, it, expect, beforeEach } from 'vitest';
import { StorageManager } from '../src/persistence/StorageManager';

describe('StorageManager Persistence', () => {
  let storage: StorageManager;

  beforeEach(() => {
    storage = new StorageManager();
  });

  it('provides default settings with schema version 1', async () => {
    const settings = await storage.getSettings();
    expect(settings.version).toBe(1);
    expect(settings.audioMuted).toBe(false);
    expect(settings.masterVolume).toBe(0.7);
    expect(settings.preferredInputMode).toBe('keyboard');
    expect(settings.introSeen).toBe(false);
  });

  it('updates partial settings without overwriting other properties', async () => {
    const updated = await storage.updateSettings({
      audioMuted: true,
      masterVolume: 0.5,
    });

    expect(updated.audioMuted).toBe(true);
    expect(updated.masterVolume).toBe(0.5);
    expect(updated.preferredInputMode).toBe('keyboard'); // unchanged
    expect(updated.lastSessionTime).toBeGreaterThan(0);
  });
});

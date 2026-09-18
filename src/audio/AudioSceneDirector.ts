import { audio } from './AudioEngine';

export type ExplorationMood = 'CRUISE' | 'STATION_DOCKED' | 'RELAY_PROXIMITY' | 'HAILING';

export class AudioSceneDirector {
  private static instance: AudioSceneDirector | null = null;
  private currentMood: ExplorationMood = 'CRUISE';

  public static getInstance(): AudioSceneDirector {
    if (!AudioSceneDirector.instance) {
      AudioSceneDirector.instance = new AudioSceneDirector();
    }
    return AudioSceneDirector.instance;
  }

  public setMood(mood: ExplorationMood): void {
    if (this.currentMood === mood) return;
    this.currentMood = mood;

    switch (mood) {
      case 'STATION_DOCKED':
        audio.setContext('orbit');
        break;
      case 'RELAY_PROXIMITY':
        audio.setContext('sentient');
        break;
      case 'HAILING':
        audio.setContext('briefing');
        break;
      case 'CRUISE':
      default:
        audio.setContext('cruise');
        break;
    }
  }

  public getMood(): ExplorationMood {
    return this.currentMood;
  }
}

export const sceneAudio = AudioSceneDirector.getInstance();

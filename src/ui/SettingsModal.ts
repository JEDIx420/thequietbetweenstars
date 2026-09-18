import { localAI } from '../ai/LocalIntelligenceService';
import { audio } from '../audio/AudioEngine';
import { StoryDirector } from '../story/StoryDirector';

export class SettingsModal {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private isVisible = false;
  private isCached = false;
  private storyDirector: StoryDirector | null = null;

  public setStoryDirector(director: StoryDirector): void {
    this.storyDirector = director;
  }

  constructor(parent: HTMLElement) {
    this.container = parent;
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  public async open(): Promise<void> {
    if (this.isVisible) return;
    this.isVisible = true;

    this.modalEl = document.createElement('div');
    this.modalEl.id = 'settings-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at 50% 50%, rgba(10, 15, 26, 0.95) 0%, rgba(3, 3, 7, 0.98) 100%);
      backdrop-filter: blur(16px);
      z-index: 2200;
      display: flex;
      flex-direction: column;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      user-select: none;
      animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    this.container.appendChild(this.modalEl);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKeyDown);
        this.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    await this.refreshCacheStatus();
    this.render();
  }

  public close(): void {
    if (!this.isVisible || !this.modalEl) return;
    this.isVisible = false;
    this.modalEl.remove();
    this.modalEl = null;
  }

  public toggle(): void {
    if (this.isVisible) {
      this.close();
    } else {
      this.open();
    }
  }

  private async refreshCacheStatus(): Promise<void> {
    try {
      this.isCached = await localAI.isModelCached();
    } catch {
      this.isCached = false;
    }
  }

  public render(): void {
    if (!this.modalEl) return;

    const status = localAI.getStatus();
    const isEnabled = localAI.isAiEnabled();
    const progress = Math.round(localAI.getProgress() * 100);
    const isFreeRoam = this.storyDirector ? this.storyDirector.isFreeExploration() : false;

    this.modalEl.innerHTML = `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: clamp(14px, 3vw, 20px) clamp(16px, 4vw, 32px);
        border-bottom: 1px solid rgba(56, 189, 248, 0.2);
        background: rgba(15, 23, 42, 0.4);
      ">
        <div>
          <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">CONFIGURATION // SUITE</div>
          <h2 style="font-size: clamp(18px, 4vw, 22px); font-weight: 300; margin: 4px 0 0 0;">System Settings</h2>
        </div>
        <button id="btn-settings-close" style="
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          color: #cbd5e1;
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        ">CLOSE [ESC]</button>
      </div>

      <div style="
        flex: 1;
        overflow-y: auto;
        padding: clamp(20px, 4vw, 36px);
        max-width: 780px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
      ">
        <!-- Enhanced Local Dialogue Section -->
        <div style="
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        ">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <h3 style="margin: 0; font-size: 1.15rem; color: #f8fafc; font-weight: 600;">Enhanced Local Dialogue</h3>
                <span style="
                  font-size: 10px;
                  font-weight: 700;
                  letter-spacing: 0.1em;
                  padding: 2px 8px;
                  border-radius: 9999px;
                  background: ${isEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.15)'};
                  color: ${isEnabled ? '#4ade80' : '#94a3b8'};
                  border: 1px solid ${isEnabled ? 'rgba(34, 197, 94, 0.4)' : 'rgba(148, 163, 184, 0.3)'};
                ">
                  ${isEnabled ? (status === 'READY' ? 'READY' : status) : 'OFF'}
                </span>
              </div>
              <p style="margin: 8px 0 0 0; font-size: 0.88rem; color: #cbd5e1; line-height: 1.5; max-width: 520px;">
                Downloads approximately 480 MB of model data and runs NPC dialogue generation locally on this device.
              </p>
              <div style="margin-top: 10px; font-size: 0.78rem; color: #94a3b8; font-family: ui-monospace, monospace;">
                Target Model: Qwen3-0.6B Q4_K_M GGUF (~480 MB) • Zero cloud telemetry • Offline capable
              </div>
            </div>
          </div>

          <!-- Download Progress Bar if DOWNLOADING -->
          ${
            status === 'DOWNLOADING'
              ? `
            <div style="margin-top: 20px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #38bdf8; font-family: ui-monospace, monospace; margin-bottom: 6px;">
                <span>DOWNLOADING MODEL WEIGHTS...</span>
                <span>${progress}%</span>
              </div>
              <div style="width: 100%; height: 8px; background: rgba(30, 41, 59, 0.8); border-radius: 9999px; overflow: hidden; border: 1px solid rgba(56, 189, 248, 0.3);">
                <div style="width: ${progress}%; height: 100%; background: linear-gradient(90deg, #0284c7, #38bdf8); transition: width 0.2s ease;"></div>
              </div>
              <div style="font-size: 10px; color: #94a3b8; margin-top: 6px; font-style: italic;">
                Saved to persistent browser cache. Does not download again on future sessions.
              </div>
            </div>
          `
              : ''
          }

          <!-- Controls Button Group -->
          <div style="margin-top: 24px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            ${
              status === 'NOT_DOWNLOADED' && !this.isCached
                ? `
              <button id="btn-ai-download" style="
                background: linear-gradient(135deg, rgba(14, 165, 233, 0.3), rgba(56, 189, 248, 0.2));
                border: 1px solid #38bdf8;
                color: #f8fafc;
                padding: 8px 20px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                transition: all 0.2s;
              ">DOWNLOAD / ENABLE (480 MB)</button>
            `
                : ''
            }

            ${
              status === 'NOT_DOWNLOADED' && this.isCached
                ? `
              <button id="btn-ai-enable" style="
                background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(74, 222, 128, 0.2));
                border: 1px solid #4ade80;
                color: #f8fafc;
                padding: 8px 20px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                transition: all 0.2s;
              ">ENABLE (CACHED)</button>
            `
                : ''
            }

            ${
              status === 'READY' && isEnabled
                ? `
              <button id="btn-ai-disable" style="
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.5);
                color: #fca5a5;
                padding: 8px 18px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
              ">DISABLE</button>
            `
                : ''
            }

            ${
              status === 'READY' && !isEnabled
                ? `
              <button id="btn-ai-enable" style="
                background: rgba(34, 197, 94, 0.2);
                border: 1px solid #4ade80;
                color: #f8fafc;
                padding: 8px 18px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
              ">ENABLE</button>
            `
                : ''
            }

            ${
              this.isCached || status === 'READY'
                ? `
              <button id="btn-ai-remove" style="
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(148, 163, 184, 0.3);
                color: #94a3b8;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
              ">REMOVE MODEL</button>
            `
                : ''
            }
          </div>

          <div style="margin-top: 18px; font-size: 0.8rem; color: #94a3b8; line-height: 1.4;">
            * Note: When disabled or unavailable, the game transparently utilizes canon-authored deterministic dialogue. The full story and all progression are 100% playable without downloading this model.
          </div>
        </div>

        <!-- Exploration & Mission Mode Card -->
        <div style="
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          margin-top: 24px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <h3 style="margin: 0; font-size: 1.15rem; color: #f8fafc; font-weight: 600;">Exploration & Mission Mode</h3>
                <span style="
                  font-size: 10px;
                  font-weight: 700;
                  letter-spacing: 0.1em;
                  padding: 2px 8px;
                  border-radius: 9999px;
                  background: ${isFreeRoam ? 'rgba(34, 197, 94, 0.2)' : 'rgba(56, 189, 248, 0.2)'};
                  color: ${isFreeRoam ? '#4ade80' : '#38bdf8'};
                  border: 1px solid ${isFreeRoam ? 'rgba(34, 197, 94, 0.4)' : 'rgba(56, 189, 248, 0.4)'};
                ">
                  ${isFreeRoam ? 'FREE ROAM' : 'STORY CAMPAIGN'}
                </span>
              </div>
              <p style="margin: 8px 0 0 0; font-size: 0.88rem; color: #cbd5e1; line-height: 1.5; max-width: 520px;">
                ${isFreeRoam 
                  ? 'Free Roam is active. Narrative waypoints, story reminders, and radar beacons are paused so you can explore the galaxy freely.'
                  : 'Story campaign is active. Objective waypoints, radar signals, and narrative encounters guide your journey.'}
              </p>
              <div style="margin-top: 10px; font-size: 0.78rem; color: #94a3b8; font-family: ui-monospace, monospace;">
                ${isFreeRoam ? 'Mode: Free Sandbox Exploration' : 'Mode: Chapter 1 // The Resonance'} • Switch anytime without losing story progress
              </div>
            </div>

            <button id="btn-settings-toggle-freeroam" style="
              background: ${isFreeRoam ? 'rgba(34, 197, 94, 0.25)' : 'rgba(56, 189, 248, 0.2)'};
              border: 1px solid ${isFreeRoam ? '#4ade80' : '#38bdf8'};
              color: #f8fafc;
              padding: 10px 20px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              letter-spacing: 0.05em;
              cursor: pointer;
              transition: all 0.2s;
            ">
              ${isFreeRoam ? '▶ RESUME STORY MISSIONS' : '⏸ ACTIVATE FREE ROAM'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.modalEl) return;

    this.modalEl.querySelector('#btn-settings-close')?.addEventListener('click', () => {
      this.close();
    });

    this.modalEl.querySelector('#btn-ai-download')?.addEventListener('click', async () => {
      audio.playBlip();
      localAI.setAiEnabled(true);
      this.render();

      await localAI.downloadAndInit((_pct) => {
        this.render();
      });

      await this.refreshCacheStatus();
      this.render();
    });

    this.modalEl.querySelector('#btn-ai-enable')?.addEventListener('click', async () => {
      audio.playBlip();
      localAI.setAiEnabled(true);
      if (localAI.getStatus() !== 'READY') {
        this.render();
        await localAI.downloadAndInit((_pct) => {
          this.render();
        });
      }
      await this.refreshCacheStatus();
      this.render();
    });

    this.modalEl.querySelector('#btn-ai-disable')?.addEventListener('click', () => {
      audio.playBlip();
      localAI.setAiEnabled(false);
      this.render();
    });

    this.modalEl.querySelector('#btn-ai-remove')?.addEventListener('click', async () => {
      audio.playBlip();
      await localAI.removeModel();
      await this.refreshCacheStatus();
      this.render();
    });

    this.modalEl.querySelector('#btn-settings-toggle-freeroam')?.addEventListener('click', () => {
      audio.playBlip();
      if (this.storyDirector) {
        const next = !this.storyDirector.isFreeExploration();
        this.storyDirector.setFreeExploration(next);
        this.render();
      }
    });
  }
}

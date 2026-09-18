import type { SpaceStation } from '../game/stations/SpaceStationManager';
import type { StoryDirector } from '../story/StoryDirector';
import type { PlayerSaveSlot } from '../persistence/SaveManager';
import { CHAPTER_1_BEATS } from '../story/chapters/Chapter1Resonance';

export interface StationModalCallbacks {
  onUndock: () => void;
  onTalkToNPC: (npcId: string) => void;
  onClose: () => void;
}

export class StationInterfaceModal {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private isVisible = false;
  private activeTab: 'concourse' | 'signal_lab' | 'archive' | 'dockyard' = 'concourse';
  private station: SpaceStation | null = null;
  private storyDirector: StoryDirector | null = null;
  private saveSlot: PlayerSaveSlot | null = null;
  private callbacks: StationModalCallbacks;

  constructor(container: HTMLElement, callbacks: StationModalCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public show(station: SpaceStation, storyDirector: StoryDirector, saveSlot: PlayerSaveSlot): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.station = station;
    this.storyDirector = storyDirector;
    this.saveSlot = saveSlot;

    this.modalEl = document.createElement('div');
    this.modalEl.id = 'station-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(4, 7, 18, 0.88);
      backdrop-filter: blur(16px);
      z-index: 960;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: #f8fafc;
      animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    this.render();
    this.container.appendChild(this.modalEl);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKeyDown);
        this.hide();
      }
    };
    window.addEventListener('keydown', onKeyDown);
  }

  public hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
    this.callbacks.onClose();
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  private render(): void {
    if (!this.modalEl || !this.station || !this.storyDirector) return;

    const state = this.storyDirector.getState();
    const currentBeatDef = CHAPTER_1_BEATS[state.currentBeat];

    this.modalEl.innerHTML = `
      <div style="
        width: min(880px, 94vw);
        height: min(620px, 88vh);
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(56, 189, 248, 0.3);
        box-shadow: 0 0 50px rgba(56, 189, 248, 0.15);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- Header -->
        <div style="
          padding: 18px 24px;
          border-bottom: 1px solid rgba(56, 189, 248, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(8, 14, 28, 0.6);
        ">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></span>
              <h2 style="margin: 0; font-size: 1.25rem; letter-spacing: 0.05em; font-weight: 600; color: #f8fafc;">
                ${this.station.name}
              </h2>
              <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">
                DOCKED • BAY 03
              </span>
            </div>
            <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">
              Affiliation: <span style="color: #cbd5e1;">${this.station.faction}</span> • Current Objective: <span style="color: #38bdf8;">${currentBeatDef?.title || 'Exploration'}</span>
            </div>
          </div>
          <button id="station-btn-undock-header" style="
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #fca5a5;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 500;
            transition: all 0.15s ease;
          ">
            Disengage & Undock
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div style="
          display: flex;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(10, 18, 36, 0.5);
          padding: 0 16px;
          gap: 6px;
        ">
          ${this.renderTabButton('concourse', 'Concourse & Personnel')}
          ${this.renderTabButton('signal_lab', 'Signal Lab & Synthesis')}
          ${this.renderTabButton('archive', 'Resonance Archive')}
          ${this.renderTabButton('dockyard', 'Dockyard Services')}
        </div>

        <!-- Tab Body -->
        <div id="station-tab-content" style="
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        ">
          ${this.renderActiveTabContent()}
        </div>
      </div>
    `;

    // Bind event listeners
    this.modalEl.querySelectorAll('.station-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as any;
        if (tab) {
          this.activeTab = tab;
          this.render();
        }
      });
    });

    const undockBtn = this.modalEl.querySelector('#station-btn-undock-header');
    if (undockBtn) {
      undockBtn.addEventListener('click', () => {
        this.hide();
        this.callbacks.onUndock();
      });
    }

    const talkVanceBtn = this.modalEl.querySelector('#btn-talk-vance');
    if (talkVanceBtn) {
      talkVanceBtn.addEventListener('click', () => {
        this.hide();
        this.callbacks.onTalkToNPC('dr_vance');
      });
    }

    const synthBtn = this.modalEl.querySelector('#btn-synthesize-key');
    if (synthBtn) {
      synthBtn.addEventListener('click', () => {
        this.storyDirector?.emit({
          type: 'FRAGMENT_DECRYPTED',
          payload: { fragmentId: 'fragment_alpha' },
          timestamp: Date.now(),
        });
        this.storyDirector?.emit({
          type: 'FRAGMENT_DECRYPTED',
          payload: { fragmentId: 'fragment_beta' },
          timestamp: Date.now(),
        });
        this.render();
      });
    }
  }

  private renderTabButton(tabKey: typeof this.activeTab, label: string): string {
    const isActive = this.activeTab === tabKey;
    return `
      <button class="station-tab-btn" data-tab="${tabKey}" style="
        padding: 12px 18px;
        background: transparent;
        border: none;
        border-bottom: 2px solid ${isActive ? '#38bdf8' : 'transparent'};
        color: ${isActive ? '#38bdf8' : '#94a3b8'};
        font-weight: ${isActive ? '600' : '400'};
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.15s ease;
      ">
        ${label}
      </button>
    `;
  }

  private renderActiveTabContent(): string {
    if (!this.storyDirector) return '';
    const state = this.storyDirector.getState();

    switch (this.activeTab) {
      case 'concourse': {
        const vance = this.saveSlot?.npcMemories?.['dr_vance'] || state.npcMemories?.['dr_vance'];
        return `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="
              background: rgba(30, 41, 59, 0.6);
              border: 1px solid rgba(56, 189, 248, 0.2);
              border-radius: 8px;
              padding: 18px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <div>
                <h3 style="margin: 0 0 6px 0; font-size: 1.1rem; color: #f8fafc;">Dr. Valeria Vance</h3>
                <div style="font-size: 0.85rem; color: #94a3b8;">
                  Chief Signal Analyst • Frontier Resonance Survey • Consultations: ${vance?.timesMet || 0}
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: #cbd5e1; max-width: 520px; line-height: 1.4;">
                  "The subcarrier signals have grown in intensity over the past six cycles. If you bring fragments recovered from space anomalies, our lab can decode their phase structures."
                </div>
              </div>
              <button id="btn-talk-vance" style="
                background: rgba(56, 189, 248, 0.2);
                border: 1px solid #38bdf8;
                color: #f8fafc;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
              ">
                Consult Dr. Vance
              </button>
            </div>

            <div style="
              background: rgba(15, 23, 42, 0.4);
              border: 1px dashed rgba(255, 255, 255, 0.15);
              border-radius: 8px;
              padding: 16px;
              color: #94a3b8;
              font-size: 0.85rem;
            ">
              <strong style="color: #cbd5e1;">Station Bulletin:</strong> Outpost Epsilon-7 is operating under harmonic observation protocol. Navigational hazard warning: spatial resonance pockets active in outer orbits.
            </div>
          </div>
        `;
      }

      case 'signal_lab': {
        const fragments = state.resonanceFragments;
        const hasAlpha = fragments.some((f) => f.id === 'fragment_alpha');
        const hasBeta = fragments.some((f) => f.id === 'fragment_beta');
        const canSynthesize = hasAlpha && hasBeta && fragments.some((f) => !f.decrypted);
        const bothDecrypted = hasAlpha && hasBeta && fragments.every((f) => f.decrypted);

        return `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0; font-size: 1.05rem; color: #e2e8f0;">Recovered Resonance Fragments</h3>
              ${
                canSynthesize
                  ? `<button id="btn-synthesize-key" style="background: #0284c7; border: none; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Synthesize Harmonic Key</button>`
                  : ''
              }
            </div>

            ${
              fragments.length === 0
                ? `<div style="padding: 30px; text-align: center; color: #64748b;">No resonance fragments cataloged yet. Complete staged scans on deep-space resonance anomalies to recover fragments.</div>`
                : fragments
                    .map(
                      (f) => `
                <div style="
                  background: rgba(30, 41, 59, 0.5);
                  border: 1px solid ${f.decrypted ? 'rgba(74, 222, 128, 0.4)' : 'rgba(56, 189, 248, 0.3)'};
                  border-radius: 8px;
                  padding: 14px;
                ">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 600; color: #f8fafc;">${f.name}</div>
                    <span style="font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: ${f.decrypted ? 'rgba(74, 222, 128, 0.2)' : 'rgba(56, 189, 248, 0.2)'}; color: ${f.decrypted ? '#86efac' : '#38bdf8'};">
                      ${f.decrypted ? 'DECRYPTED' : 'ENCRYPTED HARMONIC'}
                    </span>
                  </div>
                  <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">Frequency: ${f.frequency.toFixed(1)} Hz • Data: ${f.dataPayload}</div>
                  <div style="font-size: 0.85rem; color: #cbd5e1; margin-top: 6px;">${f.description}</div>
                </div>
              `
                    )
                    .join('')
            }

            ${
              bothDecrypted
                ? `
              <div style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(74, 222, 128, 0.4); padding: 14px; border-radius: 8px; color: #86efac; font-size: 0.9rem;">
                ✓ <strong>Harmonic Alignment Key Synthesized:</strong> Coordinates to the First Harmonic Relay have been plotted in your navigation computer.
              </div>
            `
                : ''
            }
          </div>
        `;
      }

      case 'archive': {
        const codex = state.unlockedCodexEntries;
        return `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <h3 style="margin: 0; font-size: 1.05rem; color: #e2e8f0;">Station Lore & Codex Records</h3>
            ${
              codex.length === 0
                ? `<div style="color: #64748b; padding: 20px;">No archive entries available.</div>`
                : codex
                    .map((id) => {
                      return `
                  <div style="background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 12px;">
                    <div style="font-weight: 500; color: #38bdf8;">${id.replace(/_/g, ' ').toUpperCase()}</div>
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">Archived historical telemetry and builder observation logs.</div>
                  </div>
                `;
                    })
                    .join('')
            }
          </div>
        `;
      }

      case 'dockyard': {
        return `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <h3 style="margin: 0; font-size: 1.05rem; color: #e2e8f0;">Dockyard Diagnostic & Replenishment</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div style="background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 0.8rem;">Shield Deflector Matrix</div>
                <div style="font-size: 1.2rem; font-weight: 600; color: #86efac; margin-top: 4px;">100% NOMINAL</div>
              </div>
              <div style="background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 0.8rem;">Impulse Fuel Reserve</div>
                <div style="font-size: 1.2rem; font-weight: 600; color: #38bdf8; margin-top: 4px;">RECHARGED</div>
              </div>
            </div>
            <div style="color: #94a3b8; font-size: 0.85rem;">
              Station tether provides continuous power coupling and atmospheric hull cleansing while docked. Account Balance: <strong style="color: #f8fafc;">${this.saveSlot?.credits ?? 0} Credits</strong>.
            </div>
          </div>
        `;
      }
    }
  }
}

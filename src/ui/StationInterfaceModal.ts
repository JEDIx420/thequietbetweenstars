import type { SpaceStation } from '../game/stations/SpaceStationManager';
import type { StoryDirector } from '../story/StoryDirector';
import type { PlayerSaveSlot } from '../persistence/SaveManager';
import { CHAPTER_1_BEATS } from '../story/chapters/Chapter1Resonance';
import { audio } from '../audio/AudioEngine';

export interface StationModalCallbacks {
  onUndock: () => void;
  onTalkToNPC: (npcId: string) => void;
  onClose: () => void;
}

export class StationInterfaceModal {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private isVisible = false;
  private activeTab: 'comms_link' | 'signal_lab' | 'station_logs' | 'systems_depot' = 'comms_link';
  private station: SpaceStation | null = null;
  private storyDirector: StoryDirector | null = null;
  private saveSlot: PlayerSaveSlot | null = null;
  private callbacks: StationModalCallbacks;
  private commReplyHistory: Array<{ sender: string; text: string; time: string }> = [];

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

    // Default opening comms transmission in transcript feed
    if (this.commReplyHistory.length === 0) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      this.commReplyHistory.push({
        sender: 'STATION_TRAFFIC_CONTROL',
        text: 'Mooring clamps confirmed. Umbilical power feed connected. High-bandwidth optical channel open.',
        time: timeStr,
      });
      this.commReplyHistory.push({
        sender: 'DR_VANCE // CHIEF_SIGNAL_ANALYST',
        text: 'Explorer, Dr. Vance speaking via secure telemetry relay. If you recovered anomalous resonance shards during your survey run, feed their data directly into our Signal Lab synthesis deck.',
        time: timeStr,
      });
    }

    this.modalEl = document.createElement('div');
    this.modalEl.id = 'station-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at 50% 50%, rgba(6, 11, 25, 0.94) 0%, rgba(2, 4, 10, 0.98) 100%);
      backdrop-filter: blur(16px);
      z-index: 960;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #f8fafc;
      animation: fadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
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
        width: min(940px, 95vw);
        height: min(660px, 90vh);
        background: rgba(10, 17, 34, 0.96);
        border: 1px solid rgba(56, 189, 248, 0.35);
        box-shadow: 0 0 60px rgba(56, 189, 248, 0.12), inset 0 0 20px rgba(3, 7, 18, 0.8);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- Terminal Header: Remote Station Interface Console -->
        <div style="
          padding: 16px 24px;
          border-bottom: 1px solid rgba(56, 189, 248, 0.25);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(4, 9, 20, 0.85);
          gap: 16px;
        ">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 10px #4ade80;"></span>
              <h2 style="margin: 0; font-size: 1.15rem; letter-spacing: 0.12em; font-weight: 700; color: #f8fafc; text-transform: uppercase;">
                ${this.station.name}
              </h2>
              <span style="font-size: 0.72rem; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">
                BAY 03 · CLAMP LOCKED · UPLINK 99.8%
              </span>
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 5px; font-family: ui-monospace, monospace;">
              AFFILIATION: <span style="color: #cbd5e1;">${this.station.faction.toUpperCase()}</span> // CARRIER FREQ: <span style="color: #38bdf8;">1420.405 MHz</span> // MISSION: <span style="color: #7dd3fc;">${currentBeatDef?.title.toUpperCase() || 'SYSTEM SURVEY'}</span>
            </div>
          </div>

          <button id="station-btn-undock-header" style="
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.5);
            color: #fca5a5;
            padding: 9px 18px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.82rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            transition: all 0.15s ease;
            white-space: nowrap;
          ">
            ⏏ DISENGAGE & UNDOCK
          </button>
        </div>

        <!-- Channel Select Bar -->
        <div style="
          display: flex;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 14, 28, 0.7);
          padding: 0 16px;
          gap: 4px;
        ">
          ${this.renderTabButton('comms_link', 'CH 01 // SUBSPACE COMMS UPLINK')}
          ${this.renderTabButton('signal_lab', 'CH 02 // SIGNAL LAB & SYNTHESIS')}
          ${this.renderTabButton('station_logs', 'CH 03 // ARCHIVE & LOGS')}
          ${this.renderTabButton('systems_depot', 'CH 04 // SHIP SERVICES')}
        </div>

        <!-- Terminal Workspace Content -->
        <div id="station-tab-content" style="
          flex: 1;
          overflow-y: auto;
          padding: 22px 26px;
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
          audio.playBlip();
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

    // Comms interactive queries
    this.modalEl.querySelectorAll('.comm-query-action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const query = (e.currentTarget as HTMLElement).getAttribute('data-query');
        if (query) {
          this.handleCommsQuery(query);
        }
      });
    });

    const synthBtn = this.modalEl.querySelector('#btn-synthesize-key');
    if (synthBtn) {
      synthBtn.addEventListener('click', () => {
        audio.playConnectChime();
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
        this.commReplyHistory.push({
          sender: 'SYNTHESIS_PROCESSOR',
          text: 'Dual-frequency harmonic alignment successful. Resonance signature confirmed at 960.8 Hz. Vector to First Harmonic Relay locked in astrogation computer.',
          time: new Date().toTimeString().split(' ')[0],
        });
        this.render();
      });
    }

    const tradeDataBtn = this.modalEl.querySelector('#btn-trade-survey-data');
    if (tradeDataBtn) {
      tradeDataBtn.addEventListener('click', () => {
        audio.playConnectChime();
        if (this.saveSlot) {
          this.saveSlot.credits = (this.saveSlot.credits || 0) + 150;
        }
        this.commReplyHistory.push({
          sender: 'STATION_DATA_EXCHANGE',
          text: 'Telemetry package uploaded to Epsilon-7 scientific repository. Credited +150 credits to pilot account.',
          time: new Date().toTimeString().split(' ')[0],
        });
        this.render();
      });
    }
  }

  private handleCommsQuery(queryType: string): void {
    audio.playBlip();
    const now = new Date().toTimeString().split(' ')[0];

    switch (queryType) {
      case 'vance_briefing': {
        this.commReplyHistory.push({
          sender: 'PILOT // SHIP_LINK',
          text: 'Transmission: Requesting current signal survey briefing on the harmonic anomaly.',
          time: now,
        });
        this.commReplyHistory.push({
          sender: 'DR_VANCE // CHIEF_SIGNAL_ANALYST',
          text: 'Our deep-space listening array detected phase-coherent ripples across the sector. They do not originate from any natural pulsars or stellar flaring. We believe an ancient builder network is resonating in response to your ship\'s hyperspace drive.',
          time: now,
        });
        this.render();
        break;
      }

      case 'vance_fragments': {
        const state = this.storyDirector?.getState();
        const count = state?.resonanceFragments.length || 0;
        this.commReplyHistory.push({
          sender: 'PILOT // SHIP_LINK',
          text: `Transmission: Transmitting telemetry on recovered fragments [${count}/2].`,
          time: now,
        });
        if (count >= 2) {
          this.commReplyHistory.push({
            sender: 'DR_VANCE // CHIEF_SIGNAL_ANALYST',
            text: 'Both fragments α and β are intact! Switch to CH 02 (Signal Lab) and initiate key matrix synthesis to compute the relay coordinates.',
            time: now,
          });
        } else if (count === 1) {
          this.commReplyHistory.push({
            sender: 'DR_VANCE // CHIEF_SIGNAL_ANALYST',
            text: 'Fragment α is recorded. Telemetry indicates a secondary frequency origin point near the outer orbit: an abandoned survey craft Alpha-9. Locate it to acquire Fragment β.',
            time: now,
          });
        } else {
          this.commReplyHistory.push({
            sender: 'DR_VANCE // CHIEF_SIGNAL_ANALYST',
            text: 'No fragments detected in your sensor buffer yet. Track the 432.8 Hz subcarrier signal in deep space and complete the multi-stage harmonic scan.',
            time: now,
          });
        }
        this.render();
        break;
      }

      case 'station_traffic': {
        this.commReplyHistory.push({
          sender: 'PILOT // SHIP_LINK',
          text: 'Transmission: Requesting navigational hazard advisory for outer system orbits.',
          time: now,
        });
        this.commReplyHistory.push({
          sender: 'STATION_TRAFFIC_CONTROL',
          text: 'Advisory: Outer system orbits experience localized gravity shear and high-band harmonic distortion. Maintain sublight cruise speed (<160 m/s) when entering uncharted anomaly fields.',
          time: now,
        });
        this.render();
        break;
      }
    }
  }

  private renderTabButton(tabKey: typeof this.activeTab, label: string): string {
    const isActive = this.activeTab === tabKey;
    return `
      <button class="station-tab-btn" data-tab="${tabKey}" style="
        padding: 11px 16px;
        background: transparent;
        border: none;
        border-bottom: 2px solid ${isActive ? '#38bdf8' : 'transparent'};
        color: ${isActive ? '#38bdf8' : '#94a3b8'};
        font-weight: ${isActive ? '700' : '400'};
        cursor: pointer;
        font-size: 0.8rem;
        font-family: inherit;
        letter-spacing: 0.06em;
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
      case 'comms_link': {
        return `
          <div style="display: flex; flex-direction: column; gap: 16px; height: 100%;">
            <!-- Audio Oscilloscope & Carrier Waveform -->
            <div style="
              background: rgba(6, 12, 24, 0.7);
              border: 1px solid rgba(56, 189, 248, 0.25);
              border-radius: 8px;
              padding: 14px 18px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
            ">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="
                  display: flex;
                  align-items: flex-end;
                  gap: 3px;
                  height: 28px;
                  padding: 2px;
                ">
                  <span style="width: 3px; height: 12px; background: #38bdf8; animation: barPulse 1.2s infinite ease-in-out;"></span>
                  <span style="width: 3px; height: 22px; background: #38bdf8; animation: barPulse 0.9s infinite ease-in-out;"></span>
                  <span style="width: 3px; height: 18px; background: #38bdf8; animation: barPulse 1.4s infinite ease-in-out;"></span>
                  <span style="width: 3px; height: 26px; background: #38bdf8; animation: barPulse 0.8s infinite ease-in-out;"></span>
                  <span style="width: 3px; height: 15px; background: #38bdf8; animation: barPulse 1.1s infinite ease-in-out;"></span>
                  <span style="width: 3px; height: 24px; background: #38bdf8; animation: barPulse 1.3s infinite ease-in-out;"></span>
                  <span style="width: 3px; height: 10px; background: #38bdf8; animation: barPulse 1.0s infinite ease-in-out;"></span>
                  <span style="width: 3px; height: 20px; background: #38bdf8; animation: barPulse 0.7s infinite ease-in-out;"></span>
                </div>
                <div>
                  <div style="font-size: 0.85rem; color: #e2e8f0; font-weight: 600; letter-spacing: 0.08em;">
                    SUBSPACE CARRIER UPLINK // CHANNEL 01 ENCRYPTED
                  </div>
                  <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">
                    Carrier Phase: 432.8 Hz · Latency: 1.2ms · Signal-to-Noise: 48.6 dB
                  </div>
                </div>
              </div>

              <div style="font-size: 0.72rem; color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.35); padding: 3px 8px; border-radius: 4px; background: rgba(34, 197, 94, 0.1);">
                ● LIVE TRANSMISSION
              </div>
            </div>

            <!-- Terminal Transmit / Receive Feed -->
            <div style="
              flex: 1;
              min-height: 200px;
              max-height: 240px;
              background: rgba(3, 7, 18, 0.8);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 8px;
              padding: 14px 16px;
              overflow-y: auto;
              display: flex;
              flex-direction: column;
              gap: 10px;
            ">
              ${this.commReplyHistory
                .map(
                  (msg) => `
                <div style="font-size: 0.8rem; line-height: 1.45;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span style="color: ${msg.sender.startsWith('PILOT') ? '#7dd3fc' : msg.sender.startsWith('DR_VANCE') ? '#38bdf8' : '#cbd5e1'}; font-weight: 700; font-size: 0.75rem;">
                      [${msg.sender}]
                    </span>
                    <span style="color: #64748b; font-size: 0.7rem;">${msg.time}</span>
                  </div>
                  <div style="color: #e2e8f0; padding-left: 6px; border-left: 2px solid ${msg.sender.startsWith('PILOT') ? 'rgba(125, 211, 252, 0.4)' : 'rgba(56, 189, 248, 0.4)'};">
                    ${msg.text}
                  </div>
                </div>
              `
                )
                .join('')}
            </div>

            <!-- Transmission Query Console -->
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8; letter-spacing: 0.1em; margin-bottom: 8px; text-transform: uppercase;">
                SELECT TRANSMISSION PACKET TO BROADCAST:
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="comm-query-action" data-query="vance_briefing" style="
                  background: rgba(56, 189, 248, 0.12);
                  border: 1px solid rgba(56, 189, 248, 0.35);
                  color: #e0f2fe;
                  padding: 8px 14px;
                  border-radius: 6px;
                  font-size: 0.75rem;
                  cursor: pointer;
                  font-family: inherit;
                  transition: all 0.15s ease;
                ">
                  [📡 Query Survey Briefing]
                </button>
                <button class="comm-query-action" data-query="vance_fragments" style="
                  background: rgba(56, 189, 248, 0.12);
                  border: 1px solid rgba(56, 189, 248, 0.35);
                  color: #e0f2fe;
                  padding: 8px 14px;
                  border-radius: 6px;
                  font-size: 0.75rem;
                  cursor: pointer;
                  font-family: inherit;
                  transition: all 0.15s ease;
                ">
                  [📊 Transmit Fragment Telemetry]
                </button>
                <button class="comm-query-action" data-query="station_traffic" style="
                  background: rgba(56, 189, 248, 0.12);
                  border: 1px solid rgba(56, 189, 248, 0.35);
                  color: #e0f2fe;
                  padding: 8px 14px;
                  border-radius: 6px;
                  font-size: 0.75rem;
                  cursor: pointer;
                  font-family: inherit;
                  transition: all 0.15s ease;
                ">
                  [⚠️ Query Flight Navigation Hazard]
                </button>
              </div>
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
              <div>
                <h3 style="margin: 0; font-size: 0.95rem; color: #e2e8f0; letter-spacing: 0.08em; text-transform: uppercase;">
                  SIGNAL LABORATORY // HARMONIC SPECTRUM ANALYSIS
                </h3>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 3px;">
                  Fourier Phase Reconstruction · Builders Cryptographic Matrix
                </div>
              </div>
              ${
                canSynthesize
                  ? `<button id="btn-synthesize-key" style="background: linear-gradient(135deg, #0284c7, #38bdf8); border: none; color: white; padding: 9px 18px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 700; font-family: inherit; letter-spacing: 0.06em;">⚡ SYNTHESIZE HARMONIC KEY</button>`
                  : ''
              }
            </div>

            ${
              fragments.length === 0
                ? `<div style="padding: 40px; text-align: center; color: #64748b; background: rgba(3, 7, 18, 0.4); border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px; font-size: 0.82rem;">
                    NO RESONANCE FRAGMENTS CATALOGED IN SHIP STORAGE.<br>
                    LOCATE ANOMALY SIGNALS IN SPACE AND COMPLETE MULTI-STAGE SENSOR HARMONIZATION.
                  </div>`
                : fragments
                    .map(
                      (f) => `
                <div style="
                  background: rgba(15, 23, 42, 0.6);
                  border: 1px solid ${f.decrypted ? 'rgba(74, 222, 128, 0.4)' : 'rgba(56, 189, 248, 0.3)'};
                  border-radius: 8px;
                  padding: 14px 16px;
                ">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 700; color: #f8fafc; font-size: 0.9rem; letter-spacing: 0.05em;">${f.name.toUpperCase()}</div>
                    <span style="font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; background: ${f.decrypted ? 'rgba(74, 222, 128, 0.2)' : 'rgba(56, 189, 248, 0.2)'}; color: ${f.decrypted ? '#86efac' : '#38bdf8'}; border: 1px solid ${f.decrypted ? 'rgba(74, 222, 128, 0.4)' : 'rgba(56, 189, 248, 0.4)'};">
                      ${f.decrypted ? '✓ DECRYPTED' : '⧖ ENCRYPTED PHASE'}
                    </span>
                  </div>
                  <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 5px; font-family: ui-monospace, monospace;">
                    CARRIER: ${f.frequency.toFixed(1)} Hz // PAYLOAD: <span style="color: #38bdf8;">${f.dataPayload}</span> // RECOVERED: Beat ${f.originBeat}
                  </div>
                  <div style="font-size: 0.8rem; color: #cbd5e1; margin-top: 6px; line-height: 1.4;">
                    ${f.description}
                  </div>
                </div>
              `
                    )
                    .join('')
            }

            ${
              bothDecrypted
                ? `
              <div style="background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(74, 222, 128, 0.4); padding: 14px 18px; border-radius: 8px; color: #86efac; font-size: 0.82rem; line-height: 1.45;">
                ✓ <strong>HARMONIC ALIGNMENT KEY SYNTHESIZED:</strong> Target coordinates to the First Harmonic Relay have been calibrated and locked into your ship navigation computer.
              </div>
            `
                : ''
            }
          </div>
        `;
      }

      case 'station_logs': {
        const codex = state.unlockedCodexEntries;
        return `
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div>
              <h3 style="margin: 0; font-size: 0.95rem; color: #e2e8f0; letter-spacing: 0.08em; text-transform: uppercase;">
                STATION ARCHIVES & CODEX LOGS
              </h3>
              <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 3px;">
                Historical First Builders Telemetry & Frontier Survey Chronicles
              </div>
            </div>

            <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 0.8rem; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">
                LOG 4409.2 // SIGNAL SURVEY DISCOVERY
              </div>
              <div style="font-size: 0.78rem; color: #cbd5e1; line-height: 1.45;">
                "Observation: The harmonic resonance waves are not static relics. They are responsive carrier pulses that activate when modern sub-warp displacement engines enter their operational radius."
              </div>
            </div>

            <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 0.8rem; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">
                LOG 4410.8 // ANCIENT RELAY MAPPING
              </div>
              <div style="font-size: 0.78rem; color: #cbd5e1; line-height: 1.45;">
                "Three harmonic tuning spires detected standing dormant around a central celestial conduit. Without an aligned harmonic key, approaching ships cannot awaken the conduit array."
              </div>
            </div>

            ${
              codex.length > 0
                ? codex
                    .map((id) => `
                  <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 12px 16px;">
                    <div style="font-weight: 600; color: #7dd3fc; font-size: 0.8rem;">${id.replace(/_/g, ' ').toUpperCase()}</div>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">Unsealed research entry stored in ship computer memory.</div>
                  </div>
                `)
                    .join('')
                : ''
            }
          </div>
        `;
      }

      case 'systems_depot': {
        return `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <h3 style="margin: 0; font-size: 0.95rem; color: #e2e8f0; letter-spacing: 0.08em; text-transform: uppercase;">
                DOCKYARD REPAIR & SUPPLY INTERFACE
              </h3>
              <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 3px;">
                Automated Umbilical Systems · Hull Diagnostics · Cartography Exchange
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div style="background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 0.75rem; letter-spacing: 0.05em;">HULL DEFLECTOR ENVELOPE</div>
                <div style="font-size: 1.15rem; font-weight: 700; color: #86efac; margin-top: 6px;">100% NOMINAL</div>
                <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">Mooring tether providing active recharge</div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 0.75rem; letter-spacing: 0.05em;">IMPULSE PROPULSION RESERVES</div>
                <div style="font-size: 1.15rem; font-weight: 700; color: #38bdf8; margin-top: 6px;">REPLENISHED</div>
                <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">Reaction propellant tanks refilled to capacity</div>
              </div>
            </div>

            <div style="
              background: rgba(15, 23, 42, 0.5);
              border: 1px solid rgba(56, 189, 248, 0.25);
              border-radius: 8px;
              padding: 16px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              flex-wrap: wrap;
            ">
              <div>
                <div style="font-size: 0.85rem; color: #f8fafc; font-weight: 600;">CARTOGRAPHY & SURVEY DATA EXCHANGE</div>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">
                  Transmit sector telemetry logs to Epsilon-7 outpost for remuneration.
                </div>
              </div>
              <button id="btn-trade-survey-data" style="
                background: rgba(56, 189, 248, 0.15);
                border: 1px solid #38bdf8;
                color: #e0f2fe;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.78rem;
                font-weight: 700;
                font-family: inherit;
                transition: all 0.15s ease;
              ">
                UPLOAD DATA (+150 CR)
              </button>
            </div>

            <div style="font-size: 0.75rem; color: #94a3b8; padding: 8px 0;">
              Account Pilot Balance: <strong style="color: #f8fafc;">${this.saveSlot?.credits ?? 0} Credits</strong>
            </div>
          </div>
        `;
      }
    }
  }
}

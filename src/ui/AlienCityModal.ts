import { audio } from '../audio/AudioEngine';
import type { AlienCityInfo } from '../game/surface/AlienCitySettlement';
import type { PlayerStateStore } from '../game/progression/PlayerStateStore';

export class AlienCityModal {
  private container: HTMLElement;
  private isVisible = false;
  private currentCity: AlienCityInfo | null = null;
  private activeTab: 'cantina' | 'workshop' | 'council' | 'archive' = 'cantina';
  private playerState: PlayerStateStore | null = null;
  private onLaunchCallback: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'alien-city-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1600;
      background: radial-gradient(circle at 50% 50%, rgba(10, 16, 28, 0.94) 0%, rgba(3, 7, 18, 0.98) 100%);
      backdrop-filter: blur(14px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
      user-select: none;
    `;

    parent.appendChild(this.container);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.close();
      }
    });
  }

  public setPlayerState(state: PlayerStateStore): void {
    this.playerState = state;
  }

  public setOnLaunch(cb: () => void): void {
    this.onLaunchCallback = cb;
  }

  public open(city: AlienCityInfo): void {
    this.currentCity = city;
    this.isVisible = true;
    this.container.style.display = 'flex';
    audio.playConnectChime();
    this.render();
  }

  public close(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  public getIsOpen(): boolean {
    return this.isVisible;
  }

  private render(): void {
    if (!this.currentCity) return;

    const credits = this.playerState ? (this.playerState as any).getCredits?.() ?? 450 : 450;

    this.container.innerHTML = `
      <div style="
        background: rgba(15, 23, 42, 0.96);
        border: 1px solid rgba(56, 189, 248, 0.45);
        border-radius: 12px;
        width: 100%;
        max-width: 680px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.2);
        overflow: hidden;
      ">
        <!-- City Header -->
        <div style="
          padding: 16px 20px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(10, 16, 28, 0.8);
        ">
          <div>
            <div style="font-size: 11px; letter-spacing: 0.18em; color: #38bdf8; font-family: ui-monospace, monospace; font-weight: 700;">
              PLANETARY CONCOURSE & STARPORT
            </div>
            <div style="font-size: 20px; font-weight: 700; color: #f1f5f9; margin-top: 2px;">
              ${this.currentCity.name.toUpperCase()}
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
              ${this.currentCity.speciesName} · Pop. ~${this.currentCity.populationEstimate.toLocaleString()}
            </div>
          </div>

          <div style="text-align: right;">
            <div style="font-size: 10px; color: #94a3b8; font-family: ui-monospace, monospace;">CREDITS</div>
            <div style="font-size: 18px; font-weight: 700; color: #34d399; font-family: ui-monospace, monospace;">
              ${credits} ₵
            </div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div style="
          display: flex;
          background: rgba(15, 23, 42, 0.6);
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
        ">
          <button id="tab-cantina" style="
            flex: 1;
            padding: 10px 0;
            background: ${this.activeTab === 'cantina' ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
            border: none;
            border-bottom: 2px solid ${this.activeTab === 'cantina' ? '#38bdf8' : 'transparent'};
            color: ${this.activeTab === 'cantina' ? '#38bdf8' : '#94a3b8'};
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
          ">✦ CANTINA</button>

          <button id="tab-workshop" style="
            flex: 1;
            padding: 10px 0;
            background: ${this.activeTab === 'workshop' ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
            border: none;
            border-bottom: 2px solid ${this.activeTab === 'workshop' ? '#38bdf8' : 'transparent'};
            color: ${this.activeTab === 'workshop' ? '#38bdf8' : '#94a3b8'};
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
          ">⚡ BIO-FORGE</button>

          <button id="tab-council" style="
            flex: 1;
            padding: 10px 0;
            background: ${this.activeTab === 'council' ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
            border: none;
            border-bottom: 2px solid ${this.activeTab === 'council' ? '#38bdf8' : 'transparent'};
            color: ${this.activeTab === 'council' ? '#38bdf8' : '#94a3b8'};
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
          ">🏛️ COUNCIL</button>

          <button id="tab-archive" style="
            flex: 1;
            padding: 10px 0;
            background: ${this.activeTab === 'archive' ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
            border: none;
            border-bottom: 2px solid ${this.activeTab === 'archive' ? '#38bdf8' : 'transparent'};
            color: ${this.activeTab === 'archive' ? '#38bdf8' : '#94a3b8'};
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
          ">📜 ARCHIVE</button>
        </div>

        <!-- Content Area -->
        <div id="city-modal-content" style="
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
        ">
          ${this.renderTabContent()}
        </div>

        <!-- Footer / Takeoff -->
        <div style="
          padding: 14px 20px;
          border-top: 1px solid rgba(148, 163, 184, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(10, 16, 28, 0.9);
        ">
          <div style="font-size: 11px; color: #94a3b8;">
            Tethered to Starport Landing Pad #01
          </div>

          <div style="display: flex; gap: 10px;">
            <button id="btn-city-close" style="
              background: rgba(30, 41, 59, 0.8);
              border: 1px solid rgba(148, 163, 184, 0.3);
              color: #cbd5e1;
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
            ">STAY ON PAD</button>

            <button id="btn-city-launch" style="
              background: linear-gradient(135deg, #0284c7, #38bdf8);
              border: none;
              color: #0f172a;
              padding: 8px 20px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
              box-shadow: 0 4px 14px rgba(56, 189, 248, 0.4);
            ">LAUNCH TO FLIGHT 🚀</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderTabContent(): string {
    switch (this.activeTab) {
      case 'cantina':
        return `
          <div style="background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border-left: 3px solid #38bdf8;">
            <div style="font-weight: 600; color: #38bdf8; font-size: 14px;">The Resonant Tankard</div>
            <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px; line-height: 1.5;">
              A bustling alien cantina filled with harmonic synthesizer chimes, bioluminescent drinks, and travelers from across the spiral arm.
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #f8fafc; font-size: 13px;">Captain Vaelen (Freelance Wingman)</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">"Looking for honest flight work. I can watch your flank through hostile sectors."</div>
              </div>
              <button id="btn-hire-wingman" style="
                background: rgba(56, 189, 248, 0.2);
                border: 1px solid #38bdf8;
                color: #38bdf8;
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
              ">HIRE (150 ₵)</button>
            </div>

            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #f8fafc; font-size: 13px;">Xeno-Cartographer Nyx</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">"I tracked ancient lithic resonance readings near the polar ridge."</div>
              </div>
              <button id="btn-buy-intel" style="
                background: rgba(56, 189, 248, 0.2);
                border: 1px solid #38bdf8;
                color: #38bdf8;
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
              ">BUY INTEL (75 ₵)</button>
            </div>
          </div>
        `;

      case 'workshop':
        return `
          <div style="background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border-left: 3px solid #38bdf8;">
            <div style="font-weight: 600; color: #38bdf8; font-size: 14px;">Xeno-Tech Bio-Forge</div>
            <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px; line-height: 1.5;">
              Custom planetary spacecraft modifications engineered by indigenous artisans using crystalline lattices and organic field conductors.
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #38bdf8; font-size: 13px;">Xeno-Resonance Overdrive Injectors</div>
                <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Increases sublight boost acceleration by +35% with distinct violet ion plumes.</div>
              </div>
              <button id="btn-buy-mod-afterburners" style="
                background: linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(168, 85, 247, 0.3));
                border: 1px solid #38bdf8;
                color: #f1f5f9;
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
              ">INSTALL (200 ₵)</button>
            </div>

            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #34d399; font-size: 13px;">Acoustic Shroud Armor Chine Plates</div>
                <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Reinforced carbon-composite chine panels that dampen atmospheric turbulence.</div>
              </div>
              <button id="btn-buy-mod-armor" style="
                background: linear-gradient(135deg, rgba(52, 211, 153, 0.3), rgba(56, 189, 248, 0.3));
                border: 1px solid #34d399;
                color: #f1f5f9;
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
              ">INSTALL (180 ₵)</button>
            </div>

            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #fbbf24; font-size: 13px;">Deep-Mantle Graviton Harvester</div>
                <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Automatically collects ambient crystalline resource motes in low-altitude hover flight.</div>
              </div>
              <button id="btn-buy-mod-harvester" style="
                background: linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(56, 189, 248, 0.3));
                border: 1px solid #fbbf24;
                color: #f1f5f9;
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
              ">INSTALL (220 ₵)</button>
            </div>
          </div>
        `;

      case 'council':
        return `
          <div style="background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border-left: 3px solid #34d399;">
            <div style="font-weight: 600; color: #34d399; font-size: 14px;">Planetary Exploration Council</div>
            <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px; line-height: 1.5;">
              Register your planetary survey logs, flora/fauna scans, and ecological discoveries for substantial scientific grants.
            </div>
          </div>

          <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 13px; color: #f8fafc; font-weight: 600;">Planetary Survey Registry</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
              Submit your orbital and surface reconnaissance data to the council archives.
            </div>
            <button id="btn-claim-bounty" style="
              margin-top: 12px;
              background: linear-gradient(135deg, #10b981, #059669);
              border: none;
              color: #ffffff;
              padding: 8px 24px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
            ">REGISTER DISCOVERIES (+150 ₵)</button>
          </div>
        `;

      case 'archive':
        return `
          <div style="background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border-left: 3px solid #a855f7;">
            <div style="font-weight: 600; color: #c084fc; font-size: 14px;">Xeno-Archaeology Archives</div>
            <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px; line-height: 1.5;">
              Historical records of ${this.currentCity?.name || 'this settlement'} and the ancient harmonic resonance pillars scattered throughout the quadrant.
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
            <p>
              • <strong>Origins:</strong> Founded during the Second Harmonic Awakening, when the spires crystallized out of resonant basalt aquifers.
            </p>
            <p>
              • <strong>Acoustic Resonance:</strong> Indigenous species communicate via low-frequency substrate reverberations, preserving planetary folklore across millennia.
            </p>
            <p>
              • <strong>The Great Silence:</strong> Deep space telemetry records speak of a lost constellation of star gates that once connected every inhabited world.
            </p>
          </div>
        `;
    }
  }

  private bindEvents(): void {
    this.container.querySelector('#tab-cantina')?.addEventListener('click', () => {
      this.activeTab = 'cantina';
      audio.playBlip();
      this.render();
    });

    this.container.querySelector('#tab-workshop')?.addEventListener('click', () => {
      this.activeTab = 'workshop';
      audio.playBlip();
      this.render();
    });

    this.container.querySelector('#tab-council')?.addEventListener('click', () => {
      this.activeTab = 'council';
      audio.playBlip();
      this.render();
    });

    this.container.querySelector('#tab-archive')?.addEventListener('click', () => {
      this.activeTab = 'archive';
      audio.playBlip();
      this.render();
    });

    this.container.querySelector('#btn-city-close')?.addEventListener('click', () => {
      this.close();
    });

    this.container.querySelector('#btn-city-launch')?.addEventListener('click', () => {
      audio.playWarpEntry();
      this.close();
      this.onLaunchCallback?.();
    });

    this.container.querySelector('#btn-hire-wingman')?.addEventListener('click', () => {
      audio.playConnectChime();
      alert('Wingman hired! Captain Vaelen will provide escort coverage.');
    });

    this.container.querySelector('#btn-buy-intel')?.addEventListener('click', () => {
      audio.playConnectChime();
      alert('Intel downloaded! Polar anomaly coordinates highlighted on your navigation radar.');
    });

    this.container.querySelector('#btn-claim-bounty')?.addEventListener('click', () => {
      audio.playConnectChime();
      if (this.playerState && (this.playerState as any).addCredits) {
        (this.playerState as any).addCredits(150);
      }
      this.render();
    });

    const installMod = (modId: string) => {
      audio.playConnectChime();
      if (this.playerState && (this.playerState as any).installModule) {
        (this.playerState as any).installModule(modId);
      }
      this.render();
    };

    this.container.querySelector('#btn-buy-mod-afterburners')?.addEventListener('click', () => {
      installMod('mod_propulsion_ion_vector');
    });

    this.container.querySelector('#btn-buy-mod-armor')?.addEventListener('click', () => {
      installMod('mod_surface_grav_stabilizer');
    });

    this.container.querySelector('#btn-buy-mod-harvester')?.addEventListener('click', () => {
      installMod('mod_survey_mote_magnet');
    });
  }

  public dispose(): void {
    this.container.remove();
  }
}

import type { SpaceStation } from '../game/stations/SpaceStationManager';
import type { NamedVessel } from '../game/vessels/NamedVesselDirector';
import type { StoryDirector } from '../story/StoryDirector';
import type { PlayerSaveSlot } from '../persistence/SaveManager';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';
import { MarketService } from '../game/economy/MarketService';
import { CraftingService } from '../game/economy/CraftingService';
import { CRAFTING_RECIPES } from '../game/economy/CraftingCatalog';
import { SHIP_MODULE_CATALOG } from '../game/progression/ShipProgression';
import { audio } from '../audio/AudioEngine';
import { localAI } from '../ai/LocalIntelligenceService';
import type { SandboxDialogueContext } from '../ai/LoreContextBuilder';

export interface StationModalCallbacks {
  onUndock: () => void;
  onTalkToNPC?: (npcId: string) => void;
  onClose: () => void;
  onModuleInstalled?: (moduleId: string) => void;
  onSave?: () => void;
}

export type DockedTerminalTab = 'market' | 'fabricator' | 'shipyard' | 'services' | 'comms';

export class StationInterfaceModal {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private isVisible = false;
  private activeTab: DockedTerminalTab = 'market';
  private target: SpaceStation | NamedVessel | null = null;
  private system: StarSystemDescriptor | null = null;
  private saveSlot: PlayerSaveSlot | null = null;
  private callbacks: StationModalCallbacks;
  private commHistory: Array<{ sender: string; text: string; time: string }> = [];

  constructor(container: HTMLElement, callbacks: StationModalCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  private getSupportedTabs(): DockedTerminalTab[] {
    if (!this.target) return ['comms'];
    const services = (this.target.services || []) as string[];
    const tabs: DockedTerminalTab[] = [];
    if (services.includes('MARKET')) tabs.push('market');
    if (services.includes('FABRICATOR')) tabs.push('fabricator');
    if (services.includes('SHIPYARD')) tabs.push('shipyard');
    if (services.includes('SERVICES')) tabs.push('services');
    if (services.includes('COMMS') || tabs.length === 0) tabs.push('comms');
    return tabs;
  }

  public show(
    target: SpaceStation | NamedVessel,
    storyDirector: StoryDirector | null | undefined,
    saveSlot: PlayerSaveSlot,
    system?: StarSystemDescriptor | null
  ): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.target = target;
    this.saveSlot = saveSlot;
    this.system = system ?? (storyDirector as any)?.currentSystem ?? null;

    // Set active tab to supported service
    const supported = this.getSupportedTabs();
    if (!supported.includes(this.activeTab)) {
      this.activeTab = supported[0] || 'comms';
    }

    // Track station/vessel discovery in saveSlot
    if (this.target) {
      if (this.target.entityKind === 'STATION') {
        if (!saveSlot.knownStations) saveSlot.knownStations = [];
        if (!saveSlot.knownStations.includes(this.target.id)) {
          saveSlot.knownStations.push(this.target.id);
          this.callbacks.onSave?.();
        }
      } else {
        if (!saveSlot.knownVessels) saveSlot.knownVessels = [];
        if (!saveSlot.knownVessels.includes(this.target.id)) {
          saveSlot.knownVessels.push(this.target.id);
          this.callbacks.onSave?.();
        }
      }
    }

    // Default opening comms greeting
    if (this.commHistory.length === 0) {
      const now = new Date().toTimeString().split(' ')[0];
      const isStation = this.target.entityKind === 'STATION';
      const speaker = isStation
        ? `${this.target.name.toUpperCase()} TRAFFIC CONTROL`
        : `${(this.target as NamedVessel).captainName.toUpperCase()} // BRIDGE`;
      const greeting = this.target.greeting || (isStation
        ? 'Umbilical magnetic lock confirmed. Remote logistics link established.'
        : 'Welcome aboard our vessel. Sub-space docking tether secured.');

      this.commHistory.push({
        sender: speaker,
        text: greeting,
        time: now,
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
      animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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

  public getSaveSlot(): PlayerSaveSlot | null {
    return this.saveSlot;
  }

  public getTarget(): SpaceStation | NamedVessel | null {
    return this.target;
  }

  private render(): void {
    if (!this.modalEl || !this.target || !this.saveSlot) return;

    const credits = this.saveSlot.credits ?? 0;
    const isStation = this.target.entityKind === 'STATION';
    const archetype = isStation
      ? (this.target as SpaceStation).archetype
      : ((this.target as NamedVessel).marketArchetype || 'TRADE_HUB');
    const faction = (this.target as any).faction || (this.target as any).species || 'Independent';

    const supportedTabs = this.getSupportedTabs();
    if (!supportedTabs.includes(this.activeTab)) {
      this.activeTab = supportedTabs[0] || 'comms';
    }

    const currentCargoUsed = Object.values(this.saveSlot.sampleInventory || {}).reduce((a, b) => a + b, 0) +
      Object.values(this.saveSlot.commodityInventory || {}).reduce((a, b) => a + b, 0);
    const maxCargo = this.saveSlot.cargoCapacity || 60;

    this.modalEl.innerHTML = `
      <div style="
        width: min(960px, 95vw);
        height: min(680px, 92vh);
        background: rgba(10, 17, 34, 0.97);
        border: 1px solid rgba(56, 189, 248, 0.4);
        box-shadow: 0 0 60px rgba(56, 189, 248, 0.12), inset 0 0 24px rgba(3, 7, 18, 0.85);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- Terminal Header -->
        <div style="
          padding: 14px 20px;
          border-bottom: 1px solid rgba(56, 189, 248, 0.25);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(4, 9, 20, 0.9);
          gap: 12px;
          flex-wrap: wrap;
        ">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 10px #4ade80;"></span>
              <h2 style="margin: 0; font-size: 1.1rem; letter-spacing: 0.12em; font-weight: 700; color: #f8fafc; text-transform: uppercase;">
                ${this.target.name}
              </h2>
              <span style="font-size: 0.72rem; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">
                ${archetype.replace('_', ' ')} · DOCKED
              </span>
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px; font-family: ui-monospace, monospace;">
              AFFILIATION: <span style="color: #cbd5e1;">${faction.toUpperCase()}</span> // CARGO: <span style="color: #4ade80;">${currentCargoUsed} / ${maxCargo} UNITS</span> // BALANCE: <span style="color: #38bdf8; font-weight: 700;">${credits} CR</span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="station-btn-undock-header" style="
              background: rgba(239, 68, 68, 0.15);
              border: 1px solid rgba(239, 68, 68, 0.5);
              color: #fca5a5;
              padding: 8px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.8rem;
              font-weight: 600;
              letter-spacing: 0.08em;
              transition: all 0.15s ease;
              white-space: nowrap;
            ">
              ⏏ DISENGAGE & UNDOCK
            </button>
          </div>
        </div>

        <!-- Channel Navigation Tabs -->
        <div class="modal-scrollable-x" data-scrollable="true" style="
          display: flex;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 14, 28, 0.75);
          padding: 0 16px;
          gap: 4px;
          overflow-x: auto;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
        ">
          ${supportedTabs.map((tab, idx) => {
            const labels: Record<DockedTerminalTab, string> = {
              market: `CH 0${idx + 1} // COMMERCE MARKET`,
              fabricator: `CH 0${idx + 1} // FABRICATOR WORKSHOP`,
              shipyard: `CH 0${idx + 1} // SHIPYARD MODULES`,
              services: `CH 0${idx + 1} // TERMINAL SERVICES`,
              comms: `CH 0${idx + 1} // SUBSPACE COMMS`,
            };
            return this.renderTabButton(tab, labels[tab]);
          }).join('')}
        </div>

        <!-- Tab Content Area -->
        <div id="station-tab-content" class="modal-scrollable" data-scrollable="true" style="
          flex: 1;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          padding: 20px 24px;
        ">
          ${this.renderActiveTabContent()}
        </div>
      </div>
    `;

    // Bind tab switching
    this.modalEl.querySelectorAll('.station-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as DockedTerminalTab;
        if (tab) {
          this.activeTab = tab;
          audio.playBlip();
          this.render();
        }
      });
    });

    // Bind undock
    const undockBtn = this.modalEl.querySelector('#station-btn-undock-header');
    if (undockBtn) {
      undockBtn.addEventListener('click', () => {
        this.hide();
        this.callbacks.onUndock();
      });
    }

    this.bindTabActionListeners();
  }

  private renderTabButton(tabKey: DockedTerminalTab, label: string): string {
    const isActive = this.activeTab === tabKey;
    return `
      <button class="station-tab-btn" data-tab="${tabKey}" style="
        padding: 10px 14px;
        background: transparent;
        border: none;
        border-bottom: 2px solid ${isActive ? '#38bdf8' : 'transparent'};
        color: ${isActive ? '#38bdf8' : '#94a3b8'};
        font-weight: ${isActive ? '700' : '400'};
        cursor: pointer;
        font-size: 0.78rem;
        font-family: inherit;
        letter-spacing: 0.06em;
        transition: all 0.15s ease;
        white-space: nowrap;
      ">
        ${label}
      </button>
    `;
  }

  private renderActiveTabContent(): string {
    if (!this.target || !this.saveSlot) return '';

    const isStation = this.target.entityKind === 'STATION';
    const archetype = isStation
      ? (this.target as SpaceStation).archetype
      : ((this.target as NamedVessel).marketArchetype || 'TRADE_HUB');
    const sysSeed = this.system?.seed ?? 104729;

    switch (this.activeTab) {
      case 'market': {
        const quotes = MarketService.getMarketQuotes(archetype, sysSeed, this.target.id, this.saveSlot);
        const playerSamples = this.saveSlot.sampleInventory || {};
        const playerCommodities = this.saveSlot.commodityInventory || {};

        return `
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <!-- Header bar -->
            <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px;">
              <div>
                <h3 style="margin: 0; font-size: 0.95rem; color: #f8fafc; letter-spacing: 0.08em; text-transform: uppercase;">
                  COMMODITIES & TRADE EXCHANGE // LOCAL CONCOURSE
                </h3>
                <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 3px;">
                  Current Market Profile: <span style="color: #38bdf8;">${archetype.replace('_', ' ')}</span> · Instant settlement
                </div>
              </div>
              <div style="font-size: 0.78rem; color: #cbd5e1;">
                Available Pilot Liquidity: <span style="color: #38bdf8; font-weight: 700;">${this.saveSlot.credits ?? 0} CR</span>
              </div>
            </div>

            <!-- Planetary Samples Liquidation Section -->
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 14px 16px;">
              <div style="font-size: 0.8rem; font-weight: 700; color: #7dd3fc; margin-bottom: 8px; letter-spacing: 0.06em;">
                PLANETARY EXPLORATION SAMPLES // STATION BUYOUT
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                ${quotes.samples
                  .map((s) => {
                    const owned = playerSamples[s.id] || 0;
                    return `
                      <div style="background: rgba(3, 7, 18, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                          <span style="color: #f1f5f9; font-weight: 600;">${s.id}</span>
                          <span style="color: #94a3b8;">Cargo: <strong style="color: ${owned > 0 ? '#38bdf8' : '#64748b'};">${owned}</strong></span>
                        </div>
                        <div style="font-size: 0.72rem; color: #4ade80;">+${s.sellPrice} CR / sample</div>
                        <button class="btn-sell-sample" data-sample="${s.id}" ${owned === 0 ? 'disabled' : ''} style="
                          margin-top: 4px;
                          background: ${owned > 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(51, 65, 85, 0.3)'};
                          border: 1px solid ${owned > 0 ? 'rgba(74, 222, 128, 0.4)' : 'rgba(148, 163, 184, 0.2)'};
                          color: ${owned > 0 ? '#86efac' : '#64748b'};
                          padding: 5px 8px;
                          border-radius: 4px;
                          font-size: 0.7rem;
                          font-weight: 600;
                          cursor: ${owned > 0 ? 'pointer' : 'default'};
                        ">
                          SELL 1 (+${s.sellPrice} CR)
                        </button>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>

            <!-- Refined Commodities Table -->
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 14px 16px;">
              <div style="font-size: 0.8rem; font-weight: 700; color: #7dd3fc; margin-bottom: 10px; letter-spacing: 0.06em;">
                REFINED INDUSTRIAL & HIGH-TECH COMMODITIES
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${quotes.commodities
                  .map((c) => {
                    const owned = playerCommodities[c.id] || 0;
                    const canAfford = (this.saveSlot?.credits ?? 0) >= c.buyPrice;
                    return `
                      <div style="
                        background: rgba(3, 7, 18, 0.6);
                        border: 1px solid rgba(255, 255, 255, 0.06);
                        border-radius: 6px;
                        padding: 10px 14px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                        flex-wrap: wrap;
                      ">
                        <div style="flex: 1; min-width: 180px;">
                          <div style="font-size: 0.82rem; font-weight: 700; color: #f8fafc;">${c.name}</div>
                          <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">
                            ${c.category} · In Station Cargo: ${c.stationStock} units
                          </div>
                        </div>

                        <div style="display: flex; align-items: center; gap: 14px;">
                          <div style="font-size: 0.75rem; text-align: right;">
                            <div style="color: #cbd5e1;">Cargo: <strong style="color: ${owned > 0 ? '#38bdf8' : '#64748b'};">${owned}</strong></div>
                            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">
                              Buy: <span style="color: #f87171;">${c.buyPrice} CR</span> / Sell: <span style="color: #4ade80;">${c.sellPrice} CR</span>
                            </div>
                          </div>

                          <div style="display: flex; gap: 6px;">
                            <button class="btn-buy-commodity" data-comm="${c.id}" ${!canAfford ? 'disabled' : ''} style="
                              background: ${canAfford ? 'rgba(56, 189, 248, 0.18)' : 'rgba(51, 65, 85, 0.3)'};
                              border: 1px solid ${canAfford ? 'rgba(56, 189, 248, 0.5)' : 'rgba(148, 163, 184, 0.2)'};
                              color: ${canAfford ? '#38bdf8' : '#64748b'};
                              padding: 6px 12px;
                              border-radius: 4px;
                              font-size: 0.72rem;
                              font-weight: 600;
                              cursor: ${canAfford ? 'pointer' : 'default'};
                            ">
                              BUY [${c.buyPrice} CR]
                            </button>
                            <button class="btn-sell-commodity" data-comm="${c.id}" ${owned === 0 ? 'disabled' : ''} style="
                              background: ${owned > 0 ? 'rgba(74, 222, 128, 0.18)' : 'rgba(51, 65, 85, 0.3)'};
                              border: 1px solid ${owned > 0 ? 'rgba(74, 222, 128, 0.5)' : 'rgba(148, 163, 184, 0.2)'};
                              color: ${owned > 0 ? '#86efac' : '#64748b'};
                              padding: 6px 12px;
                              border-radius: 4px;
                              font-size: 0.72rem;
                              font-weight: 600;
                              cursor: ${owned > 0 ? 'pointer' : 'default'};
                            ">
                              SELL [+${c.sellPrice} CR]
                            </button>
                          </div>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          </div>
        `;
      }

      case 'fabricator': {
        const samples = this.saveSlot.sampleInventory || {};
        const commodities = this.saveSlot.commodityInventory || {};

        return `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <h3 style="margin: 0; font-size: 0.95rem; color: #f8fafc; letter-spacing: 0.08em; text-transform: uppercase;">
                ON-SITE MATERIAL FABRICATOR & SYNTHESIS DECK
              </h3>
              <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 3px;">
                Smelt planetary ores, compound coolants, and assemble advanced components.
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${CRAFTING_RECIPES.map((r) => {
                const validation = CraftingService.validateRecipe(this.saveSlot!, r);
                const reqsStr = r.ingredients
                  .map((ing) => {
                    const have = ing.type === 'SAMPLE' ? samples[ing.id] || 0 : commodities[ing.id] || 0;
                    const ok = have >= ing.count;
                    return `<span style="color: ${ok ? '#86efac' : '#f87171'};">${ing.count}x ${ing.id.replace('_', ' ')} (${have}/${ing.count})</span>`;
                  })
                  .join(', ');

                return `
                  <div style="
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(56, 189, 248, 0.25);
                    border-radius: 8px;
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                  ">
                    <div style="flex: 1; min-width: 200px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.85rem; font-weight: 700; color: #f8fafc;">${r.name}</span>
                        <span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8;">
                          ${r.category}
                        </span>
                      </div>
                      <div style="font-size: 0.72rem; color: #cbd5e1; margin-top: 4px;">
                        ${r.description}
                      </div>
                      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 5px;">
                        Requires: ${reqsStr} + <span style="color: ${(this.saveSlot?.credits ?? 0) >= r.creditsCost ? '#38bdf8' : '#f87171'};">${r.creditsCost} CR</span>
                      </div>
                    </div>

                    <div>
                      <button class="btn-craft-recipe" data-recipe="${r.id}" ${!validation.canCraft ? 'disabled' : ''} style="
                        background: ${validation.canCraft ? 'linear-gradient(135deg, #0284c7, #38bdf8)' : 'rgba(51, 65, 85, 0.3)'};
                        border: 1px solid ${validation.canCraft ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'};
                        color: ${validation.canCraft ? '#ffffff' : '#64748b'};
                        padding: 8px 16px;
                        border-radius: 6px;
                        font-size: 0.75rem;
                        font-weight: 700;
                        font-family: inherit;
                        cursor: ${validation.canCraft ? 'pointer' : 'default'};
                      ">
                        FABRICATE
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      case 'shipyard': {
        const installed = this.saveSlot.installedModules || [];
        const credits = this.saveSlot.credits ?? 0;
        const samples = this.saveSlot.sampleInventory || {};

        return `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <h3 style="margin: 0; font-size: 0.95rem; color: #f8fafc; letter-spacing: 0.08em; text-transform: uppercase;">
                DRYDOCK OUTFITTING & SHIP UPGRADE REQUISITION
              </h3>
              <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 3px;">
                Direct gantry installation of functional propulsion, sensors, and structural modules.
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${SHIP_MODULE_CATALOG.map((mod) => {
                const isInstalled = installed.includes(mod.id);

                let hasSamples = true;
                const reqsStr = mod.sampleRequirements
                  .map((req) => {
                    const have = samples[req.category] || 0;
                    if (have < req.count) hasSamples = false;
                    return `${req.count}x ${req.category} (${have}/${req.count})`;
                  })
                  .join(', ');

                const canAfford = credits >= mod.costCredits && hasSamples;

                return `
                  <div style="
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid ${isInstalled ? 'rgba(74, 222, 128, 0.4)' : 'rgba(56, 189, 248, 0.25)'};
                    border-radius: 8px;
                    padding: 14px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                  ">
                    <div style="flex: 1; min-width: 200px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.88rem; font-weight: 700; color: #f8fafc;">${mod.name}</span>
                        <span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8;">
                          ${mod.category} · TIER ${mod.tier}
                        </span>
                        ${isInstalled ? '<span style="font-size: 0.68rem; color: #86efac; font-weight: 700;">[INSTALLED]</span>' : ''}
                      </div>
                      <div style="font-size: 0.72rem; color: #cbd5e1; margin-top: 4px;">
                        ${mod.description}
                      </div>
                      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 5px;">
                        Requisition Cost: <span style="color: ${credits >= mod.costCredits ? '#38bdf8' : '#f87171'}; font-weight: 600;">${mod.costCredits} CR</span> · Materials: <span style="color: ${hasSamples ? '#93c5fd' : '#f87171'};">${reqsStr}</span>
                      </div>
                    </div>

                    <div>
                      ${
                        isInstalled
                          ? `<button disabled style="background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.4); color: #86efac; padding: 7px 14px; border-radius: 6px; font-size: 0.75rem; cursor: default;">ACTIVE ON HULL</button>`
                          : `<button class="btn-install-module" data-module="${mod.id}" ${!canAfford ? 'disabled' : ''} style="
                              background: ${canAfford ? 'linear-gradient(135deg, #0284c7, #38bdf8)' : 'rgba(51, 65, 85, 0.3)'};
                              border: 1px solid ${canAfford ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'};
                              color: ${canAfford ? '#ffffff' : '#64748b'};
                              padding: 8px 16px;
                              border-radius: 6px;
                              font-size: 0.75rem;
                              font-weight: 700;
                              font-family: inherit;
                              cursor: ${canAfford ? 'pointer' : 'default'};
                            ">
                              INSTALL UPGRADE
                            </button>`
                      }
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      case 'services': {
        return `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <h3 style="margin: 0; font-size: 0.95rem; color: #f8fafc; letter-spacing: 0.08em; text-transform: uppercase;">
                DOCKYARD MAINTENANCE & SURVEY CARTOGRAPHY UPLOAD
              </h3>
              <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 3px;">
                Station maintenance umbilicals, hull diagnostics, and stellar survey data remuneration.
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 0.72rem; letter-spacing: 0.05em;">DEFLECTOR INTEGRITY</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: #86efac; margin-top: 4px;">100% RECHARGED</div>
                <div style="font-size: 0.68rem; color: #64748b; margin-top: 2px;">Active mooring power feed engaged</div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 0.72rem; letter-spacing: 0.05em;">REACTION PROPELLANT</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: #38bdf8; margin-top: 4px;">CAPACITY FULL</div>
                <div style="font-size: 0.68rem; color: #64748b; margin-top: 2px;">Interplanetary impulse thrusters pressurized</div>
              </div>
            </div>

            <!-- Survey Upload Section -->
            <div style="
              background: rgba(15, 23, 42, 0.6);
              border: 1px solid rgba(56, 189, 248, 0.3);
              border-radius: 8px;
              padding: 16px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 14px;
              flex-wrap: wrap;
            ">
              <div>
                <div style="font-size: 0.85rem; color: #f8fafc; font-weight: 600;">CARTOGRAPHY & SURVEY DATA TELEMETRY</div>
                <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 3px;">
                  Transmit local stellar observations and anomaly telemetry to station archives for remuneration.
                </div>
              </div>
              <button id="btn-upload-survey-telemetry" style="
                background: rgba(56, 189, 248, 0.18);
                border: 1px solid #38bdf8;
                color: #e0f2fe;
                padding: 9px 18px;
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
          </div>
        `;
      }

      case 'comms': {
        const isShip = !isStation;
        const vessel = isShip ? (this.target as NamedVessel) : null;
        const captainName = isShip ? (vessel?.captainName || 'Commander') : 'Station Flight Control';
        const targetTitle = isShip ? `VESSEL COMMS // ${this.target.name}` : `STATION LINK // ${this.target.name}`;
        const faction = (this.target as any).faction || (this.target as any).species || 'Independent Coalition';
        const vArch = vessel?.archetype;
        const avatarEmoji = isStation ? '🛰️' : vArch === 'ORGANIC_BIO' ? '👾' : vArch === 'INDUSTRIAL_HAULER' ? '⚓' : vArch === 'CATHEDRAL_CAPITAL' ? '🏛️' : '🧑‍🚀';

        return `
          <div style="display: flex; gap: 16px; height: 100%; min-height: 380px;">
            <!-- Left Column: Holographic Commander / Controller Viewport -->
            <div style="
              flex: 0 0 240px;
              width: 240px;
              background: rgba(4, 9, 20, 0.88);
              border: 1px solid rgba(56, 189, 248, 0.28);
              border-radius: 8px;
              padding: 14px;
              display: flex;
              flex-direction: column;
              gap: 12px;
              box-sizing: border-box;
            ">
              <!-- Holographic CRT Viewport -->
              <div style="
                position: relative;
                height: 145px;
                background: radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.2) 0%, rgba(3, 7, 18, 0.98) 100%);
                border: 1px solid rgba(56, 189, 248, 0.45);
                border-radius: 6px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                box-shadow: inset 0 0 20px rgba(56, 189, 248, 0.2);
              ">
                <!-- Scanline FX -->
                <div style="
                  position: absolute;
                  inset: 0;
                  background: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 4px);
                  pointer-events: none;
                "></div>

                <div style="font-size: 44px; filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.8));">
                  ${avatarEmoji}
                </div>

                <div style="
                  margin-top: 6px;
                  font-size: 9.5px;
                  font-weight: 700;
                  letter-spacing: 0.1em;
                  color: #7dd3fc;
                  text-transform: uppercase;
                  background: rgba(3, 7, 18, 0.85);
                  border: 1px solid rgba(56, 189, 248, 0.35);
                  padding: 2px 8px;
                  border-radius: 4px;
                ">
                  ${captainName}
                </div>

                <div style="position: absolute; bottom: 4px; font-size: 7.5px; color: #64748b; font-family: ui-monospace, monospace; letter-spacing: 0.05em;">
                  FREQ: 1420.405 MHz // CARRIER LOCK
                </div>
              </div>

              <!-- Animated Frequency Equalizer -->
              <div style="display: flex; align-items: flex-end; justify-content: center; gap: 4px; height: 16px; padding: 0 8px;">
                <span style="display:inline-block; width:3px; height:60%; background:#38bdf8; border-radius:2px;"></span>
                <span style="display:inline-block; width:3px; height:85%; background:#38bdf8; border-radius:2px;"></span>
                <span style="display:inline-block; width:3px; height:40%; background:#38bdf8; border-radius:2px;"></span>
                <span style="display:inline-block; width:3px; height:100%; background:#4ade80; border-radius:2px;"></span>
                <span style="display:inline-block; width:3px; height:75%; background:#38bdf8; border-radius:2px;"></span>
                <span style="display:inline-block; width:3px; height:50%; background:#38bdf8; border-radius:2px;"></span>
                <span style="display:inline-block; width:3px; height:90%; background:#4ade80; border-radius:2px;"></span>
                <span style="display:inline-block; width:3px; height:65%; background:#38bdf8; border-radius:2px;"></span>
              </div>

              <!-- Tactical Comms Telemetry -->
              <div style="font-size: 8.5px; line-height: 1.6; color: #94a3b8; font-family: ui-monospace, monospace;">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">
                  <span>FEED:</span>
                  <span style="color: #4ade80; font-weight: 700;">QUANTUM LINK</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
                  <span>CLASS:</span>
                  <span style="color: #7dd3fc;">${archetype}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
                  <span>FACTION:</span>
                  <span style="color: #e2e8f0;">${faction}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-top: 2px;">
                  <span>CLEARANCE:</span>
                  <span style="color: #facc15; font-weight: 700;">ALPHA-9 OK</span>
                </div>
              </div>
            </div>

            <!-- Right Column: Subspace Transmission Feed & Interactive Responses -->
            <div style="flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 10px; height: 100%;">
              <div style="font-size: 0.72rem; color: #7dd3fc; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700;">
                📡 ${targetTitle}
              </div>

              <!-- Transmission Feed Box -->
              <div class="modal-scrollable" data-scrollable="true" style="
                flex: 1;
                min-height: 200px;
                max-height: 250px;
                background: rgba(2, 6, 18, 0.85);
                border: 1px solid rgba(56, 189, 248, 0.2);
                border-radius: 8px;
                padding: 12px 14px;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                touch-action: pan-y;
                display: flex;
                flex-direction: column;
                gap: 10px;
              ">
                ${this.commHistory
                  .map(
                    (msg) => `
                  <div style="font-size: 0.76rem; line-height: 1.45;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                      <span style="color: ${msg.sender.startsWith('PILOT') ? '#7dd3fc' : '#4ade80'}; font-weight: 700; font-size: 0.70rem;">
                        ${msg.sender.startsWith('PILOT') ? '🚀' : '📡'} [${msg.sender}]
                      </span>
                      <span style="color: #64748b; font-size: 0.65rem;">${msg.time}</span>
                    </div>
                    <div style="
                      color: #e2e8f0;
                      padding: 6px 10px;
                      background: ${msg.sender.startsWith('PILOT') ? 'rgba(56, 189, 248, 0.08)' : 'rgba(74, 222, 128, 0.06)'};
                      border-left: 2px solid ${msg.sender.startsWith('PILOT') ? '#38bdf8' : '#4ade80'};
                      border-radius: 0 6px 6px 0;
                    ">
                      ${msg.text}
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>

              <!-- Interactive Dialogue Inquiries -->
              <div>
                <div style="font-size: 0.68rem; color: #94a3b8; letter-spacing: 0.08em; margin-bottom: 6px; text-transform: uppercase;">
                  TRANSMIT TACTICAL INQUIRY:
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button class="btn-comms-query" data-query="traffic_advisory" style="
                    background: rgba(56, 189, 248, 0.12);
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    color: #e0f2fe;
                    padding: 7px 11px;
                    border-radius: 6px;
                    font-size: 0.70rem;
                    cursor: pointer;
                    font-family: inherit;
                    transition: background 0.15s ease;
                  ">
                    ${isShip ? '📡 Tactical Route & Threat Scan' : '📡 Flight Control Approach Vectors'}
                  </button>
                  <button class="btn-comms-query" data-query="trade_routes" style="
                    background: rgba(56, 189, 248, 0.12);
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    color: #e0f2fe;
                    padding: 7px 11px;
                    border-radius: 6px;
                    font-size: 0.70rem;
                    cursor: pointer;
                    font-family: inherit;
                    transition: background 0.15s ease;
                  ">
                    ${isShip ? '📈 Convoy Trade Intel & Rumors' : '📈 Commodity Demand Forecast'}
                  </button>
                  <button class="btn-comms-query" data-query="customs_lore" style="
                    background: rgba(56, 189, 248, 0.12);
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    color: #e0f2fe;
                    padding: 7px 11px;
                    border-radius: 6px;
                    font-size: 0.70rem;
                    cursor: pointer;
                    font-family: inherit;
                    transition: background 0.15s ease;
                  ">
                    ${isShip ? '📜 Vessel Charter & Mission Log' : '📜 Outpost History & Charter'}
                  </button>
                  <button class="btn-comms-query" data-query="auxiliary_support" style="
                    background: rgba(74, 222, 128, 0.12);
                    border: 1px solid rgba(74, 222, 128, 0.4);
                    color: #bbf7d0;
                    padding: 7px 11px;
                    border-radius: 6px;
                    font-size: 0.70rem;
                    cursor: pointer;
                    font-family: inherit;
                    transition: background 0.15s ease;
                  ">
                    ${isShip ? '⚡ Telemetry Sync & Shield Check' : '⚡ Umbilical Power & Diagnostics'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }
  }

  private bindTabActionListeners(): void {
    if (!this.modalEl || !this.target || !this.saveSlot) return;

    const isStation = this.target.entityKind === 'STATION';
    const archetype = isStation
      ? (this.target as SpaceStation).archetype
      : ((this.target as NamedVessel).marketArchetype || 'TRADE_HUB');
    const sysSeed = this.system?.seed ?? 104729;

    // BUY Commodity
    this.modalEl.querySelectorAll('.btn-buy-commodity').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const commId = (e.currentTarget as HTMLElement).getAttribute('data-comm');
        if (commId && this.saveSlot && this.target) {
          const res = MarketService.buyCommodity(this.saveSlot, commId, 1, archetype, sysSeed, this.target.id);
          if (res.success) {
            audio.playConnectChime();
            this.callbacks.onSave?.();
            this.render();
          } else {
            audio.playScanEffect();
          }
        }
      });
    });

    // SELL Commodity
    this.modalEl.querySelectorAll('.btn-sell-commodity').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const commId = (e.currentTarget as HTMLElement).getAttribute('data-comm');
        if (commId && this.saveSlot && this.target) {
          const res = MarketService.sellCommodity(this.saveSlot, commId, 1, archetype, sysSeed, this.target.id);
          if (res.success) {
            audio.playConnectChime();
            this.callbacks.onSave?.();
            this.render();
          } else {
            audio.playScanEffect();
          }
        }
      });
    });

    // SELL Sample
    this.modalEl.querySelectorAll('.btn-sell-sample').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const sampleCat = (e.currentTarget as HTMLElement).getAttribute('data-sample');
        if (sampleCat && this.saveSlot && this.target) {
          const res = MarketService.sellSample(this.saveSlot, sampleCat, 1, archetype, sysSeed, this.target.id);
          if (res.success) {
            audio.playConnectChime();
            this.callbacks.onSave?.();
            this.render();
          } else {
            audio.playScanEffect();
          }
        }
      });
    });

    // CRAFT Recipe
    this.modalEl.querySelectorAll('.btn-craft-recipe').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const recId = (e.currentTarget as HTMLElement).getAttribute('data-recipe');
        if (recId && this.saveSlot) {
          const res = CraftingService.craftRecipe(this.saveSlot, recId);
          if (res.success) {
            audio.playConnectChime();
            this.callbacks.onSave?.();
            this.render();
          } else {
            audio.playScanEffect();
          }
        }
      });
    });

    // INSTALL Module
    this.modalEl.querySelectorAll('.btn-install-module').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modId = (e.currentTarget as HTMLElement).getAttribute('data-module');
        const mod = SHIP_MODULE_CATALOG.find((m) => m.id === modId);
        if (mod && this.saveSlot) {
          const credits = this.saveSlot.credits ?? 0;
          const samples = this.saveSlot.sampleInventory || {};
          let canAfford = credits >= mod.costCredits;
          for (const req of mod.sampleRequirements) {
            if ((samples[req.category] || 0) < req.count) canAfford = false;
          }

          if (canAfford) {
            this.saveSlot.credits = credits - mod.costCredits;
            for (const req of mod.sampleRequirements) {
              this.saveSlot.sampleInventory[req.category] -= req.count;
              if (this.saveSlot.sampleInventory[req.category] <= 0) {
                delete this.saveSlot.sampleInventory[req.category];
              }
            }
            if (!this.saveSlot.installedModules) this.saveSlot.installedModules = [];
            if (!this.saveSlot.installedModules.includes(mod.id)) {
              this.saveSlot.installedModules.push(mod.id);
            }
            audio.playConnectChime();
            this.callbacks.onModuleInstalled?.(mod.id);
            this.callbacks.onSave?.();
            this.render();
          } else {
            audio.playScanEffect();
          }
        }
      });
    });

    // UPLOAD Survey telemetry
    const uploadBtn = this.modalEl.querySelector('#btn-upload-survey-telemetry');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        audio.playConnectChime();
        if (this.saveSlot) {
          this.saveSlot.credits = (this.saveSlot.credits || 0) + 150;
          this.callbacks.onSave?.();
        }
        this.commHistory.push({
          sender: 'DATA_EXCHANGE_TERMINAL',
          text: 'Telemetry package uploaded to stellar cartography repository. +150 CR credited to pilot account.',
          time: new Date().toTimeString().split(' ')[0],
        });
        this.render();
      });
    }

    // COMMS Queries
    this.modalEl.querySelectorAll('.btn-comms-query').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const queryType = (e.currentTarget as HTMLElement).getAttribute('data-query');
        if (queryType) {
          this.handleCommsQuery(queryType);
        }
      });
    });
  }

  private handleCommsQuery(queryType: string): void {
    audio.playBlip();
    const now = new Date().toTimeString().split(' ')[0];
    const isStation = this.target?.entityKind === 'STATION';
    const speaker = isStation
      ? `${this.target?.name.toUpperCase()} CONTROL`
      : `${(this.target as NamedVessel)?.captainName?.toUpperCase() || 'CAPTAIN'}`;

    let pilotText = '';
    let replyText = '';

    switch (queryType) {
      case 'traffic_advisory':
        if (isStation) {
          pilotText = 'Flight Control, requesting local orbital approach vectors and hazard report.';
          replyText = 'Docking corridor alpha clear. Planetary gravity wells steady. All approaching pilots are advised to decelerate below 180 m/s inside station approach perimeter.';
        } else {
          pilotText = 'Requesting tactical route scan and deep-space threat analysis.';
          replyText = 'Long-range sensors detect light debris in Lagrange points. Watch for gravimetric shears when warping through dense asteroid bands.';
        }
        break;

      case 'trade_routes':
        if (isStation) {
          pilotText = 'Requesting station commodity manifest and regional demand forecast.';
          replyText = 'Station holds are low on high-grade minerals. Smelted metals and bio-catalysts fetch peak prices at our commodity exchange today.';
        } else {
          pilotText = 'Requesting merchant convoy intelligence and high-yield trade manifests.';
          replyText = 'Frontier research stations pay top credits for Exotic Bio-Samples and Refined Hyper-Alloys. Planetary mineral ores can be smelted in station fabricators for maximum yield.';
        }
        break;

      case 'customs_lore':
        if (isStation) {
          pilotText = 'Requesting station history and administrative charter archives.';
          replyText = this.target?.lore || 'Constructed during the Pioneer Expansion, this station serves as a deep-space refuge for all lawful navigators.';
        } else {
          pilotText = 'Inquiring about your vessel charter, crew orders, and mission history.';
          replyText = this.target?.lore || 'We chart the dark corridors between frontier systems, trading with those who dare push past known space.';
        }
        break;

      case 'auxiliary_support':
        if (isStation) {
          pilotText = 'Requesting station automated diagnostic sweep and umbilical power hookup.';
          replyText = 'Automated umbilical connected. Thruster telemetry recalibrated. Docking recharge active. Station facilities are at your service.';
        } else {
          pilotText = 'Requesting ship-to-ship telemetry sync and auxiliary shield diagnostic.';
          replyText = 'Telemetry handshake verified. Navigational vectors synchronized. All sub-space conduits nominal. May the solar winds favour your journey, Commander.';
        }
        break;
    }

    this.commHistory.push({ sender: 'PILOT // SHIP_LINK', text: pilotText, time: now });

    // Optional local AI generation if available
    if (localAI.isAiEnabled() && localAI.getStatus() === 'READY') {
      const vessel = !isStation ? (this.target as NamedVessel) : undefined;
      const context: SandboxDialogueContext = {
        systemName: this.system?.name || 'Frontier Space',
        speaker,
        entityName: this.target?.name,
        faction: (this.target as any)?.faction || (isStation ? 'Independent Outpost' : 'Free Trader'),
        species: vessel?.species || (isStation ? 'Cosmic Station Crew' : 'Spacefarer'),
        role: isStation ? 'Station Operations' : vessel?.sizeClass || vessel?.archetype || 'Independent Vessel',
        familiarity: 0.2,
      };

      localAI
        .generateSandboxReply(context, pilotText, replyText)
        .then((aiReply) => {
          this.commHistory.push({ sender: speaker, text: aiReply, time: new Date().toTimeString().split(' ')[0] });
          this.render();
        })
        .catch(() => {
          this.commHistory.push({ sender: speaker, text: replyText, time: now });
          this.render();
        });
    } else {
      this.commHistory.push({ sender: speaker, text: replyText, time: now });
      this.render();
    }
  }
}

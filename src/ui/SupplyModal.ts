import { SHIP_MODULE_CATALOG } from '../game/progression/ShipProgression';
import type { ShipModule, PlayerSaveSlot } from '../persistence/SaveManager';

export interface SupplyModalCallbacks {
  onOrderModule: (module: ShipModule) => void;
  onClose: () => void;
}

export class SupplyModal {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private isVisible = false;
  private callbacks: SupplyModalCallbacks;

  constructor(container: HTMLElement, callbacks: SupplyModalCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public show(saveSlot: PlayerSaveSlot): void {
    if (this.isVisible) return;
    this.isVisible = true;

    this.modalEl = document.createElement('div');
    this.modalEl.id = 'supply-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(3, 7, 18, 0.85);
      backdrop-filter: blur(12px);
      z-index: 950;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: #f8fafc;
      animation: fadeIn 0.2s ease-out;
    `;

    this.render(saveSlot);
    this.container.appendChild(this.modalEl);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'u' || e.key === 'U') {
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

  private render(saveSlot: PlayerSaveSlot): void {
    if (!this.modalEl) return;

    const credits = saveSlot.credits ?? 0;
    const inventory = saveSlot.sampleInventory ?? [];
    const installed = saveSlot.installedModules ?? [];
    const pending = saveSlot.pendingOrders ?? [];

    const sampleCounts: Record<string, number> = typeof inventory === 'object' && !Array.isArray(inventory)
      ? { ...inventory }
      : {};

    const inventoryChipsHtml = ['MINERAL', 'BIOLOGICAL', 'ATMOSPHERIC', 'CRYSTALLINE', 'RESONANCE']
      .map((cat) => {
        const count = sampleCounts[cat] ?? 0;
        return `
          <div style="
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <span style="color: #94a3b8; text-transform: uppercase;">${cat}:</span>
            <span style="font-weight: 700; color: ${count > 0 ? '#38bdf8' : '#64748b'};">${count}</span>
          </div>
        `;
      })
      .join('');

    const modulesHtml = SHIP_MODULE_CATALOG.map((mod) => {
      const isInstalled = installed.includes(mod.id);
      const isPending = pending.some((p) => p.moduleId === mod.id && p.status === 'IN_TRANSIT');

      // Check sample requirements
      let hasSamples = true;
      const reqsText = mod.sampleRequirements
        .map((req: { category: string; count: number }) => {
          const avail = sampleCounts[req.category] ?? 0;
          if (avail < req.count) hasSamples = false;
          return `${req.count}x ${req.category} (${avail}/${req.count})`;
        })
        .join(', ');

      const canAfford = credits >= mod.costCredits && hasSamples;

      let statusBadge = '';
      let actionBtn = '';

      if (isInstalled) {
        statusBadge = `<span style="color: #4ade80; font-weight: 700; font-size: 12px;">[INSTALLED]</span>`;
        actionBtn = `
          <button disabled style="
            background: rgba(74, 222, 128, 0.15);
            border: 1px solid rgba(74, 222, 128, 0.3);
            color: #4ade80;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            cursor: default;
          ">Active</button>
        `;
      } else if (isPending) {
        statusBadge = `<span style="color: #facc15; font-weight: 700; font-size: 12px;">[IN TRANSIT]</span>`;
        actionBtn = `
          <button disabled style="
            background: rgba(250, 204, 21, 0.15);
            border: 1px solid rgba(250, 204, 21, 0.3);
            color: #facc15;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            cursor: default;
          ">Courier Dispatched</button>
        `;
      } else {
        statusBadge = `<span style="color: #38bdf8; font-weight: 700; font-size: 12px;">${mod.costCredits} CREDITS</span>`;
        actionBtn = `
          <button class="order-module-btn" data-mod-id="${mod.id}" ${!canAfford ? 'disabled' : ''} style="
            background: ${canAfford ? 'linear-gradient(135deg, #0284c7, #0ea5e9)' : 'rgba(51, 65, 85, 0.4)'};
            border: 1px solid ${canAfford ? 'rgba(56, 189, 248, 0.5)' : 'rgba(148, 163, 184, 0.2)'};
            color: ${canAfford ? '#ffffff' : '#64748b'};
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: ${canAfford ? 'pointer' : 'not-allowed'};
            transition: all 0.15s ease;
          ">TRANSMIT ORDER</button>
        `;
      }

      return `
        <div style="
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; font-size: 15px; color: #f1f5f9; letter-spacing: 0.03em;">${mod.name}</div>
            ${statusBadge}
          </div>
          <div style="font-size: 11px; color: #38bdf8; text-transform: uppercase; font-family: ui-monospace, monospace;">
            Category: ${mod.category} • Tier ${mod.tier} • Part: ${mod.visualPart}
          </div>
          <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">
            ${mod.description}
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
            Required Samples: <span style="color: ${hasSamples ? '#93c5fd' : '#f87171'};">${reqsText}</span>
          </div>
          <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');

    this.modalEl.innerHTML = `
      <div style="
        width: min(720px, 94vw);
        max-height: min(88dvh, 720px);
        background: #090e1a;
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- Header -->
        <div style="
          padding: clamp(12px, 2.5vw, 18px) clamp(14px, 3vw, 24px);
          border-bottom: 1px solid rgba(56, 189, 248, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(15, 23, 42, 0.6);
          flex-wrap: wrap;
          gap: 8px;
        ">
          <div>
            <div style="font-size: 10px; font-family: ui-monospace, monospace; color: #38bdf8; letter-spacing: 0.2em; text-transform: uppercase;">
              SUB-SPACE REQUISITION NETWORK
            </div>
            <h2 style="font-size: clamp(16px, 4vw, 20px); font-weight: 600; margin: 2px 0 0 0; color: #f8fafc; letter-spacing: 0.05em;">
              SURVEY SUPPLY & UPGRADES
            </h2>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="
              background: rgba(56, 189, 248, 0.12);
              border: 1px solid rgba(56, 189, 248, 0.35);
              padding: 5px 12px;
              border-radius: 8px;
              display: flex;
              align-items: baseline;
              gap: 6px;
            ">
              <span style="font-size: 10px; color: #94a3b8;">CREDITS:</span>
              <span style="font-size: 15px; font-weight: 800; color: #38bdf8; font-family: ui-monospace, monospace;">${credits}</span>
            </div>
            <button id="close-supply-btn" style="
              background: none;
              border: none;
              color: #94a3b8;
              font-size: 22px;
              cursor: pointer;
              padding: 4px 8px;
              touch-action: manipulation;
            ">✕</button>
          </div>
        </div>

        <!-- Inventory Bar -->
        <div style="
          padding: 10px clamp(14px, 3vw, 24px);
          background: rgba(15, 23, 42, 0.4);
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        ">
          <span style="font-size: 10px; font-family: ui-monospace, monospace; color: #94a3b8; letter-spacing: 0.05em;">
            CATALOGUED SAMPLES:
          </span>
          ${inventoryChipsHtml}
        </div>

        <!-- Catalog List -->
        <div class="modal-scrollable" data-scrollable="true" style="
          padding: clamp(14px, 2.5vw, 20px) clamp(14px, 3vw, 24px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        ">
          ${modulesHtml}
        </div>

        <!-- Footer -->
        <div style="
          padding: 10px clamp(14px, 3vw, 24px);
          background: rgba(15, 23, 42, 0.6);
          border-top: 1px solid rgba(56, 189, 248, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #64748b;
          flex-wrap: wrap;
          gap: 8px;
        ">
          <span style="font-size: 10px;">Courier pods arrive in star system cruise space once requisitioned.</span>
          <span style="color: #94a3b8; font-size: 10px;">[ESC] / [U] to close</span>
        </div>
      </div>
    `;

    this.modalEl.querySelector('#close-supply-btn')?.addEventListener('click', () => {
      this.hide();
    });

    const orderButtons = this.modalEl.querySelectorAll('.order-module-btn');
    orderButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modId = (e.currentTarget as HTMLElement).getAttribute('data-mod-id');
        const targetMod = SHIP_MODULE_CATALOG.find((m) => m.id === modId);
        if (targetMod) {
          this.callbacks.onOrderModule(targetMod);
          this.render(saveSlot);
        }
      });
    });
  }
}

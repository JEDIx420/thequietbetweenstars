import { saveManager, type DiscoveryRecord, type JournalEntry } from '../persistence/SaveManager';
import { audio } from '../audio/AudioEngine';

export type JournalTab = 'WORLDS' | 'LIFE' | 'PEOPLES' | 'LORE' | 'SYSTEMS' | 'ANOMALIES' | 'RESOURCES' | 'NOTES';

export class JournalModal {
  private container: HTMLElement;
  private isVisible = false;
  private currentTab: JournalTab = 'WORLDS';
  private discoveries: DiscoveryRecord[] = [];
  private journalEntries: JournalEntry[] = [];

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'journal-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: radial-gradient(circle at 50% 50%, rgba(10, 15, 26, 0.96) 0%, rgba(3, 3, 7, 0.98) 100%);
      backdrop-filter: blur(12px);
      display: none;
      flex-direction: column;
      color: #f8fafc;
      font-family: ui-sans-serif, system-ui, sans-serif;
      user-select: none;
    `;

    this.container.innerHTML = `
      <!-- Header -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: clamp(14px, 3vw, 20px) clamp(16px, 4vw, 32px);
        border-bottom: 1px solid rgba(56, 189, 248, 0.2);
        flex-wrap: wrap;
        gap: 8px;
      ">
        <div>
          <div style="font-size: 10px; letter-spacing: 0.25em; color: #38bdf8; text-transform: uppercase;">EXPEDITION LOG</div>
          <h2 style="font-size: clamp(18px, 4vw, 22px); font-weight: 300; margin: 4px 0 0 0;">Ship Journal & Discoveries</h2>
        </div>
        <button id="btn-journal-close" style="
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          color: #cbd5e1;
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          touch-action: manipulation;
        ">CLOSE [J / ESC]</button>
      </div>

      <!-- Navigation Tabs -->
      <div style="
        display: flex;
        gap: 8px;
        padding: 10px clamp(16px, 4vw, 32px);
        background: rgba(15, 23, 42, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        overflow-x: auto;
        white-space: nowrap;
        -webkit-overflow-scrolling: touch;
      ">
        <button class="journal-tab-btn" data-tab="WORLDS" style="flex-shrink: 0;">WORLDS</button>
        <button class="journal-tab-btn" data-tab="LIFE" style="flex-shrink: 0;">LIFE</button>
        <button class="journal-tab-btn" data-tab="PEOPLES" style="flex-shrink: 0;">PEOPLES</button>
        <button class="journal-tab-btn" data-tab="LORE" style="flex-shrink: 0;">LORE</button>
        <button class="journal-tab-btn" data-tab="RESOURCES" style="flex-shrink: 0;">RESOURCES</button>
        <button class="journal-tab-btn" data-tab="SYSTEMS" style="flex-shrink: 0;">STAR SYSTEMS</button>
        <button class="journal-tab-btn" data-tab="ANOMALIES" style="flex-shrink: 0;">ANOMALIES</button>
        <button class="journal-tab-btn" data-tab="NOTES" style="flex-shrink: 0;">FLIGHT LOG</button>
      </div>

      <!-- Main Content Area -->
      <div id="journal-content-list" style="
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: clamp(16px, 3vw, 28px);
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
        gap: 14px;
        align-content: flex-start;
        box-sizing: border-box;
      "></div>
    `;

    parent.appendChild(this.container);
    this.setupEvents();
  }

  private setupEvents(): void {
    this.container.querySelector('#btn-journal-close')?.addEventListener('click', () => {
      this.hide();
    });

    const tabBtns = this.container.querySelectorAll('.journal-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as JournalTab;
        if (tab) {
          audio.playBlip();
          this.setTab(tab);
        }
      });
    });
  }

  public async open(): Promise<void> {
    this.isVisible = true;
    this.container.style.display = 'flex';

    // Load discoveries & journal from IndexedDB
    this.discoveries = await saveManager.getAllDiscoveries();
    this.journalEntries = await saveManager.getJournalEntries();

    this.render();
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  public toggle(): void {
    if (this.isVisible) this.hide();
    else this.open();
  }

  public getIsOpen(): boolean {
    return this.isVisible;
  }

  public setTab(tab: JournalTab): void {
    this.currentTab = tab;
    this.render();
  }

  private render(): void {
    // Update Tab Styles
    const tabBtns = this.container.querySelectorAll('.journal-tab-btn');
    tabBtns.forEach((b) => {
      const el = b as HTMLElement;
      const isSelected = el.dataset.tab === this.currentTab;
      el.style.cssText = `
        background: ${isSelected ? 'rgba(56, 189, 248, 0.2)' : 'transparent'};
        border: 1px solid ${isSelected ? 'rgba(56, 189, 248, 0.6)' : 'transparent'};
        color: ${isSelected ? '#38bdf8' : '#94a3b8'};
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        cursor: pointer;
        transition: all 0.15s;
      `;
    });

    const content = this.container.querySelector('#journal-content-list') as HTMLElement;
    if (!content) return;

    if (this.currentTab === 'NOTES') {
      if (this.journalEntries.length === 0) {
        content.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; color: #64748b; margin-top: 60px;">
            No custom log entries recorded. Automated flight telemetry active.
          </div>
        `;
        return;
      }

      content.innerHTML = this.journalEntries
        .map(
          (j) => `
          <div style="
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 10px;
            padding: 16px;
          ">
            <div style="font-size: 10px; color: #38bdf8; font-family: ui-monospace, monospace; margin-bottom: 4px;">
              ${new Date(j.timestamp).toLocaleDateString()} · SECTOR [${j.sector.x},${j.sector.y},${j.sector.z}]
            </div>
            <h3 style="font-size: 15px; margin: 0 0 8px 0; color: #f8fafc;">${j.title}</h3>
            <p style="font-size: 12px; color: #cbd5e1; line-height: 1.5; margin: 0;">${j.content}</p>
          </div>
        `
        )
        .join('');
      return;
    }

    // Filter discoveries by tab
    const filtered = this.discoveries.filter((d) => d.category === this.currentTab);

    if (filtered.length === 0) {
      const label = this.currentTab === 'WORLDS' ? 'charted planets'
        : this.currentTab === 'LIFE' ? 'living worlds with confirmed biospheres'
        : this.currentTab === 'SYSTEMS' ? 'visited star systems'
        : 'anomalous cosmic structures';

      content.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: #64748b; margin-top: 60px;">
          No ${label} logged yet.<br/>
          <span style="font-size: 12px; color: #475569; margin-top: 8px; display: inline-block;">
            Fly near celestial objects and trigger SCAN [SPACE] to record telemetry.
          </span>
        </div>
      `;
      return;
    }

    content.innerHTML = filtered
      .map(
        (d) => `
        <div style="
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 12px;
          padding: 18px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        ">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <div style="font-size: 10px; letter-spacing: 0.15em; color: #38bdf8; text-transform: uppercase;">
                ${d.type.toUpperCase()} // ${d.systemName}
              </div>
              <h3 style="font-size: 17px; margin: 2px 0 0 0; color: #f8fafc;">${d.name}</h3>
            </div>
            ${
              d.biosignature
                ? `<span style="font-size: 10px; color: #4ade80; background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); padding: 2px 6px; border-radius: 4px;">${d.biosignature.toUpperCase()}</span>`
                : ''
            }
          </div>
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 8px 0 12px 0;">${d.details}</p>
          <div style="font-family: ui-monospace, monospace; font-size: 10px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px;">
            SECTOR: [${d.sector.x},${d.sector.y},${d.sector.z}] · ${new Date(d.timestamp).toLocaleTimeString()}
          </div>
        </div>
      `
      )
      .join('');
  }

  public dispose(): void {
    this.container.remove();
  }
}

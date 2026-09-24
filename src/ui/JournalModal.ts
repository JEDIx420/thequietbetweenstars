import { saveManager, type DiscoveryRecord, type JournalEntry } from '../persistence/SaveManager';
import { audio } from '../audio/AudioEngine';
import { CHAPTER_1_BEATS } from '../story/chapters/Chapter1Resonance';
import type { StoryState } from '../story/StoryTypes';
import { StoryDirector } from '../story/StoryDirector';

export type JournalTab = 'STORY' | 'WORLDS' | 'LIFE' | 'PEOPLES' | 'LORE' | 'SYSTEMS' | 'ANOMALIES' | 'RESOURCES' | 'NOTES';

export class JournalModal {
  private container: HTMLElement;
  private isVisible = false;
  private currentTab: JournalTab = 'STORY';
  private discoveries: DiscoveryRecord[] = [];
  private journalEntries: JournalEntry[] = [];
  private storyState: StoryState | null = null;
  private storyDirector: StoryDirector | null = null;

  public setStoryDirector(director: StoryDirector): void {
    this.storyDirector = director;
  }

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
      <div class="modal-scrollable-x" data-scrollable="true" style="
        display: flex;
        gap: 8px;
        padding: 10px clamp(16px, 4vw, 32px);
        background: rgba(15, 23, 42, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        overflow-x: auto;
        white-space: nowrap;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x;
        <button class="journal-tab-btn" data-tab="STORY" style="flex-shrink: 0; font-weight: 700; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">EXPEDITION</button>
        <button class="journal-tab-btn" data-tab="WORLDS" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">WORLDS</button>
        <button class="journal-tab-btn" data-tab="LIFE" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">LIFE</button>
        <button class="journal-tab-btn" data-tab="PEOPLES" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">PEOPLES</button>
        <button class="journal-tab-btn" data-tab="LORE" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">LORE</button>
        <button class="journal-tab-btn" data-tab="RESOURCES" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">RESOURCES</button>
        <button class="journal-tab-btn" data-tab="SYSTEMS" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">STAR SYSTEMS</button>
        <button class="journal-tab-btn" data-tab="ANOMALIES" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">ANOMALIES</button>
        <button class="journal-tab-btn" data-tab="NOTES" style="flex-shrink: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">FLIGHT LOG</button>
      </div>

      <!-- Main Content Area -->
      <div id="journal-content-list" class="modal-scrollable" data-scrollable="true" style="
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
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
    const closeBtn = this.container.querySelector('#btn-journal-close');
    closeBtn?.addEventListener('click', () => {
      this.hide();
    });

    const tabBtns = this.container.querySelectorAll('.journal-tab-btn');
    tabBtns.forEach((btn) => {
      const selectTab = () => {
        const tab = (btn as HTMLElement).dataset.tab as JournalTab;
        if (tab) {
          audio.playBlip();
          this.setTab(tab);
        }
      };
      btn.addEventListener('pointerdown', (e) => {
        if ((e as PointerEvent).pointerType === 'touch') {
          selectTab();
        }
      });
      btn.addEventListener('click', selectTab);
    });
  }

  public async open(): Promise<void> {
    this.isVisible = true;
    this.container.style.display = 'flex';

    // Load discoveries, journal & story state from IndexedDB
    this.discoveries = await saveManager.getAllDiscoveries();
    this.journalEntries = await saveManager.getJournalEntries();
    const slot = await saveManager.getSaveSlot();
    this.storyState = slot?.story || null;

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

    if (this.currentTab === 'STORY') {
      const state = this.storyState;
      const isFree = !!state?.freeExplorationMode;
      const beatId = state?.currentBeat || 'beat_0_awakening';
      const beatDef = CHAPTER_1_BEATS[beatId];
      const fragments = state?.resonanceFragments || [];
      const hasAlpha = fragments.some((f) => f.id === 'fragment_alpha');
      const hasBeta = fragments.some((f) => f.id === 'fragment_beta');
      const visitedStations = state?.visitedStations || [];
      const hasEpsilon = visitedStations.includes('station_epsilon_7');
      const relayActivated = state?.harmonicRelayState?.activated;
      const alignedPillars = state?.harmonicRelayState?.alignedPillars || [];

      content.innerHTML = `
        <!-- Free Roam / Story Mode Banner -->
        <div style="
          grid-column: 1 / -1;
          background: ${isFree ? 'rgba(22, 101, 52, 0.25)' : 'rgba(15, 23, 42, 0.85)'};
          border: 1px solid ${isFree ? 'rgba(74, 222, 128, 0.4)' : 'rgba(56, 189, 248, 0.4)'};
          border-left: 4px solid ${isFree ? '#4ade80' : '#38bdf8'};
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 6px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        ">
          <div>
            <div style="font-size: 10px; color: ${isFree ? '#86efac' : '#7dd3fc'}; letter-spacing: 0.2em; font-weight: 700; text-transform: uppercase;">
              ${isFree ? 'SANDBOX MODE // FREE EXPLORATION' : 'ACTIVE MISSION // CHAPTER 1: THE RESONANCE'}
            </div>
            <h3 style="font-size: 18px; margin: 6px 0 10px 0; color: #f8fafc; font-weight: 400;">
              ${isFree ? 'Autonomous Galactic Exploration' : (beatDef ? beatDef.title : 'Subcarrier Whisper')}
            </h3>
            <div style="
              background: ${isFree ? 'rgba(34, 197, 94, 0.12)' : 'rgba(56, 189, 248, 0.1)'};
              border: 1px solid ${isFree ? 'rgba(74, 222, 128, 0.3)' : 'rgba(56, 189, 248, 0.3)'};
              border-radius: 6px;
              padding: 10px 14px;
              font-size: 13px;
              color: #e2e8f0;
              line-height: 1.5;
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <span style="color: ${isFree ? '#4ade80' : '#38bdf8'}; font-weight: bold;">
                ${isFree ? 'SANDBOX STATUS:' : 'CURRENT OBJECTIVE:'}
              </span>
              <span>
                ${isFree ? 'Persistent procedural space sandbox active. Discover solar systems, dock with orbital stations & capital ships, trade, craft, and upgrade your vessel.' : (beatDef ? beatDef.objective : 'Explore distant sectors.')}
              </span>
            </div>
          </div>

          <button id="btn-toggle-free-exploration-journal" style="
            background: ${isFree ? 'rgba(34, 197, 94, 0.2)' : 'rgba(56, 189, 248, 0.15)'};
            border: 1px solid ${isFree ? '#4ade80' : 'rgba(56, 189, 248, 0.4)'};
            color: ${isFree ? '#86efac' : '#7dd3fc'};
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 11.5px;
            font-weight: 600;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
          ">
            ${isFree ? '▶ RESUME STORY MISSIONS' : '⏸ PAUSE & FREE ROAM'}
          </button>
        </div>

        <!-- Resonance Fragments Section -->
        <div style="
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 16px;
        ">
          <div style="font-size: 10px; color: #38bdf8; letter-spacing: 0.15em; font-weight: 700; margin-bottom: 8px;">
            RESONANCE TELEMETRY FRAGMENTS (${fragments.length}/2)
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="padding: 8px 12px; background: rgba(30, 41, 59, 0.5); border-radius: 6px; border: 1px solid ${hasAlpha ? '#38bdf8' : 'rgba(255,255,255,0.06)'};">
              <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: ${hasAlpha ? '#f8fafc' : '#64748b'};">
                <span>Fragment α (432.8 Hz)</span>
                <span style="color: ${hasAlpha ? '#4ade80' : '#64748b'};">${hasAlpha ? 'RECOVERED' : 'PENDING'}</span>
              </div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Crystalline Monolith Echo Shard</div>
            </div>
            <div style="padding: 8px 12px; background: rgba(30, 41, 59, 0.5); border-radius: 6px; border: 1px solid ${hasBeta ? '#38bdf8' : 'rgba(255,255,255,0.06)'};">
              <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: ${hasBeta ? '#f8fafc' : '#64748b'};">
                <span>Fragment β (528.0 Hz)</span>
                <span style="color: ${hasBeta ? '#4ade80' : '#64748b'};">${hasBeta ? 'RECOVERED' : 'PENDING'}</span>
              </div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Survey Craft Alpha-9 Flight Core</div>
            </div>
          </div>
        </div>

        <!-- Key Locations & Contacts -->
        <div style="
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 16px;
        ">
          <div style="font-size: 10px; color: #38bdf8; letter-spacing: 0.15em; font-weight: 700; margin-bottom: 8px;">
            KEY LOCATIONS & CONTACTS
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="padding: 8px 12px; background: rgba(30, 41, 59, 0.5); border-radius: 6px; font-size: 11.5px;">
              <div style="font-weight: 600; color: #f8fafc;">Dr. Valeria Vance · Epsilon-7</div>
              <div style="color: #94a3b8; font-size: 11px;">Status: ${hasEpsilon ? 'Station Docked · Signal Lab Contacted' : 'Awaiting Telemetry Congruence'}</div>
            </div>
            <div style="padding: 8px 12px; background: rgba(30, 41, 59, 0.5); border-radius: 6px; font-size: 11.5px;">
              <div style="font-weight: 600; color: #f8fafc;">Captain Zephyr · The Wanderer-7</div>
              <div style="color: #94a3b8; font-size: 11px;">Status: Nomad Avian Vessel · Roaming Wings</div>
            </div>
            <div style="padding: 8px 12px; background: rgba(30, 41, 59, 0.5); border-radius: 6px; font-size: 11.5px;">
              <div style="font-weight: 600; color: #f8fafc;">First Harmonic Relay</div>
              <div style="color: #94a3b8; font-size: 11px;">Spires Synchronized: [${alignedPillars.length}/3] ${relayActivated ? '· GATEWAY ACTIVE' : ''}</div>
            </div>
          </div>
        </div>
      `;

      const toggleBtn = content.querySelector('#btn-toggle-free-exploration-journal');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          audio.playBlip();
          if (this.storyDirector) {
            const nextMode = !this.storyDirector.isFreeExploration();
            this.storyDirector.setFreeExploration(nextMode);
            this.storyState = this.storyDirector.getState();
            this.render();
          }
        });
      }
      return;
    }

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

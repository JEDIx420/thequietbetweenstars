import { CHAPTER_1_BEATS } from './chapters/Chapter1Resonance';
import type { StoryState } from './StoryTypes';
import { audio } from '../audio/AudioEngine';
import { HapticFeedback } from '../game/input/HapticFeedback';

export class StoryObjectiveHUD {
  private container: HTMLElement;
  private chapterEl: HTMLElement;
  private titleEl: HTMLElement;
  private objectiveEl: HTMLElement;
  private badgeEl: HTMLElement;
  private fragmentsEl: HTMLElement;
  private trackBtn!: HTMLElement;
  private flashTimeout: number | null = null;
  private isCollapsed = false;
  private isFreeExplorationActive = false;
  private onTrackObjectiveCallback: (() => void) | null = null;

  public setOnTrackObjective(cb: () => void): void {
    this.onTrackObjectiveCallback = cb;
  }

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'story-objective-hud';
    this.container.style.display = 'none';
    this.container.style.opacity = '0';

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #story-objective-hud {
        position: fixed;
        top: 68px;
        left: 24px;
        z-index: 100;
        pointer-events: auto;
        user-select: none;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        transition: opacity 0.3s ease, transform 0.3s ease;
        max-width: 340px;
      }
      #story-objective-hud .hud-card {
        background: rgba(10, 16, 28, 0.85);
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-left: 3px solid #38bdf8;
        border-radius: 8px;
        padding: 10px 14px;
        backdrop-filter: blur(12px);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.08);
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
      }
      #story-objective-hud .hud-card:hover {
        background: rgba(15, 23, 42, 0.92);
        border-color: rgba(56, 189, 248, 0.55);
      }
      #story-objective-hud .objective-flash {
        animation: hud-objective-glow 1.8s ease-out;
      }
      @keyframes hud-objective-glow {
        0% { border-color: #38bdf8; box-shadow: 0 0 25px rgba(56, 189, 248, 0.6); }
        100% { border-color: rgba(56, 189, 248, 0.3); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); }
      }
      #story-objective-hud.is-collapsed .hud-card {
        padding: 6px 12px;
        background: rgba(10, 16, 28, 0.88);
        border-radius: 8px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
        max-width: 250px;
      }
      #story-objective-hud.is-collapsed .hud-header {
        margin-bottom: 0 !important;
      }
      #hud-btn-toggle-freeroam {
        font-size: 10px !important;
        font-weight: 700 !important;
        padding: 4px 9px !important;
        min-height: 28px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        touch-action: manipulation !important;
        transition: all 0.15s ease !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      #hud-btn-toggle-freeroam:active {
        transform: scale(0.94);
      }
      /* Tablet & Touch Adaptation */
      @media (pointer: coarse), (max-width: 1024px) {
        #story-objective-hud {
          top: max(46px, env(safe-area-inset-top, 46px));
          left: max(12px, env(safe-area-inset-left, 12px));
          max-width: 260px;
        }
        #story-objective-hud .hud-card {
          padding: 8px 12px;
        }
        #hud-btn-toggle-freeroam {
          min-height: 34px !important;
          padding: 6px 12px !important;
          font-size: 10.5px !important;
        }
      }
      /* Compact Phone Overrides */
      @media (max-width: 768px) {
        #story-objective-hud {
          top: max(44px, env(safe-area-inset-top, 44px));
          left: max(10px, env(safe-area-inset-left, 10px));
          max-width: 240px;
        }
        #story-objective-hud .hud-card {
          padding: 6px 10px;
        }
      }
    `;
    this.container.appendChild(styleEl);

    const card = document.createElement('div');
    card.className = 'hud-card';

    // Header with chapter & update badge
    const headerEl = document.createElement('div');
    headerEl.className = 'hud-header';
    headerEl.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    `;

    this.chapterEl = document.createElement('div');
    this.chapterEl.style.cssText = `
      font-size: 9px;
      letter-spacing: 0.16em;
      color: #7dd3fc;
      text-transform: uppercase;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    this.chapterEl.textContent = 'CHAPTER 1 // THE RESONANCE';

    this.badgeEl = document.createElement('div');
    this.badgeEl.style.cssText = `
      font-size: 8px;
      letter-spacing: 0.1em;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.18);
      border: 1px solid rgba(56, 189, 248, 0.4);
      padding: 1px 5px;
      border-radius: 4px;
      display: none;
    `;
    this.badgeEl.textContent = 'UPDATED';

    const controlsWrapper = document.createElement('div');
    controlsWrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 5px;
    `;

    const trackBtn = document.createElement('button');
    trackBtn.id = 'hud-btn-track-objective';
    trackBtn.title = 'Lock and Track Active Story Objective';
    trackBtn.style.cssText = `
      background: rgba(251, 191, 36, 0.16);
      border: 1px solid rgba(251, 191, 36, 0.5);
      color: #fbbf24;
      font-size: 8px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
      display: inline-block;
    `;
    trackBtn.textContent = '🎯 TRACK';
    trackBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onTrackObjectiveCallback) {
        this.onTrackObjectiveCallback();
      }
    });
    this.trackBtn = trackBtn;

    const freeRoamBtn = document.createElement('button');
    freeRoamBtn.id = 'hud-btn-toggle-freeroam';
    freeRoamBtn.title = 'Toggle Free Exploration Mode';
    freeRoamBtn.style.cssText = `
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(74, 222, 128, 0.45);
      color: #4ade80;
      font-size: 10px;
      font-weight: 700;
      padding: 4px 9px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
      touch-action: manipulation;
    `;
    freeRoamBtn.textContent = '▶ MISSIONS';
    const triggerToggle = (e: Event) => {
      e.stopPropagation();
      HapticFeedback.medium();
      if (this.onToggleFreeRoamCallback) {
        this.onToggleFreeRoamCallback();
      }
    };
    freeRoamBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    freeRoamBtn.addEventListener('click', triggerToggle);

    const collapseBtn = document.createElement('button');
    collapseBtn.id = 'hud-btn-collapse-toggle';
    collapseBtn.title = 'Collapse/Expand Mission Panel';
    collapseBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 10px;
      padding: 0 2px;
      cursor: pointer;
      font-family: inherit;
      line-height: 1;
    `;
    collapseBtn.textContent = '▴';
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    controlsWrapper.appendChild(this.badgeEl);
    controlsWrapper.appendChild(trackBtn);
    controlsWrapper.appendChild(freeRoamBtn);
    controlsWrapper.appendChild(collapseBtn);

    headerEl.appendChild(this.chapterEl);
    headerEl.appendChild(controlsWrapper);
    card.appendChild(headerEl);

    // Beat title
    this.titleEl = document.createElement('div');
    this.titleEl.style.cssText = `
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #f1f5f9;
      margin-bottom: 4px;
      text-transform: uppercase;
    `;
    card.appendChild(this.titleEl);

    // Current objective text
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.style.cssText = `
      font-size: 10.5px;
      line-height: 1.45;
      color: #94a3b8;
      font-family: ui-sans-serif, system-ui, sans-serif;
    `;
    card.appendChild(this.objectiveEl);

    // Fragments indicator (optional footer)
    this.fragmentsEl = document.createElement('div');
    this.fragmentsEl.style.cssText = `
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dashed rgba(56, 189, 248, 0.2);
      font-size: 9px;
      color: #38bdf8;
      letter-spacing: 0.1em;
      display: none;
    `;
    card.appendChild(this.fragmentsEl);

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if (this.isCollapsed && this.isFreeExplorationActive) {
        // Tapping the collapsed Free Roam pill activates missions directly
        HapticFeedback.medium();
        if (this.onToggleFreeRoamCallback) {
          this.onToggleFreeRoamCallback();
          return;
        }
      }
      this.toggleCollapse();
    });

    this.container.appendChild(card);
    parent.appendChild(this.container);
  }

  private onToggleFreeRoamCallback: (() => void) | null = null;

  public setOnToggleFreeRoam(cb: () => void): void {
    this.onToggleFreeRoamCallback = cb;
  }

  public update(state: StoryState, showNotification = false): void {
    const isFree = !!state.freeExplorationMode;
    this.isFreeExplorationActive = isFree;
    const card = this.container.querySelector('.hud-card') as HTMLElement;
    if (card) {
      card.style.borderLeftColor = isFree ? '#4ade80' : '#38bdf8';
    }
    const btn = this.container.querySelector('#hud-btn-toggle-freeroam') as HTMLElement;
    if (btn) {
      btn.textContent = isFree ? '▶ MISSIONS' : '⏸ ROAM';
      btn.title = isFree ? 'Enable Story Missions' : 'Switch to Free Roam';
      btn.style.color = isFree ? '#4ade80' : '#94a3b8';
      btn.style.borderColor = isFree ? 'rgba(74, 222, 128, 0.45)' : 'rgba(255, 255, 255, 0.2)';
      btn.style.background = isFree ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)';
    }

    if (this.trackBtn) {
      this.trackBtn.style.display = isFree ? 'none' : 'inline-block';
    }

    if (state.currentBeat === 'beat_7_chapter1_climax' && state.completedBeats.includes('beat_7_chapter1_climax')) {
      if (this.trackBtn) this.trackBtn.style.display = 'none';
      this.chapterEl.textContent = 'CHAPTER 1 // THE RESONANCE: COMPLETE';
      this.chapterEl.style.color = '#4ade80';
      this.titleEl.textContent = 'THE GALAXY AWAKENS';
      this.titleEl.style.color = '#86efac';
      this.objectiveEl.textContent = '● First Harmonic Relay active. The quiet is no longer empty. Explore uncharted systems freely.';
      this.fragmentsEl.style.display = 'none';
      if (showNotification) this.flashUpdate();
      return;
    }

    if (isFree) {
      this.chapterEl.textContent = '🧭 FREE ROAM';
      this.chapterEl.style.color = '#4ade80';
      this.titleEl.textContent = 'SANDBOX CRUISE';
      this.titleEl.style.color = '#86efac';
      this.objectiveEl.textContent = 'Story paused. Tap [▶ MISSIONS] to enable story objectives.';
      this.fragmentsEl.style.display = 'none';
      return;
    }

    this.chapterEl.style.color = '#7dd3fc';
    this.titleEl.style.color = '#f1f5f9';
    const beatDef = CHAPTER_1_BEATS[state.currentBeat];
    if (!beatDef) return;

    this.chapterEl.textContent = `CHAPTER ${beatDef.chapter} // THE RESONANCE`;
    this.titleEl.textContent = beatDef.title;
    this.objectiveEl.textContent = `● ${beatDef.objective}`;

    // Fragment status
    const fragCount = state.resonanceFragments.length;
    if (fragCount > 0) {
      this.fragmentsEl.style.display = this.isCollapsed ? 'none' : 'block';
      this.fragmentsEl.textContent = `RESONANCE FRAGMENTS: ${fragCount}/2`;
    } else {
      this.fragmentsEl.style.display = 'none';
    }

    if (showNotification) {
      this.flashUpdate();
    }
  }

  public flashUpdate(): void {
    const card = this.container.querySelector('.hud-card') as HTMLElement;
    if (card) {
      card.classList.remove('objective-flash');
      void card.offsetWidth; // trigger reflow
      card.classList.add('objective-flash');
    }

    this.badgeEl.style.display = 'inline-block';
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
    this.flashTimeout = setTimeout(() => {
      this.badgeEl.style.display = 'none';
    }, 4500) as any;

    audio.playConnectChime();
  }

  public toggleCollapse(force?: boolean): void {
    this.isCollapsed = force !== undefined ? force : !this.isCollapsed;
    this.container.classList.toggle('is-collapsed', this.isCollapsed);
    this.titleEl.style.display = this.isCollapsed ? 'none' : 'block';
    this.objectiveEl.style.display = this.isCollapsed ? 'none' : 'block';
    this.fragmentsEl.style.display =
      this.isCollapsed || !this.fragmentsEl.textContent ? 'none' : 'block';

    const collapseBtn = this.container.querySelector('#hud-btn-collapse-toggle') as HTMLElement;
    if (collapseBtn) {
      collapseBtn.textContent = this.isCollapsed ? '▾' : '▴';
    }
    audio.playBlip();
  }

  public show(): void {
    this.container.style.display = 'block';
    this.container.style.opacity = '1';
  }

  public hide(immediate = false): void {
    this.container.style.opacity = '0';
    if (immediate) {
      this.container.style.display = 'none';
      return;
    }
    setTimeout(() => {
      if (this.container.style.opacity === '0') {
        this.container.style.display = 'none';
      }
    }, 300);
  }

  public dispose(): void {
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
    this.container.remove();
  }
}

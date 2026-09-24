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
        top: max(48px, calc(env(safe-area-inset-top, 0px) + 44px));
        left: max(16px, calc(env(safe-area-inset-left, 0px) + 14px));
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
        transition: border-color 0.2s, background 0.2s, transform 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      #story-objective-hud .hud-card:active {
        transform: scale(0.98);
        background: rgba(15, 23, 42, 0.95);
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
      /* Tablet & Touch Adaptation */
      @media (pointer: coarse), (max-width: 1024px) {
        #story-objective-hud {
          top: max(44px, calc(env(safe-area-inset-top, 0px) + 38px));
          left: max(12px, calc(env(safe-area-inset-left, 0px) + 10px));
          max-width: 260px;
        }
        #story-objective-hud .hud-card {
          padding: 8px 12px;
        }
      }
      /* Compact Phone Overrides */
      @media (max-width: 768px) {
        #story-objective-hud {
          top: max(42px, calc(env(safe-area-inset-top, 0px) + 36px));
          left: max(10px, calc(env(safe-area-inset-left, 0px) + 8px));
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
      padding: 3px 7px;
      min-height: 24px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    `;
    trackBtn.textContent = '🎯 TRACK';
    let lastTrackTap = 0;
    const triggerTrack = (e: Event) => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTrackTap < 250) return;
      lastTrackTap = now;
      HapticFeedback.light();
      if (this.onTrackObjectiveCallback) {
        this.onTrackObjectiveCallback();
      }
    };
    trackBtn.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') {
        triggerTrack(e);
      }
    });
    trackBtn.addEventListener('click', triggerTrack);
    this.trackBtn = trackBtn;

    const collapseBtn = document.createElement('button');
    collapseBtn.id = 'hud-btn-collapse-toggle';
    collapseBtn.title = 'Collapse/Expand Mission Panel';
    collapseBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(148, 163, 184, 0.2);
      color: #94a3b8;
      font-size: 11px;
      padding: 0 4px;
      min-width: 24px;
      min-height: 24px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition: all 0.15s ease;
    `;
    collapseBtn.textContent = '▴';
    let lastCollapseTap = 0;
    const triggerCollapse = (e: Event) => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastCollapseTap < 250) return;
      lastCollapseTap = now;
      HapticFeedback.light();
      this.toggleCollapse();
    };
    collapseBtn.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') {
        triggerCollapse(e);
      }
    });
    collapseBtn.addEventListener('click', triggerCollapse);

    controlsWrapper.appendChild(this.badgeEl);
    controlsWrapper.appendChild(trackBtn);
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
      this.toggleCollapse();
    });

    this.container.appendChild(card);
    parent.appendChild(this.container);
  }

  private onToggleFreeRoamCallback: (() => void) | null = null;

  public setOnToggleFreeRoam(cb: () => void): void {
    this.onToggleFreeRoamCallback = cb;
  }

  public triggerToggleFreeRoam(): void {
    if (this.onToggleFreeRoamCallback) {
      this.onToggleFreeRoamCallback();
    }
  }

  public isFree(): boolean {
    return this.isFreeExplorationActive;
  }

  public update(state: StoryState, showNotification = false): void {
    const isFree = !!state.freeExplorationMode;
    this.isFreeExplorationActive = isFree;
    const card = this.container.querySelector('.hud-card') as HTMLElement;
    if (card) {
      card.style.borderLeftColor = isFree ? '#4ade80' : '#38bdf8';
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
      this.objectiveEl.textContent = 'Story paused. Tap top [🎯 MISSIONS] button to enable story objectives.';
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
    HapticFeedback.light();
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

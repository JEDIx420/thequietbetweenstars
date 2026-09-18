import { CHAPTER_1_BEATS } from './chapters/Chapter1Resonance';
import type { StoryState } from './StoryTypes';
import { audio } from '../audio/AudioEngine';

export class StoryObjectiveHUD {
  private container: HTMLElement;
  private chapterEl: HTMLElement;
  private titleEl: HTMLElement;
  private objectiveEl: HTMLElement;
  private badgeEl: HTMLElement;
  private fragmentsEl: HTMLElement;
  private flashTimeout: number | null = null;
  private isCollapsed = false;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'story-objective-hud';

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
      /* Tablet & Touch Adaptation */
      @media (pointer: coarse), (max-width: 1024px) {
        #story-objective-hud {
          top: max(56px, env(safe-area-inset-top, 56px));
          left: max(14px, env(safe-area-inset-left, 14px));
          max-width: 280px;
        }
        #story-objective-hud .hud-card {
          padding: 8px 12px;
        }
      }
      /* Compact Phone Overrides */
      @media (max-width: 768px) {
        #story-objective-hud {
          top: max(48px, env(safe-area-inset-top, 48px));
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
      gap: 6px;
    `;

    const freeRoamBtn = document.createElement('button');
    freeRoamBtn.id = 'hud-btn-toggle-freeroam';
    freeRoamBtn.title = 'Toggle Free Exploration Mode';
    freeRoamBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #94a3b8;
      font-size: 8px;
      padding: 1px 5px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
    `;
    freeRoamBtn.textContent = 'FREE ROAM';
    freeRoamBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onToggleFreeRoamCallback) {
        this.onToggleFreeRoamCallback();
      }
    });

    controlsWrapper.appendChild(this.badgeEl);
    controlsWrapper.appendChild(freeRoamBtn);

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

    card.addEventListener('click', () => {
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
    const btn = this.container.querySelector('#hud-btn-toggle-freeroam') as HTMLElement;
    if (btn) {
      btn.textContent = isFree ? '▶ RESUME' : '⏸ ROAM';
      btn.style.color = isFree ? '#4ade80' : '#94a3b8';
      btn.style.borderColor = isFree ? 'rgba(74, 222, 128, 0.4)' : 'rgba(255, 255, 255, 0.2)';
      btn.style.background = isFree ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.08)';
    }

    if (isFree) {
      this.chapterEl.textContent = 'EXPLORATION // FREE ROAM';
      this.chapterEl.style.color = '#4ade80';
      this.titleEl.textContent = 'SANDBOX CRUISE';
      this.titleEl.style.color = '#86efac';
      this.objectiveEl.textContent = 'Story paused. Explore uncharted star systems at your own pace.';
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
      this.fragmentsEl.style.display = 'block';
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
    this.flashTimeout = window.setTimeout(() => {
      this.badgeEl.style.display = 'none';
    }, 4500);

    audio.playConnectChime();
  }

  public toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    this.objectiveEl.style.display = this.isCollapsed ? 'none' : 'block';
    this.fragmentsEl.style.display = (this.isCollapsed || this.fragmentsEl.textContent === '') ? 'none' : 'block';
    audio.playBlip();
  }

  public show(): void {
    this.container.style.display = 'block';
    this.container.style.opacity = '1';
  }

  public hide(): void {
    this.container.style.opacity = '0';
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

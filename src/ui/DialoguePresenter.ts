import type { NarrativeLine } from '../narrative/NarrativeTypes';
import { audio } from '../audio/AudioEngine';

export class DialoguePresenter {
  private container: HTMLElement;
  private bubbleEl: HTMLElement;
  private speakerEl: HTMLElement;
  private textEl: HTMLElement;

  private queue: NarrativeLine[] = [];
  private isDisplaying = false;
  private currentTimeout: number | null = null;
  private onMirrorCallback: ((line: NarrativeLine) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'dialogue-presenter-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 28px;
      max-width: 440px;
      z-index: 1500;
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    `;

    this.bubbleEl = document.createElement('div');
    this.bubbleEl.style.cssText = `
      background: rgba(10, 16, 28, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-left: 3px solid #38bdf8;
      border-radius: 8px;
      padding: 12px 18px;
      color: #f1f5f9;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.15);
      backdrop-filter: blur(10px);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    this.speakerEl = document.createElement('div');
    this.speakerEl.style.cssText = `
      font-family: ui-monospace, monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: #38bdf8;
      text-transform: uppercase;
    `;

    this.textEl = document.createElement('div');
    this.textEl.style.cssText = `
      font-size: 13px;
      line-height: 1.5;
      color: #e2e8f0;
      font-weight: 400;
    `;

    this.bubbleEl.appendChild(this.speakerEl);
    this.bubbleEl.appendChild(this.textEl);
    this.container.appendChild(this.bubbleEl);
    parent.appendChild(this.container);
  }

  public setMirrorCallback(cb: (line: NarrativeLine) => void): void {
    this.onMirrorCallback = cb;
  }

  public enqueue(lines: NarrativeLine[]): void {
    if (lines.length === 0) return;
    this.queue.push(...lines);
    if (!this.isDisplaying) {
      this.showNext();
    }
  }

  private showNext(): void {
    if (this.queue.length === 0) {
      this.isDisplaying = false;
      this.hide();
      return;
    }

    this.isDisplaying = true;
    const line = this.queue.shift()!;

    // Play subtle audio tone
    if (line.audioTone === 'chime') {
      audio.playConnectChime();
    } else if (line.audioTone === 'warning') {
      audio.playCollisionDeflection(true);
    } else if (line.audioTone === 'mystery') {
      audio.playScanEffect();
    } else {
      audio.playBlip();
    }

    // Mirror to phone companion if connected
    if (this.onMirrorCallback) {
      this.onMirrorCallback(line);
    }

    this.speakerEl.textContent = line.speaker;
    this.textEl.textContent = line.text;

    // Fade in
    this.bubbleEl.style.opacity = '1';
    this.bubbleEl.style.transform = 'translateY(0)';

    const duration = line.durationMs || Math.max(3000, line.text.length * 60);

    if (this.currentTimeout) clearTimeout(this.currentTimeout);
    this.currentTimeout = window.setTimeout(() => {
      // Fade out briefly before next line
      this.bubbleEl.style.opacity = '0';
      this.bubbleEl.style.transform = 'translateY(-5px)';

      this.currentTimeout = window.setTimeout(() => {
        this.showNext();
      }, 250);
    }, duration);
  }

  public hide(): void {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    this.bubbleEl.style.opacity = '0';
    this.bubbleEl.style.transform = 'translateY(10px)';
    this.isDisplaying = false;
  }

  public clear(): void {
    this.queue = [];
    this.hide();
  }

  public dispose(): void {
    if (this.currentTimeout) clearTimeout(this.currentTimeout);
    this.container.remove();
  }
}

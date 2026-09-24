import type { NarrativeLine } from '../narrative/NarrativeTypes';
import { audio } from '../audio/AudioEngine';
import { commAudio } from '../audio/CommunicationSoundSynth';
import type { DialogueChoice } from '../narrative/ConversationDirector';

export class DialoguePresenter {
  private container: HTMLElement;
  private bubbleEl: HTMLElement;
  private speakerEl: HTMLElement;
  private textEl: HTMLElement;
  private choicesContainer: HTMLElement;

  private queue: NarrativeLine[] = [];
  private isDisplaying = false;
  private currentTimeout: number | null = null;
  private onMirrorCallback: ((line: NarrativeLine) => void) | null = null;
  private onChoiceSelectedCallback: ((topic: string) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'dialogue-presenter-container';

    // Injected responsive style tag for mobile viewport adaptation
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #dialogue-presenter-container {
        position: fixed;
        bottom: 28px;
        left: 28px;
        max-width: 480px;
        z-index: 1500;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        box-sizing: border-box;
      }
      /* Tablet & Touch Devices: Center at top to ensure joystick at bottom-left is never obstructed */
      @media (pointer: coarse), (max-width: 1366px) and (hover: none) {
        #dialogue-presenter-container {
          bottom: auto !important;
          top: max(46px, env(safe-area-inset-top, 46px)) !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          max-width: min(500px, 82vw) !important;
          width: min(500px, 82vw) !important;
        }
        #dialogue-presenter-container .dialogue-bubble {
          padding: 8px 14px !important;
          gap: 5px !important;
          border-radius: 8px !important;
        }
        #dialogue-presenter-container .dialogue-speaker {
          font-size: 9.5px !important;
          letter-spacing: 0.12em !important;
        }
        #dialogue-presenter-container .dialogue-text {
          font-size: 11px !important;
          line-height: 1.4 !important;
        }
        #dialogue-presenter-container button {
          font-size: 10.5px !important;
          padding: 5px 10px !important;
        }
      }
      body.touch-controls-active #dialogue-presenter-container {
        bottom: auto !important;
        top: max(46px, env(safe-area-inset-top, 46px)) !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        max-width: min(500px, 82vw) !important;
        width: min(500px, 82vw) !important;
      }
      body.touch-controls-active #dialogue-presenter-container .dialogue-bubble {
        padding: 8px 14px !important;
        gap: 5px !important;
        border-radius: 8px !important;
      }
      body.touch-controls-active #dialogue-presenter-container .dialogue-speaker {
        font-size: 9.5px !important;
        letter-spacing: 0.12em !important;
      }
      body.touch-controls-active #dialogue-presenter-container .dialogue-text {
        font-size: 11px !important;
        line-height: 1.4 !important;
      }
      body.touch-controls-active #dialogue-presenter-container button {
        font-size: 10.5px !important;
        padding: 5px 10px !important;
      }
      /* Compact Phone Overrides */
      @media (max-width: 850px), (max-height: 520px) {
        #dialogue-presenter-container {
          bottom: auto !important;
          top: max(44px, env(safe-area-inset-top, 44px)) !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          max-width: min(380px, 86vw) !important;
          width: min(380px, 86vw) !important;
          z-index: 120 !important;
        }
        #dialogue-presenter-container .dialogue-bubble {
          padding: 6px 10px !important;
          gap: 4px !important;
          border-radius: 6px !important;
          background: rgba(10, 16, 28, 0.95) !important;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6) !important;
        }
        #dialogue-presenter-container .dialogue-speaker {
          font-size: 8.5px !important;
          letter-spacing: 0.12em !important;
        }
        #dialogue-presenter-container .dialogue-text {
          font-size: 10px !important;
          line-height: 1.35 !important;
        }
        #dialogue-presenter-container button {
          font-size: 9.5px !important;
          padding: 4px 8px !important;
        }
      }
    `;
    this.container.appendChild(styleEl);

    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'dialogue-bubble';
    this.bubbleEl.style.cssText = `
      background: rgba(10, 16, 28, 0.92);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-left: 3px solid #38bdf8;
      border-radius: 8px;
      padding: 14px 18px;
      color: #f1f5f9;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.15);
      backdrop-filter: blur(12px);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: auto;
    `;

    this.speakerEl = document.createElement('div');
    this.speakerEl.className = 'dialogue-speaker';
    this.speakerEl.style.cssText = `
      font-family: ui-monospace, monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: #38bdf8;
      text-transform: uppercase;
    `;

    this.textEl = document.createElement('div');
    this.textEl.className = 'dialogue-text';
    this.textEl.style.cssText = `
      font-size: 13.5px;
      line-height: 1.55;
      color: #e2e8f0;
      font-weight: 400;
    `;

    this.choicesContainer = document.createElement('div');
    this.choicesContainer.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.2);
      padding-top: 8px;
    `;

    this.bubbleEl.appendChild(this.speakerEl);
    this.bubbleEl.appendChild(this.textEl);
    this.bubbleEl.appendChild(this.choicesContainer);
    this.container.appendChild(this.bubbleEl);
    parent.appendChild(this.container);
  }

  public setMirrorCallback(cb: (line: NarrativeLine) => void): void {
    this.onMirrorCallback = cb;
  }

  public setChoiceCallback(cb: (topic: string) => void): void {
    this.onChoiceSelectedCallback = cb;
  }

  public enqueue(lines: NarrativeLine[]): void {
    if (lines.length === 0) return;
    this.queue.push(...lines);
    if (!this.isDisplaying) {
      this.showNext();
    }
  }

  public showInteractiveConversation(
    speaker: string,
    text: string,
    choices: DialogueChoice[]
  ): void {
    if (this.currentTimeout) clearTimeout(this.currentTimeout);

    this.isDisplaying = true;
    this.speakerEl.textContent = speaker;
    this.textEl.textContent = text;
    this.choicesContainer.innerHTML = '';

    if (choices.length > 0) {
      this.choicesContainer.style.display = 'flex';
      for (const c of choices) {
        const btn = document.createElement('button');
        btn.textContent = `› ${c.text}`;
        btn.style.cssText = `
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 4px;
          color: #38bdf8;
          padding: 6px 10px;
          text-align: left;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
        `;
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(56, 189, 248, 0.25)';
          btn.style.borderColor = '#38bdf8';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(15, 23, 42, 0.8)';
          btn.style.borderColor = 'rgba(56, 189, 248, 0.3)';
        });
        btn.addEventListener('click', () => {
          audio.playBlip();
          if (this.onChoiceSelectedCallback) {
            this.onChoiceSelectedCallback(c.topic);
          }
        });
        this.choicesContainer.appendChild(btn);
      }
    } else {
      this.choicesContainer.style.display = 'none';
      this.currentTimeout = window.setTimeout(() => {
        this.hide();
      }, 4000);
    }

    this.bubbleEl.style.opacity = '1';
    this.bubbleEl.style.transform = 'translateY(0)';

    audio.playConnectChime();
    commAudio.playSpeechSignature(speaker, 3);

    if (this.onMirrorCallback) {
      this.onMirrorCallback({
        speaker,
        text,
        durationMs: 5000,
        audioTone: 'chime',
      });
    }
  }

  private showNext(): void {
    if (this.queue.length === 0) {
      this.isDisplaying = false;
      this.hide();
      return;
    }

    this.isDisplaying = true;
    this.choicesContainer.style.display = 'none';
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
    commAudio.playSpeechSignature(line.speaker, 3);

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
    this.choicesContainer.style.display = 'none';
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

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
          top: max(44px, calc(env(safe-area-inset-top, 0px) + 38px)) !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          max-width: min(330px, 48vw) !important;
          width: min(330px, 48vw) !important;
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
      @media (max-width: 600px) and (orientation: portrait) {
        #dialogue-presenter-container {
          max-width: min(360px, 88vw) !important;
          width: min(360px, 88vw) !important;
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
      display: none;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
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

  private getAvatarSvg(speaker: string): string {
    const s = speaker.toLowerCase();
    if (s.includes('weaver') || s.includes('insect') || s.includes('chitin')) {
      // Insectoid Weaver
      return `
        <svg viewBox="0 0 48 48" width="44" height="44" style="filter: drop-shadow(0 0 6px #38bdf8);">
          <circle cx="24" cy="24" r="22" fill="#0b1329" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 2" />
          <!-- Antennae -->
          <path d="M18 16 Q12 8 8 10 M30 16 Q36 8 40 10" stroke="#38bdf8" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <circle cx="8" cy="10" r="1.5" fill="#38bdf8"/>
          <circle cx="40" cy="10" r="1.5" fill="#38bdf8"/>
          <!-- Carapace Head -->
          <polygon points="24,14 32,22 28,32 20,32 16,22" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
          <!-- Compound Eyes -->
          <ellipse cx="20" cy="22" rx="2.5" ry="4" fill="#38bdf8" />
          <ellipse cx="28" cy="22" rx="2.5" ry="4" fill="#38bdf8" />
          <!-- Mandibles -->
          <path d="M22 30 Q24 35 21 37 M26 30 Q24 35 27 37" stroke="#38bdf8" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        </svg>
      `;
    } else if (s.includes('cephalopod') || s.includes('custodian') || s.includes('water') || s.includes('abyss')) {
      // Cephalopod Ascendant
      return `
        <svg viewBox="0 0 48 48" width="44" height="44" style="filter: drop-shadow(0 0 6px #06b6d4);">
          <circle cx="24" cy="24" r="22" fill="#081826" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="4 2" />
          <!-- Mantle Dome -->
          <path d="M14 26 C14 14 34 14 34 26 C34 29 14 29 14 26 Z" fill="#0f2b3f" stroke="#06b6d4" stroke-width="1.5" />
          <circle cx="24" cy="22" r="3.5" fill="#22d3ee" />
          <!-- Trailing Tendrils -->
          <path d="M16 29 Q14 38 18 42 M20 29 Q22 37 20 43 M24 29 Q25 39 24 44 M28 29 Q26 37 28 43 M32 29 Q34 38 30 42" stroke="#06b6d4" stroke-width="1.5" fill="none" stroke-linecap="round" />
        </svg>
      `;
    } else if (s.includes('avian') || s.includes('archon') || s.includes('air') || s.includes('plume')) {
      // Avian Archon
      return `
        <svg viewBox="0 0 48 48" width="44" height="44" style="filter: drop-shadow(0 0 6px #a855f7);">
          <circle cx="24" cy="24" r="22" fill="#140f28" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="2 2" />
          <!-- Head Crest -->
          <path d="M24 10 L28 17 L24 15 L20 17 Z" fill="#c084fc" />
          <!-- Sleek Mask & Beak -->
          <polygon points="24,15 31,23 24,36 17,23" fill="#241442" stroke="#a855f7" stroke-width="1.5" />
          <!-- Angled Raptor Visor -->
          <polygon points="20,23 28,23 24,27" fill="#c084fc" />
        </svg>
      `;
    } else if (s.includes('fungal') || s.includes('colossus') || s.includes('spore')) {
      // Fungal Colossus
      return `
        <svg viewBox="0 0 48 48" width="44" height="44" style="filter: drop-shadow(0 0 6px #10b981);">
          <circle cx="24" cy="24" r="22" fill="#091c15" stroke="#10b981" stroke-width="1.5" />
          <!-- Cap Tiers -->
          <path d="M10 24 Q24 10 38 24 Z" fill="#0f3b28" stroke="#10b981" stroke-width="1.5" />
          <path d="M14 20 Q24 12 34 20 Z" fill="#10b981" opacity="0.4" />
          <rect x="21" y="24" width="6" height="15" rx="2" fill="#064e3b" stroke="#10b981" stroke-width="1.5" />
          <circle cx="17" cy="18" r="1.5" fill="#34d399"/>
          <circle cx="24" cy="15" r="1.5" fill="#34d399"/>
          <circle cx="31" cy="18" r="1.5" fill="#34d399"/>
        </svg>
      `;
    } else if (s.includes('lithic') || s.includes('titan') || s.includes('elder')) {
      // Lithic Titan
      return `
        <svg viewBox="0 0 48 48" width="44" height="44" style="filter: drop-shadow(0 0 6px #fbbf24);">
          <circle cx="24" cy="24" r="22" fill="#1a1408" stroke="#fbbf24" stroke-width="1.5" />
          <!-- Faceted Crystal Monolith -->
          <polygon points="24,10 33,20 28,38 20,38 15,20" fill="#2d220a" stroke="#fbbf24" stroke-width="1.5" />
          <polygon points="24,14 30,22 24,34 18,22" fill="#fbbf24" opacity="0.3" stroke="#fef08a" stroke-width="1" />
          <circle cx="24" cy="24" r="3" fill="#fef08a" />
        </svg>
      `;
    } else {
      // Default: Starship Captain / Pilot Comms
      return `
        <svg viewBox="0 0 48 48" width="44" height="44" style="filter: drop-shadow(0 0 6px #38bdf8);">
          <circle cx="24" cy="24" r="22" fill="#0a1526" stroke="#38bdf8" stroke-width="1.5" />
          <!-- Flight Helmet -->
          <path d="M14 24 C14 14 34 14 34 24 C34 32 30 36 24 36 C18 36 14 32 14 24 Z" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
          <!-- HUD Visor Glass -->
          <path d="M17 22 C17 18 31 18 31 22 C31 28 17 28 17 22 Z" fill="#0284c7" stroke="#38bdf8" stroke-width="1" />
          <!-- Radio Antenna -->
          <line x1="33" y1="24" x2="38" y2="18" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" />
          <circle cx="38" cy="18" r="1.5" fill="#38bdf8" />
        </svg>
      `;
    }
  }

  private renderAvatarHeader(speaker: string): void {
    const svgHtml = this.getAvatarSvg(speaker);
    this.speakerEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
        <div style="flex-shrink: 0; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
          ${svgHtml}
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: #38bdf8;">
            ${speaker.toUpperCase()}
          </div>
          <div style="font-size: 9px; color: #94a3b8; font-family: ui-monospace, monospace; display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34d399; animation: pulse 1s infinite;"></span>
            <span>COMMS CHANNEL 1420.405 MHz</span>
          </div>
        </div>
      </div>
    `;
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
    if (typeof document !== 'undefined') {
      document.body.classList.add('dialogue-active');
    }
    this.renderAvatarHeader(speaker);
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

    this.bubbleEl.style.display = 'flex';
    this.bubbleEl.style.pointerEvents = 'auto';
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
    if (typeof document !== 'undefined') {
      document.body.classList.add('dialogue-active');
    }
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

    this.renderAvatarHeader(line.speaker);
    this.textEl.textContent = line.text;

    // Fade in
    this.bubbleEl.style.display = 'flex';
    this.bubbleEl.style.pointerEvents = 'auto';
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
    this.bubbleEl.style.pointerEvents = 'none';
    this.bubbleEl.style.display = 'none';
    this.bubbleEl.style.transform = 'translateY(10px)';
    this.choicesContainer.style.display = 'none';
    this.isDisplaying = false;
    if (typeof document !== 'undefined') {
      document.body.classList.remove('dialogue-active');
    }
  }

  public clear(): void {
    this.queue = [];
    this.hide();
  }

  public dispose(): void {
    if (this.currentTimeout) clearTimeout(this.currentTimeout);
    if (typeof document !== 'undefined') {
      document.body.classList.remove('dialogue-active');
    }
    this.container.remove();
  }
}

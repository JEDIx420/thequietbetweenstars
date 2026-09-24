import { audio } from '../audio/AudioEngine';
import type { StoryState } from '../story/StoryTypes';

export interface MissionTipContent {
  title: string;
  subtitle: string;
  summary: string;
  steps: string[];
  controlsHint: string;
}

export class MissionHelpModal {
  private container: HTMLElement;
  private isVisible = false;
  private onOpenJournalCallback: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'mission-help-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1500;
      background: radial-gradient(circle at 50% 50%, rgba(10, 16, 28, 0.94) 0%, rgba(3, 7, 18, 0.97) 100%);
      backdrop-filter: blur(14px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: #f8fafc;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      user-select: none;
      box-sizing: border-box;
    `;

    parent.appendChild(this.container);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.close();
      }
    });
  }

  public setOnOpenJournal(cb: () => void): void {
    this.onOpenJournalCallback = cb;
  }

  public getIsOpen(): boolean {
    return this.isVisible;
  }

  public open(state: StoryState, isTouch = false): void {
    const tip = this.generateTipContent(state, isTouch);
    this.render(tip, !!state.freeExplorationMode);
    this.container.style.display = 'flex';
    this.isVisible = true;
    audio.playConnectChime();
  }

  public close(): void {
    if (!this.isVisible) return;
    this.container.style.display = 'none';
    this.isVisible = false;
    audio.playBlip();
  }

  public toggle(state: StoryState, isTouch = false): void {
    if (this.isVisible) {
      this.close();
    } else {
      this.open(state, isTouch);
    }
  }

  private generateTipContent(state: StoryState, isTouch: boolean): MissionTipContent {
    if (state.freeExplorationMode) {
      return {
        title: 'EXPLORATION // FREE ROAM MODE',
        subtitle: 'Main Storyline Paused',
        summary: 'You are currently in pure sandbox exploration mode. Story objectives and scripted anomaly encounters are on standby.',
        steps: [
          'Fly freely across star systems and investigate planetary orbits.',
          'Descend to planet surfaces to discover alien wildlife, flora, and abandoned structures.',
          'Open the Star Chart (press [M] or tap radar) to plan warp trajectories to distant stars.',
          'To resume Chapter 1: The Resonance at any time, tap "▶ RESUME" on the top-left mission pill or toggle Story Missions in Settings.',
        ],
        controlsHint: isTouch
          ? 'Use virtual sticks to maneuver · Tap targets on radar to lock'
          : 'WASD / Arrows to steer · [W] Thrust · [S] Reverse · [M] Map · [J] Journal',
      };
    }

    const beat = state.currentBeat;
    switch (beat) {
      case 'beat_0_awakening':
        return {
          title: 'CHAPTER 1: THE RESONANCE',
          subtitle: 'Beat 0 // Subcarrier Whisper',
          summary: 'Mnemosyne has detected an ultra-low frequency harmonic carrier wave (432.8 Hz) permeating the Solara star system.',
          steps: [
            'Inspect your local surroundings in the Solara system.',
            'Press [M] to open Stellar Cartography and view nearby orbits.',
            'Fly into the system to acquire the source of the resonance wave.',
          ],
          controlsHint: isTouch
            ? 'Touch virtual stick to steer · Tap targets to lock'
            : '[W] Forward thrust · [A/D] Roll · [M] Star Map · [J] Ship Journal',
        };

      case 'beat_1_first_whisper':
        return {
          title: 'SYNCHRONIZING WITH RESONANCE MONOLITH PRIME',
          subtitle: 'Beat 1 // First Whisper',
          summary: 'A crystalline obelisk is echoing at 432.8 Hz in this system, containing Fragment α.',
          steps: [
            'Find "Resonance Monolith Prime" on your navigation radar (cyan marker).',
            'Fly within scanning range (under 1500 meters).',
            'Hold [SPACE] (or the touch SENSOR button) to execute deflector harmonization across Stages 1, 2, and 3.',
            'Maintain position within range until the scan completes to recover Fragment α.',
          ],
          controlsHint: isTouch
            ? 'Approach target · Hold SENSOR button at bottom right to scan'
            : 'Approach within 1500m · Hold [SPACE] to perform staged resonance scan',
        };

      case 'beat_2_station_contact':
        return {
          title: 'DOCKING AT RESEARCH OUTPOST EPSILON-7',
          subtitle: 'Beat 2 // Sanctuary in the Dark',
          summary: 'Dr. Valeria Vance at Frontier Research Outpost Epsilon-7 has detected your incoming harmonic signature.',
          steps: [
            'Locate "Research Outpost Epsilon-7" marked on your radar.',
            'Approach Bay 03 and decelerate below 40 m/s within 350 meters of the station.',
            'Hold [F] (or tap [DOCK] on mobile) to dock with the station.',
            'Access the Signal Lab to consult with Dr. Vance regarding Fragment α.',
          ],
          controlsHint: isTouch
            ? 'Slow down near station · Tap [DOCK] button when in range'
            : 'Slow to < 40m/s near station · Hold [F] to initiate docking clamps',
        };

      case 'beat_3_fragment_alpha':
        return {
          title: 'EXTRACTING FRAGMENT β FROM SURVEY CRAFT ALPHA-9',
          subtitle: 'Beat 3 // The Missing Cadence',
          summary: 'Dr. Vance needs the dual harmonic key. An old recon craft, Derelict Survey Craft Alpha-9, went dark in the outer system.',
          steps: [
            'Follow the navigation vector to "Derelict Survey Craft Alpha-9" in the outer system.',
            'Close distance to under 1800 meters.',
            'Hold [SPACE] (or touch SENSOR) to analyze its flight recorder and extract Fragment β (528.0 Hz).',
          ],
          controlsHint: isTouch
            ? 'Lock Derelict on radar · Approach within range · Hold SENSOR to scan'
            : 'Lock target [T] · Approach within range · Hold [SPACE] to scan core',
        };

      case 'beat_4_decryption':
        return {
          title: 'DUAL HARMONIC SYNTHESIS',
          subtitle: 'Beat 4 // Harmonic Synthesis',
          summary: 'Both harmonic keys (Fragment α and β) are secured. Return to Epsilon-7 for dual-frequency synthesis.',
          steps: [
            'Fly back to Research Outpost Epsilon-7 and dock at Bay 03.',
            'Open the Signal Lab interface to synthesize Fragment α and β into a gateway alignment key.',
            'Receive the decrypted coordinates for the First Harmonic Relay.',
          ],
          controlsHint: isTouch
            ? 'Dock at Epsilon-7 · Select Signal Lab to synthesize fragments'
            : 'Dock at Epsilon-7 [F] · Open Signal Lab · Synthesize gateway key',
        };

      case 'beat_5_relay_coordinates':
        return {
          title: 'THE SPIRES OF THE QUIET',
          subtitle: 'Beat 5 // The Spires of the Quiet',
          summary: 'The ancient First Builder gateway megastructure has been pinpointed in deep space.',
          steps: [
            'Select "First Harmonic Relay: Spires of the Quiet" on your navigation radar.',
            'Engage cruise velocity to travel to the outer coordinates.',
            'Approach the three resonance pillars surrounding the gateway ring.',
          ],
          controlsHint: isTouch
            ? 'Follow relay radar icon · Cruise to deep-space coordinates'
            : 'Target relay · Use cruise thrust [W] or autopilot [R] to reach the spires',
        };

      case 'beat_6_relay_alignment':
        return {
          title: 'NOMAD OF THE DEEP & TRIPLE SPIRE ALIGNMENT',
          subtitle: 'Beat 6 // Nomad of the Deep',
          summary: 'Captain Zephyr of The Wanderer-7 is stationed near the relay spires.',
          steps: [
            'Hail Captain Zephyr within 400 meters to receive instructions.',
            'Approach each of the three harmonic relay spires (Alpha, Beta, Gamma).',
            'Harmonize and align all three pillars using your ship deflector frequency.',
          ],
          controlsHint: isTouch
            ? 'Approach vessel to hail · Fly close to each spire and hold SENSOR'
            : 'Press [H] near vessel to hail · Hold [SPACE] near each spire to resonate',
        };

      case 'beat_7_chapter1_climax':
      default:
        return {
          title: 'CHAPTER 1: THE RESONANCE // COMPLETE',
          subtitle: 'The Great Silence Pierced',
          summary: 'The First Harmonic Relay is active. Ancient network gateways across the sector are humming once again.',
          steps: [
            'Explore the outer rim and uncharted star systems.',
            'Survey exotic biomes and catalog megafauna on deep-space planets.',
            'Trade rare minerals and complete contracts at frontier outposts.',
          ],
          controlsHint: isTouch
            ? 'The cosmos is open · Use radar and Star Chart to explore'
            : 'Press [M] for Star Chart · Press [J] for Expedition Journal',
        };
    }
  }

  private render(tip: MissionTipContent, isFree: boolean): void {
    const stepsHtml = tip.steps
      .map(
        (step, i) => `
        <div style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px;">
          <div style="
            min-width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${isFree ? 'rgba(74, 222, 128, 0.2)' : 'rgba(56, 189, 248, 0.2)'};
            border: 1px solid ${isFree ? '#4ade80' : '#38bdf8'};
            color: ${isFree ? '#4ade80' : '#38bdf8'};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 700;
          ">${i + 1}</div>
          <div style="font-size: 11.5px; line-height: 1.45; color: #cbd5e1; font-family: ui-sans-serif, system-ui, sans-serif;">
            ${step}
          </div>
        </div>
      `
      )
      .join('');

    this.container.innerHTML = `
      <div class="modal-scrollable" data-scrollable="true" style="
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid ${isFree ? 'rgba(74, 222, 128, 0.45)' : 'rgba(56, 189, 248, 0.4)'};
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px ${isFree ? 'rgba(74, 222, 128, 0.15)' : 'rgba(56, 189, 248, 0.15)'};
        max-width: 480px;
        max-height: min(88dvh, 560px);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        width: 100%;
        padding: 20px 22px;
        box-sizing: border-box;
      ">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.2); padding-bottom: 10px;">
          <div>
            <div style="font-size: 9.5px; letter-spacing: 0.18em; color: ${isFree ? '#4ade80' : '#38bdf8'}; text-transform: uppercase; font-weight: 700;">
              ${tip.subtitle}
            </div>
            <h3 style="margin: 3px 0 0 0; font-size: 14px; font-weight: 700; letter-spacing: 0.05em; color: #f8fafc; text-transform: uppercase;">
              ${tip.title}
            </h3>
          </div>
          <button id="btn-mission-help-close" style="
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.3);
            color: #cbd5e1;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            font-family: inherit;
          ">✕ CLOSE</button>
        </div>

        <!-- Summary -->
        <div style="font-size: 11.5px; line-height: 1.5; color: #94a3b8; margin-bottom: 14px; font-family: ui-sans-serif, system-ui, sans-serif;">
          ${tip.summary}
        </div>

        <!-- Steps List -->
        <div style="margin-bottom: 14px;">
          <div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; color: #7dd3fc; margin-bottom: 8px; text-transform: uppercase;">
            RECOMMENDED ACTIONS:
          </div>
          ${stepsHtml}
        </div>

        <!-- Controls Hint Banner -->
        <div style="
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 6px;
          padding: 8px 12px;
          margin-bottom: 16px;
          font-size: 10px;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <span style="color: ${isFree ? '#4ade80' : '#38bdf8'}; font-size: 12px;">⚙</span>
          <span>${tip.controlsHint}</span>
        </div>

        <!-- Footer Actions -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
          <button id="btn-mission-help-journal" style="
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.4);
            color: #38bdf8;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
          ">📖 EXPEDITION JOURNAL</button>

          <button id="btn-mission-help-dismiss" style="
            background: #0284c7;
            border: none;
            color: #ffffff;
            padding: 6px 18px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            font-family: inherit;
          ">CONTINUE</button>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-mission-help-close')?.addEventListener('click', () => {
      this.close();
    });

    this.container.querySelector('#btn-mission-help-dismiss')?.addEventListener('click', () => {
      this.close();
    });

    this.container.querySelector('#btn-mission-help-journal')?.addEventListener('click', () => {
      this.close();
      if (this.onOpenJournalCallback) {
        this.onOpenJournalCallback();
      }
    });

    // Close on background click
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }

  public dispose(): void {
    this.container.remove();
  }
}

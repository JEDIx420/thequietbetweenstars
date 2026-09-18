import * as THREE from 'three';
import type { LockableTarget } from '../targeting/TargetLockSystem';
import type { StoryDirector } from '../../story/StoryDirector';
import type { DockingController } from '../docking/DockingController';
import type { StationInterfaceModal } from '../../ui/StationInterfaceModal';
import type { DialoguePresenter } from '../../ui/DialoguePresenter';
import type { SpaceStation } from '../stations/SpaceStationManager';
import type { NamedVessel } from '../vessels/NamedVesselDirector';
import type { HarmonicRelay } from '../structures/HarmonicRelay';
import type { SpaceEncounter } from '../scenes/SpaceEncounterManager';
import { StagedScanController } from '../scanning/StagedScanController';
import { audio } from '../../audio/AudioEngine';
import { commAudio } from '../../audio/CommunicationSoundSynth';
import { sceneAudio } from '../../audio/AudioSceneDirector';
import { localAI } from '../../ai/LocalIntelligenceService';
import { CHAPTER_1_BEATS } from '../../story/chapters/Chapter1Resonance';

export interface SpaceInteractionCallbacks {
  showNotice: (msg: string) => void;
  setContextPrompt: (msg: string) => void;
  addCredits: (amount: number) => void;
  addSample: (cat: string) => void;
  saveJourney: () => void;
  dockCourierPod?: () => void;
  isHeld?: boolean;
  isTriggered?: boolean;
}

export class SpaceInteractionController {
  private storyDirector: StoryDirector;
  private dockingController: DockingController;
  public stationModal: StationInterfaceModal | null = null;
  private dialoguePresenter: DialoguePresenter;

  constructor(
    storyDirector: StoryDirector,
    dockingController: DockingController,
    dialoguePresenter: DialoguePresenter
  ) {
    this.storyDirector = storyDirector;
    this.dockingController = dockingController;
    this.dialoguePresenter = dialoguePresenter;
  }

  public setStationModal(modal: StationInterfaceModal): void {
    this.stationModal = modal;
  }

  public updateInteractionPrompt(
    lockedTarget: LockableTarget,
    shipPos: THREE.Vector3,
    callbacks: SpaceInteractionCallbacks
  ): void {
    const dist = lockedTarget.distance ?? Math.round(shipPos.distanceTo(lockedTarget.position));

    switch (lockedTarget.type) {
      case 'station': {
        const station = lockedTarget.data as SpaceStation;
        const canDock = station.canDock(shipPos).allowed;
        if (canDock) {
          callbacks.setContextPrompt(`LOCKED: ${station.name} [${dist}m] // SPACE: REQUEST DOCKING`);
        } else {
          callbacks.setContextPrompt(`LOCKED: ${station.name} [${dist}m] // APPROACH TO DOCK (<${station.captureRadius}m)`);
        }
        break;
      }

      case 'vessel': {
        const vessel = lockedTarget.data as NamedVessel;
        const canHail = vessel.canHail(shipPos);
        if (canHail) {
          callbacks.setContextPrompt(`LOCKED: ${vessel.name} [${dist}m] // SPACE: OPEN COMMS HAIL`);
        } else {
          callbacks.setContextPrompt(`LOCKED: ${vessel.name} [${dist}m] // APPROACH TO HAIL (<${vessel.hailRadius}m)`);
        }
        break;
      }

      case 'relay': {
        const relay = lockedTarget.data as HarmonicRelay;
        const unaligned = relay.getNearbyUnalignedPillar(shipPos);
        if (unaligned) {
          callbacks.setContextPrompt(`LOCKED: HARMONIC SPIRE 0${unaligned.index + 1} // SPACE: ALIGN RESONANCE`);
        } else if (relay.isActivated) {
          callbacks.setContextPrompt(`LOCKED: FIRST HARMONIC RELAY // STATUS: SYNCHRONIZED`);
        } else {
          callbacks.setContextPrompt(`LOCKED: ${relay.name} [${dist}m] // APPROACH A DORMANT TUNING SPIRE`);
        }
        break;
      }

      case 'encounter': {
        const enc = lockedTarget.data as SpaceEncounter;
        if (enc.anomalyDescriptor) {
          const stage = StagedScanController.getCurrentStage(enc.anomalyDescriptor);
          const canScan = StagedScanController.canInitiateStage(enc.anomalyDescriptor, dist).canScan;
          if (canScan) {
            const pct = Math.round((enc.anomalyDescriptor.scanProgress || 0) * 100);
            callbacks.setContextPrompt(
              `LOCKED: ${enc.name} // STAGE ${stage.stage}: ${stage.name.toUpperCase()} [${pct}%] // HOLD SPACE TO SCAN`
            );
          } else {
            callbacks.setContextPrompt(
              `LOCKED: ${enc.name} [${dist}m] // APPROACH TO WITHIN ${stage.requiredMaxDistance}m FOR STAGE ${stage.stage}`
            );
          }
        } else {
          const inRange = dist <= 200;
          callbacks.setContextPrompt(
            inRange
              ? `LOCKED: ${enc.name} [${dist}m] // SPACE: SCAN & HARVEST`
              : `LOCKED: ${enc.name} [${dist}m] // APPROACH TO SCAN (<200m)`
          );
        }
        break;
      }

      default:
        break;
    }
  }

  public handleSpaceAction(
    lockedTarget: LockableTarget,
    shipPos: THREE.Vector3,
    dt: number,
    callbacks: SpaceInteractionCallbacks
  ): void {
    const dist = lockedTarget.distance ?? Math.round(shipPos.distanceTo(lockedTarget.position));

    switch (lockedTarget.type) {
      case 'station': {
        if (callbacks.isTriggered === false) break;
        const station = lockedTarget.data as SpaceStation;
        const req = this.dockingController.requestDocking(station, shipPos);
        if (req.success) {
          callbacks.showNotice(req.message);
          audio.playConnectChime();
          sceneAudio.setMood('STATION_DOCKED');
          this.storyDirector.emit({
            type: 'STATION_DOCKED',
            payload: { stationId: station.id },
            timestamp: Date.now(),
          });
        } else {
          callbacks.showNotice(req.message);
          audio.playScanEffect();
        }
        break;
      }

      case 'vessel': {
        if (callbacks.isTriggered === false) break;
        const vessel = lockedTarget.data as NamedVessel;
        if (vessel.canHail(shipPos)) {
          sceneAudio.setMood('HAILING');
          this.storyDirector.emit({
            type: 'VESSEL_HAILED',
            payload: { vesselId: vessel.id },
            timestamp: Date.now(),
          });

          // Fetch story dialogue or generate via Local AI
          const state = this.storyDirector.getState();
          const beatDef = CHAPTER_1_BEATS[state.currentBeat];
          const defaultSpeaker = vessel.captainName;
          const defaultLines = beatDef?.dialogueLines || [
            'Greetings, explorer. The quiet paths are long, but harmonious.',
            'May the currents guide your ship true.',
          ];

          // Use Local AI if ready and enabled
          if (localAI.isAiEnabled() && localAI.getStatus() === 'READY') {
            localAI
              .generateReply(
                defaultSpeaker,
                'cosmic currents and the harmonic relay',
                state,
                'Aurelia',
                defaultLines[0]
              )
              .then((aiReply) => {
                this.dialoguePresenter.enqueue([
                  {
                    speaker: defaultSpeaker,
                    text: aiReply,
                    audioTone: 'chime',
                  },
                ]);
              });
          } else {
            this.dialoguePresenter.enqueue(
              defaultLines.map((line) => ({
                speaker: defaultSpeaker,
                text: line,
                audioTone: 'chime',
              }))
            );
          }

          callbacks.showNotice(`COMMS CHANNEL LINKED // ${vessel.name.toUpperCase()}`);
        } else {
          callbacks.showNotice(`OUT OF HAIL RANGE [${dist}m] — APPROACH WITHIN ${vessel.hailRadius}m`);
          audio.playScanEffect();
        }
        break;
      }

      case 'relay': {
        if (callbacks.isTriggered === false) break;
        const relay = lockedTarget.data as HarmonicRelay;
        const unaligned = relay.getNearbyUnalignedPillar(shipPos);
        if (unaligned) {
          const aligned = relay.alignPillar(unaligned.index, this.storyDirector);
          if (aligned) {
            audio.playConnectChime();
            const fragmentsCount = this.storyDirector.getState().resonanceFragments.length;
            commAudio.playLeitmotif(fragmentsCount + unaligned.index + 1);
            callbacks.showNotice(`HARMONIC SPIRE 0${unaligned.index + 1} RESONANCE SYNCHRONIZED!`);

            if (relay.isActivated) {
              sceneAudio.setMood('RELAY_PROXIMITY');
              callbacks.showNotice('MEGASTRUCTURE HARMONIC FIELD ENGAGED // GATEWAY ACTIVATING');
              commAudio.playLeitmotif(5); // Full 5-note leitmotif chord
            }
            callbacks.saveJourney();
          }
        } else {
          callbacks.showNotice('APPROACH A DORMANT TUNING SPIRE TO ALIGN RESONANCE');
        }
        break;
      }

      case 'encounter': {
        const enc = lockedTarget.data as SpaceEncounter;
        if (enc.anomalyDescriptor) {
          const isScanningHeld = callbacks.isHeld ?? true;
          const res = StagedScanController.updateScan(enc.anomalyDescriptor, dist, isScanningHeld, dt);
          if (res.stageAdvanced) {
            audio.playConnectChime();
            const state = this.storyDirector.getState();
            commAudio.playLeitmotif(Math.min(5, state.resonanceFragments.length + 1));

            if (res.newStage >= 4 && res.fragmentUnlocked) {
              this.storyDirector.emit({
                type: 'FRAGMENT_RECOVERED',
                payload: { fragment: res.fragmentUnlocked },
                timestamp: Date.now(),
              });
              callbacks.showNotice(`DISCOVERY COMPLETE // ${res.fragmentUnlocked.name.toUpperCase()} RECOVERED`);
              callbacks.addCredits(enc.rewardCredits);
              callbacks.saveJourney();
            } else {
              const stage = StagedScanController.getCurrentStage(enc.anomalyDescriptor);
              callbacks.showNotice(`STAGE ADVANCED: ${stage.name.toUpperCase()} COMPLETED`);
            }
          }
        } else {
          // Standard encounter scan
          if (callbacks.isTriggered !== false && !enc.isScanned && dist <= 200) {
            enc.isScanned = true;
            callbacks.addCredits(enc.rewardCredits);
            if (enc.rewardSampleCategory) {
              callbacks.addSample(enc.rewardSampleCategory);
            }
            audio.playConnectChime();
            callbacks.showNotice(`DISCOVERY: ${enc.name} // +${enc.rewardCredits} CREDITS`);
            callbacks.saveJourney();
          }
        }
        break;
      }

      case 'courier': {
        if (callbacks.isTriggered !== false && callbacks.dockCourierPod) {
          callbacks.dockCourierPod();
        }
        break;
      }

      default:
        break;
    }
  }
}

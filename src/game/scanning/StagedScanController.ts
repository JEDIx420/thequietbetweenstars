import type { SpaceAnomalyDescriptor, AnomalyScanStage } from '../systems/PlanetDescriptor';
import type { ResonanceFragment } from '../../story/StoryTypes';

export const DEFAULT_RESONANCE_SCAN_STAGES: AnomalyScanStage[] = [
  {
    stage: 0,
    name: 'Harmonic Detection',
    requiredMaxDistance: 2500,
    holdDurationSec: 0,
    description: 'Long-range subcarrier wave detected. Align sensors to approach.',
    unlockedData: 'Carrier frequency identified.',
  },
  {
    stage: 1,
    name: 'Frequency Synchronization',
    requiredMaxDistance: 1500,
    holdDurationSec: 1.5,
    description: 'Tuning deflector harmonics to match spatial modulation.',
    unlockedData: 'Phase lock established.',
  },
  {
    stage: 2,
    name: 'Telemetry Extraction',
    requiredMaxDistance: 800,
    holdDurationSec: 2.5,
    description: 'Sampling structural waveforms and geometric reflection data.',
    unlockedData: 'Ancient architecture telemetry decoded.',
  },
  {
    stage: 3,
    name: 'Core Resonance Probe',
    requiredMaxDistance: 350,
    holdDurationSec: 3.0,
    description: 'Firing deep acoustic resonance pulse into central core.',
    unlockedData: 'Resonance memory fragment recovered!',
  },
  {
    stage: 4,
    name: 'Archived / Resolved',
    requiredMaxDistance: 0,
    holdDurationSec: 0,
    description: 'Full resonance cycle completed. Entity remains in harmonic equilibrium.',
  },
];

export interface StagedScanUpdateResult {
  stageAdvanced: boolean;
  newStage: number;
  progress: number;
  fragmentUnlocked?: ResonanceFragment;
}

export class StagedScanController {
  public static ensureScanStages(anomaly: SpaceAnomalyDescriptor): void {
    if (!anomaly.scanStages || anomaly.scanStages.length === 0) {
      anomaly.scanStages = DEFAULT_RESONANCE_SCAN_STAGES.map((s) => ({ ...s }));
    }
    if (anomaly.currentStage === undefined) {
      anomaly.currentStage = 0;
    }
    if (anomaly.scanProgress === undefined) {
      anomaly.scanProgress = 0;
    }
  }

  public static getCurrentStage(anomaly: SpaceAnomalyDescriptor): AnomalyScanStage {
    this.ensureScanStages(anomaly);
    const stages = anomaly.scanStages!;
    const idx = Math.min(anomaly.currentStage ?? 0, stages.length - 1);
    return stages[idx];
  }

  public static canInitiateStage(
    anomaly: SpaceAnomalyDescriptor,
    distance: number
  ): { canScan: boolean; reason?: string } {
    this.ensureScanStages(anomaly);
    const stage = this.getCurrentStage(anomaly);

    if (stage.stage >= 4 || anomaly.scanned) {
      return { canScan: false, reason: 'Anomaly already fully analyzed.' };
    }

    if (distance > stage.requiredMaxDistance) {
      return {
        canScan: false,
        reason: `Target too far (${Math.round(distance)}u). Must be within ${stage.requiredMaxDistance}u for ${stage.name}.`,
      };
    }

    return { canScan: true };
  }

  public static updateScan(
    anomaly: SpaceAnomalyDescriptor,
    distance: number,
    isScanningHeld: boolean,
    dt: number
  ): StagedScanUpdateResult {
    this.ensureScanStages(anomaly);

    if (anomaly.currentStage! >= 4) {
      return {
        stageAdvanced: false,
        newStage: 4,
        progress: 1.0,
      };
    }

    const currentStage = this.getCurrentStage(anomaly);

    // If outside required distance, decay scan progress slightly
    if (distance > currentStage.requiredMaxDistance || !isScanningHeld) {
      anomaly.scanProgress = Math.max(0, (anomaly.scanProgress || 0) - dt * 0.4);
      return {
        stageAdvanced: false,
        newStage: anomaly.currentStage!,
        progress: anomaly.scanProgress,
      };
    }

    // Progress scan
    const rate = currentStage.holdDurationSec > 0 ? 1 / currentStage.holdDurationSec : 2.0;
    anomaly.scanProgress = Math.min(1.0, (anomaly.scanProgress || 0) + dt * rate);

    if (anomaly.scanProgress >= 1.0) {
      // Advance to next stage!
      anomaly.currentStage!++;
      anomaly.scanProgress = 0;
      const newStage = anomaly.currentStage!;

      let fragment: ResonanceFragment | undefined = undefined;

      // When reaching stage 4 (completing stage 3), reward fragment if resonance anomaly
      if (newStage >= 4) {
        anomaly.scanned = true;
        if (anomaly.hasResonance || anomaly.signature?.isResonanceAnomaly) {
          const isAlpha = anomaly.type === 'RESONANCE_ECHO' || anomaly.type === 'resonance_monolith';
          fragment = {
            id: isAlpha ? 'fragment_alpha' : 'fragment_beta',
            name: isAlpha ? 'Fragment α: Echo of the First Builders' : 'Fragment β: Derelict Survey Core',
            frequency: anomaly.signature?.frequency || (isAlpha ? 432.8 : 528.0),
            originBeat: isAlpha ? 'beat_1_first_whisper' : 'beat_3_fragment_alpha',
            description: anomaly.signature?.analysisSummary || anomaly.description,
            dataPayload: `PAYLOAD-${anomaly.id}-${Math.floor(Date.now() / 1000)}`,
            decrypted: false,
            codexId: isAlpha ? 'codex_fragment_alpha' : 'codex_fragment_beta',
            recoveredAt: Date.now(),
          };
        }
      }

      return {
        stageAdvanced: true,
        newStage,
        progress: 0,
        fragmentUnlocked: fragment,
      };
    }

    return {
      stageAdvanced: false,
      newStage: anomaly.currentStage!,
      progress: anomaly.scanProgress,
    };
  }
}

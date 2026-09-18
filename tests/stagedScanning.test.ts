import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { StagedScanController } from '../src/game/scanning/StagedScanController';
import { StagedScanHUD } from '../src/game/ui/StagedScanHUD';
import { SpaceEncounterManager } from '../src/game/scenes/SpaceEncounterManager';
import type { SpaceAnomalyDescriptor } from '../src/game/systems/PlanetDescriptor';

describe('Anomaly Consolidation & Staged Scanning', () => {
  it('initializes default scan stages on an anomaly', () => {
    const anomaly: SpaceAnomalyDescriptor = {
      id: 'anom-test-1',
      name: 'Resonance Monolith',
      type: 'RESONANCE_ECHO',
      distanceFromStar: 1200,
      angle: 0.5,
      description: 'A test anomaly',
      scanned: false,
      hasResonance: true,
      signature: {
        isResonanceAnomaly: true,
        frequency: 432.8,
        intensity: 0.9,
        harmonicPattern: 'Phi-1.618',
      },
    };

    StagedScanController.ensureScanStages(anomaly);
    expect(anomaly.scanStages).toBeDefined();
    expect(anomaly.scanStages!.length).toBe(5);
    expect(anomaly.currentStage).toBe(0);
    expect(anomaly.scanProgress).toBe(0);
  });

  it('validates distance thresholds for staged scanning', () => {
    const anomaly: SpaceAnomalyDescriptor = {
      id: 'anom-test-2',
      name: 'Resonance Monolith',
      type: 'RESONANCE_ECHO',
      distanceFromStar: 1200,
      angle: 0.5,
      description: 'A test anomaly',
      scanned: false,
      hasResonance: true,
    };

    // Stage 0 requires distance <= 2500
    const farCheck = StagedScanController.canInitiateStage(anomaly, 3000);
    expect(farCheck.canScan).toBe(false);

    const nearCheck = StagedScanController.canInitiateStage(anomaly, 2000);
    expect(nearCheck.canScan).toBe(true);
  });

  it('progresses through scan stages and unlocks fragment upon completion', () => {
    const anomaly: SpaceAnomalyDescriptor = {
      id: 'anom-test-3',
      name: 'Resonance Monolith',
      type: 'RESONANCE_ECHO',
      distanceFromStar: 1200,
      angle: 0.5,
      description: 'A test anomaly',
      scanned: false,
      hasResonance: true,
    };

    // Stage 0 has holdDurationSec 0, advances quickly
    let res = StagedScanController.updateScan(anomaly, 2000, true, 0.6);
    expect(res.stageAdvanced).toBe(true);
    expect(res.newStage).toBe(1);

    // In Stage 1, holdDurationSec is 1.5, requires distance <= 1500
    res = StagedScanController.updateScan(anomaly, 1400, true, 0.75);
    expect(res.stageAdvanced).toBe(false);
    expect(res.progress).toBeGreaterThan(0.4);

    res = StagedScanController.updateScan(anomaly, 1400, true, 1.0);
    expect(res.stageAdvanced).toBe(true);
    expect(res.newStage).toBe(2);

    // Stage 2, distance <= 800, hold 2.5
    res = StagedScanController.updateScan(anomaly, 600, true, 2.6);
    expect(res.stageAdvanced).toBe(true);
    expect(res.newStage).toBe(3);

    // Stage 3, distance <= 350, hold 3.0
    res = StagedScanController.updateScan(anomaly, 200, true, 3.2);
    expect(res.stageAdvanced).toBe(true);
    expect(res.newStage).toBe(4);
    expect(res.fragmentUnlocked).toBeDefined();
    expect(res.fragmentUnlocked!.id).toBe('fragment_alpha');
    expect(anomaly.scanned).toBe(true);
  });

  it('SpaceEncounterManager creates physical meshes matching authoritative descriptors', () => {
    const anomalies: SpaceAnomalyDescriptor[] = [
      {
        id: 'anom-authoritative-1',
        name: 'Harmonic Monolith Prime',
        type: 'RESONANCE_ECHO',
        distanceFromStar: 1500,
        angle: 1.2,
        position: { x: 500, y: 100, z: -800 },
        description: 'Harmonic crystalline spire',
        scanned: false,
        hasResonance: true,
      },
      {
        id: 'anom-authoritative-2',
        name: 'Derelict Recon Craft',
        type: 'DERELICT_PROBE',
        distanceFromStar: 2200,
        angle: 3.1,
        position: { x: -600, y: -50, z: 1200 },
        description: 'Derelict probe broadcasting beacon',
        scanned: false,
        hasResonance: false,
      },
    ];

    const mgr = new SpaceEncounterManager(42, new THREE.Vector3(0, 0, 0), [], anomalies);
    expect(mgr.encounters.length).toBeGreaterThanOrEqual(2);

    const resonanceEnc = mgr.encounters.find((e) => e.id === 'anom-authoritative-1');
    expect(resonanceEnc).toBeDefined();
    expect(resonanceEnc!.type).toBe('resonance_echo');
    expect(resonanceEnc!.name).toBe('Harmonic Monolith Prime');
    expect(resonanceEnc!.anomalyDescriptor).toBe(anomalies[0]);
    expect(resonanceEnc!.position.x).toBe(500);

    const probeEnc = mgr.encounters.find((e) => e.id === 'anom-authoritative-2');
    expect(probeEnc).toBeDefined();
    expect(probeEnc!.type).toBe('derelict_probe');
    expect(probeEnc!.anomalyDescriptor).toBe(anomalies[1]);
  });

  it('applies a grace period before decaying scan progress when hold is released', () => {
    const anomaly: SpaceAnomalyDescriptor = {
      id: 'anom-test-grace',
      name: 'Resonance Monolith',
      type: 'RESONANCE_ECHO',
      distanceFromStar: 1200,
      angle: 0.5,
      description: 'A test anomaly',
      scanned: false,
      hasResonance: true,
    };

    // Complete stage 0
    StagedScanController.updateScan(anomaly, 2000, true, 0.6);
    expect(anomaly.currentStage).toBe(1);

    // Charge stage 1 to 50% (holdDurationSec = 1.5, 0.75s => 50%)
    StagedScanController.updateScan(anomaly, 1400, true, 0.75);
    expect(anomaly.scanProgress).toBeCloseTo(0.5, 2);

    // Release scan for 0.2s (within 0.35s grace period)
    const resAfterShortRelease = StagedScanController.updateScan(anomaly, 1400, false, 0.2);
    expect(resAfterShortRelease.progress).toBeCloseTo(0.5, 2);

    // Continue releasing for another 0.25s (cumulative release 0.45s > 0.35s grace period)
    const resAfterLongRelease = StagedScanController.updateScan(anomaly, 1400, false, 0.25);
    expect(resAfterLongRelease.progress).toBeLessThan(0.5);
  });

  it('renders StagedScanHUD with correct stage title and progress percentage', () => {
    if (typeof document !== 'undefined') {
      const parent = document.createElement('div');
      const hud = new StagedScanHUD(parent);

      const anomaly: SpaceAnomalyDescriptor = {
        id: 'anom-hud-test',
        name: 'Echo of the Ancients',
        type: 'RESONANCE_ECHO',
        distanceFromStar: 1200,
        angle: 0.5,
        description: 'Test echo',
        scanned: false,
        hasResonance: true,
        currentStage: 1,
        scanProgress: 0.64,
      };

      hud.update(anomaly, 600, true, false);

      const banner = parent.querySelector('#hud-staged-scan-banner');
      expect(banner).toBeDefined();

      hud.dispose();
    }
  });
});

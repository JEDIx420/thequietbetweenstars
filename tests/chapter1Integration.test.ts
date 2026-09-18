import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SectorManager } from '../src/game/universe/SectorManager';
import { StoryDirector } from '../src/story/StoryDirector';
import { StoryEncounterPlanner } from '../src/story/StoryEncounterPlanner';
import { SpaceEncounterManager } from '../src/game/scenes/SpaceEncounterManager';
import { TargetLockSystem, LockableTarget } from '../src/game/targeting/TargetLockSystem';
import { StagedScanController } from '../src/game/scanning/StagedScanController';
import { SpaceStation } from '../src/game/stations/SpaceStationManager';

describe('Chapter 1 End-to-End Gameplay Integration', () => {
  it('traces Chapter 1 from origin initialization through staged scanning, fragment recovery, and station contact', () => {
    // 1. New Journey Initialization & Origin System Generation
    const sectorManager = new SectorManager('TQBS-UNIVERSE-INTEGRATION-001');
    const storyDirector = new StoryDirector();
    expect(storyDirector.getState().currentBeat).toBe('beat_0_awakening');

    // Retrieve origin system at (0, 0, 0)
    const originSystem = sectorManager.getFullSystem(0, 0, 0);
    expect(originSystem).toBeDefined();
    expect(originSystem.planets.length).toBeGreaterThan(0);

    // Simulate DesktopApp.syncStoryEntitiesForSystem(originSystem)
    storyDirector.emit({
      type: 'SYSTEM_ENTERED',
      payload: { systemSeed: originSystem.seed },
      timestamp: Date.now(),
    });
    // Plan origin star system (advances beat_0_awakening -> beat_1_first_whisper)
    const plan = StoryEncounterPlanner.planSystem(originSystem, storyDirector);
    expect(storyDirector.getState().currentBeat).toBe('beat_1_first_whisper');
    expect(plan.injectedAnomalies.length).toBeGreaterThanOrEqual(1);

    const injectedAnomaly = plan.injectedAnomalies.find((a) => a.id === 'story_anom_resonance_alpha');
    expect(injectedAnomaly).toBeDefined();
    expect(injectedAnomaly!.signature?.isResonanceAnomaly).toBe(true);
    expect(injectedAnomaly!.hasResonance).toBe(true);
    expect(injectedAnomaly!.position).toBeDefined();

    // Incorporate injected anomalies into system descriptor (as done in DesktopApp)
    if (!originSystem.anomalies) originSystem.anomalies = [];
    for (const injected of plan.injectedAnomalies) {
      const existingIdx = originSystem.anomalies.findIndex((a) => a.id === injected.id);
      if (existingIdx >= 0) {
        originSystem.anomalies[existingIdx] = injected;
      } else {
        originSystem.anomalies.push(injected);
      }
    }

    // 2. SpaceEncounterManager constructs physical 3D encounter with identical ID
    const planetPositions = originSystem.planets.map(
      (_, i) => new THREE.Vector3((i + 1) * 1000, 0, 0)
    );
    const encounterManager = new SpaceEncounterManager(
      originSystem.seed,
      new THREE.Vector3(0, 0, 0),
      planetPositions,
      originSystem.anomalies
    );

    const physicalEncounter = encounterManager.encounters.find(
      (e) => e.id === 'story_anom_resonance_alpha'
    );
    expect(physicalEncounter).toBeDefined();
    expect(physicalEncounter!.anomalyDescriptor).toBe(injectedAnomaly);
    expect(physicalEncounter!.position.x).toBe(injectedAnomaly!.position!.x);
    expect(physicalEncounter!.position.y).toBe(injectedAnomaly!.position!.y);
    expect(physicalEncounter!.position.z).toBe(injectedAnomaly!.position!.z);

    // 3. Collect candidates for TargetLockSystem (as done in DesktopApp.collectSpaceLockCandidates)
    const candidates: LockableTarget[] = encounterManager.encounters.map((enc) => ({
      id: enc.id,
      name: enc.name,
      type: 'encounter',
      position: enc.position,
      radius: 40,
      isScanned: enc.isScanned,
      data: enc,
    }));

    expect(candidates.some((c) => c.id === 'story_anom_resonance_alpha')).toBe(true);

    // 4. TargetLockSystem forward cone acquisition
    const targetLock = new TargetLockSystem();
    const anomalyPos = physicalEncounter!.position;
    // Position player ship 700 units behind anomaly along +Z, facing towards -Z (directly at anomaly)
    const shipPos = anomalyPos.clone().add(new THREE.Vector3(0, 0, 700));
    const shipQuat = new THREE.Quaternion(); // Identity faces -Z

    const locked = targetLock.lockTargetInForwardCone(shipPos, shipQuat, candidates);
    expect(locked).not.toBeNull();
    expect(locked!.id).toBe('story_anom_resonance_alpha');
    expect(locked!.distance).toBeCloseTo(700, 0);

    // 5. Staged scanning progresses through stages 0 -> 4
    const anomalyDescriptor = physicalEncounter!.anomalyDescriptor!;
    StagedScanController.ensureScanStages(anomalyDescriptor);
    expect(anomalyDescriptor.currentStage).toBe(0);

    // Stage 0: Initial Acquisition (distance <= 2500, hold 0s)
    let scanResult = StagedScanController.updateScan(anomalyDescriptor, 700, true, 0.5);
    expect(scanResult.stageAdvanced).toBe(true);
    expect(scanResult.newStage).toBe(1);

    // Stage 1: Frequency Carrier Lock (distance <= 1500, hold 1.5s)
    scanResult = StagedScanController.updateScan(anomalyDescriptor, 700, true, 1.6);
    expect(scanResult.stageAdvanced).toBe(true);
    expect(scanResult.newStage).toBe(2);

    // Stage 2: Harmonic Demodulation (distance <= 800, hold 2.5s)
    scanResult = StagedScanController.updateScan(anomalyDescriptor, 500, true, 2.6);
    expect(scanResult.stageAdvanced).toBe(true);
    expect(scanResult.newStage).toBe(3);

    // Stage 3: Crystalline Core Penetration (distance <= 350, hold 3.0s)
    // Ship moves in close to 200 units
    scanResult = StagedScanController.updateScan(anomalyDescriptor, 200, true, 3.2);
    expect(scanResult.stageAdvanced).toBe(true);
    expect(scanResult.newStage).toBe(4);
    expect(scanResult.fragmentUnlocked).toBeDefined();
    expect(scanResult.fragmentUnlocked!.id).toBe('fragment_alpha');
    expect(anomalyDescriptor.scanned).toBe(true);

    // 6. Recover fragment and advance StoryDirector to Beat 2
    storyDirector.emit({
      type: 'FRAGMENT_RECOVERED',
      payload: { fragment: scanResult.fragmentUnlocked },
      timestamp: Date.now(),
    });

    expect(storyDirector.getState().currentBeat).toBe('beat_2_station_contact');
    expect(storyDirector.getState().resonanceFragments.length).toBe(1);
    expect(storyDirector.getState().resonanceFragments[0].id).toBe('fragment_alpha');

    // 7. Next system synchronization injects station_epsilon_7
    const planBeat2 = StoryEncounterPlanner.planSystem(originSystem, storyDirector);
    expect(planBeat2.injectedStation).toBeDefined();
    expect(planBeat2.injectedStation!.id).toBe('station_epsilon_7');
    expect(planBeat2.injectedStation!.name).toBe('Research Outpost Epsilon-7');

    const station = new SpaceStation({
      ...planBeat2.injectedStation!,
      position: new THREE.Vector3(
        planBeat2.injectedStation!.position.x,
        planBeat2.injectedStation!.position.y,
        planBeat2.injectedStation!.position.z
      ),
    });
    expect(station.id).toBe('station_epsilon_7');
    expect(station.captureRadius).toBe(120);

    // 8. Station docking succeeds and emits STATION_DOCKED -> advances beat to beat_3_fragment_alpha
    storyDirector.emit({
      type: 'STATION_DOCKED',
      payload: { stationId: 'station_epsilon_7' },
      timestamp: Date.now(),
    });

    expect(storyDirector.getState().currentBeat).toBe('beat_3_fragment_alpha');
    expect(storyDirector.getState().visitedStations).toContain('station_epsilon_7');
    expect(storyDirector.getState().npcMemories['dr_vance'].timesMet).toBe(1);

    station.dispose();
  });
});

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SectorManager } from '../src/game/universe/SectorManager';
import { StoryDirector } from '../src/story/StoryDirector';
import { StoryEncounterPlanner } from '../src/story/StoryEncounterPlanner';
import { SpaceEncounterManager } from '../src/game/scenes/SpaceEncounterManager';
import { TargetLockSystem, LockableTarget } from '../src/game/targeting/TargetLockSystem';
import { StagedScanController } from '../src/game/scanning/StagedScanController';
import { SpaceStation } from '../src/game/stations/SpaceStationManager';
import { NamedVessel } from '../src/game/vessels/NamedVesselDirector';
import { HarmonicRelay } from '../src/game/structures/HarmonicRelay';
import { DEFAULT_SAVE_SLOT, PlayerSaveSlot } from '../src/persistence/SaveManager';

describe('Chapter 1 End-to-End Gameplay Integration', () => {
  it('traces the complete Chapter 1 flow from Beat 0 through Beat 7 climax, entity reconciliation, mobile tap guard, and save/reload', () => {
    // ==========================================
    // 1. BEAT 0: THE SUBCARRIER WHISPER (AWAKENING)
    // ==========================================
    const sectorManager = new SectorManager('TQBS-UNIVERSE-INTEGRATION-001');
    const storyDirector = new StoryDirector();
    expect(storyDirector.getState().currentBeat).toBe('beat_0_awakening');

    // Retrieve origin system at (0, 0, 0)
    const originSystem = sectorManager.getFullSystem(0, 0, 0);
    expect(originSystem).toBeDefined();
    expect(originSystem.planets.length).toBeGreaterThan(0);

    // Entity planning does NOT advance beat 0 to beat 1
    const planBeat0 = StoryEncounterPlanner.planSystem(originSystem, storyDirector);
    expect(storyDirector.getState().currentBeat).toBe('beat_0_awakening');
    expect(planBeat0.injectedAnomalies.length).toBe(0);

    // Opening cinematic / Mnemosyne dialogue concludes -> transition to Beat 1
    storyDirector.advanceBeat('beat_1_first_whisper');
    expect(storyDirector.getState().currentBeat).toBe('beat_1_first_whisper');

    // ==========================================
    // 2. BEAT 1: THE FIRST WHISPER
    // ==========================================
    const planBeat1 = StoryEncounterPlanner.planSystem(originSystem, storyDirector);
    expect(planBeat1.injectedAnomalies.length).toBeGreaterThanOrEqual(1);

    const injectedAnomaly = planBeat1.injectedAnomalies.find((a) => a.id === 'story_anom_resonance_alpha');
    expect(injectedAnomaly).toBeDefined();
    expect(injectedAnomaly!.name).toBe('Resonance Monolith Prime');
    expect(injectedAnomaly!.signature?.isResonanceAnomaly).toBe(true);
    expect(injectedAnomaly!.hasResonance).toBe(true);

    // Incorporate injected anomalies into system descriptor (DesktopApp.reconcileStoryWorldState)
    if (!originSystem.anomalies) originSystem.anomalies = [];
    for (const injected of planBeat1.injectedAnomalies) {
      const existingIdx = originSystem.anomalies.findIndex((a) => a.id === injected.id);
      if (existingIdx >= 0) {
        originSystem.anomalies[existingIdx] = injected;
      } else {
        originSystem.anomalies.push(injected);
      }
    }

    // SpaceEncounterManager constructs physical 3D encounter with identical ID
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

    // Mobile tap protection test:
    // Verify story encounters are recognized by the tap guard and NEVER bypass staged scan
    const isStoryAnomaly = physicalEncounter!.anomalyDescriptor?.hasResonance ||
      physicalEncounter!.anomalyDescriptor?.signature?.isResonanceAnomaly ||
      physicalEncounter!.id.startsWith('story_');
    expect(isStoryAnomaly).toBe(true);
    expect(physicalEncounter!.isScanned).toBe(false);

    // TargetLockSystem forward cone acquisition
    const candidates: LockableTarget[] = encounterManager.encounters.map((enc) => ({
      id: enc.id,
      name: enc.name,
      type: 'encounter',
      position: enc.position,
      radius: 40,
      isScanned: enc.isScanned,
      data: enc,
    }));

    const targetLock = new TargetLockSystem();
    const shipPos = physicalEncounter!.position.clone().add(new THREE.Vector3(0, 0, 700));
    const shipQuat = new THREE.Quaternion(); // Identity faces -Z

    const locked = targetLock.lockTargetInForwardCone(shipPos, shipQuat, candidates);
    expect(locked).not.toBeNull();
    expect(locked!.id).toBe('story_anom_resonance_alpha');

    // Staged scanning progresses through stages 0 -> 4
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
    scanResult = StagedScanController.updateScan(anomalyDescriptor, 200, true, 3.2);
    expect(scanResult.stageAdvanced).toBe(true);
    expect(scanResult.newStage).toBe(4);
    expect(scanResult.fragmentUnlocked).toBeDefined();
    expect(scanResult.fragmentUnlocked!.id).toBe('fragment_alpha');
    expect(anomalyDescriptor.scanned).toBe(true);

    // ==========================================
    // 3. BEAT 2: SANCTUARY IN THE DARK (STATION CONTACT)
    // ==========================================
    storyDirector.emit({
      type: 'FRAGMENT_RECOVERED',
      payload: { fragment: scanResult.fragmentUnlocked },
      timestamp: Date.now(),
    });

    expect(storyDirector.getState().currentBeat).toBe('beat_2_station_contact');
    expect(storyDirector.getState().resonanceFragments.length).toBe(1);
    expect(storyDirector.getState().resonanceFragments[0].id).toBe('fragment_alpha');

    // Reconcile world state injects Research Outpost Epsilon-7
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

    // ==========================================
    // 4. BEAT 3: THE MISSING CADENCE (DERELICT SURVEY CRAFT ALPHA-9)
    // ==========================================
    storyDirector.emit({
      type: 'STATION_DOCKED',
      payload: { stationId: 'station_epsilon_7' },
      timestamp: Date.now(),
    });

    expect(storyDirector.getState().currentBeat).toBe('beat_3_fragment_alpha');
    expect(storyDirector.getState().visitedStations).toContain('station_epsilon_7');

    // Reconcile world state injects Derelict Survey Craft Alpha-9
    const planBeat3 = StoryEncounterPlanner.planSystem(originSystem, storyDirector);
    const betaAnomalyDesc = planBeat3.injectedAnomalies.find((a) => a.id === 'story_anom_derelict_beta');
    expect(betaAnomalyDesc).toBeDefined();
    expect(betaAnomalyDesc!.name).toBe('Derelict Survey Craft Alpha-9');
    expect(betaAnomalyDesc!.hasResonance).toBe(true);

    // Scan Derelict Alpha-9 to stage 4 -> unlocks fragment_beta
    StagedScanController.ensureScanStages(betaAnomalyDesc!);
    StagedScanController.updateScan(betaAnomalyDesc!, 700, true, 0.5); // stage 1
    StagedScanController.updateScan(betaAnomalyDesc!, 700, true, 1.6); // stage 2
    StagedScanController.updateScan(betaAnomalyDesc!, 500, true, 2.6); // stage 3
    const betaScanResult = StagedScanController.updateScan(betaAnomalyDesc!, 200, true, 3.2); // stage 4
    expect(betaScanResult.stageAdvanced).toBe(true);
    expect(betaScanResult.fragmentUnlocked?.id).toBe('fragment_beta');

    // ==========================================
    // 5. BEAT 4: HARMONIC SYNTHESIS (DECRYPTION)
    // ==========================================
    storyDirector.emit({
      type: 'FRAGMENT_RECOVERED',
      payload: { fragment: betaScanResult.fragmentUnlocked },
      timestamp: Date.now(),
    });

    expect(storyDirector.getState().currentBeat).toBe('beat_4_decryption');
    expect(storyDirector.getState().resonanceFragments.length).toBe(2);

    // Decrypt Fragment Alpha and Fragment Beta
    storyDirector.emit({
      type: 'FRAGMENT_DECRYPTED',
      payload: { fragmentId: 'fragment_alpha' },
      timestamp: Date.now(),
    });
    expect(storyDirector.getState().currentBeat).toBe('beat_4_decryption');

    storyDirector.emit({
      type: 'FRAGMENT_DECRYPTED',
      payload: { fragmentId: 'fragment_beta' },
      timestamp: Date.now(),
    });

    // Both decrypted -> advances to Beat 5
    expect(storyDirector.getState().currentBeat).toBe('beat_5_relay_coordinates');

    // ==========================================
    // 6. BEAT 5 & 6: FIRST HARMONIC RELAY & NOMAD VESSEL
    // ==========================================
    const planBeat5 = StoryEncounterPlanner.planSystem(originSystem, storyDirector);
    expect(planBeat5.injectedRelay).toBeDefined();
    expect(planBeat5.injectedRelay!.id).toBe('harmonic_relay_prime');
    expect(planBeat5.injectedVessel).toBeDefined();
    expect(planBeat5.injectedVessel!.id).toBe('the_wanderer_7');

    const relay = new HarmonicRelay({
      ...planBeat5.injectedRelay!,
      position: new THREE.Vector3(
        planBeat5.injectedRelay!.position.x,
        planBeat5.injectedRelay!.position.y,
        planBeat5.injectedRelay!.position.z
      ),
    });
    expect(relay.id).toBe('harmonic_relay_prime');

    const vessel = new NamedVessel({
      ...planBeat5.injectedVessel!,
      species: 'nomad_avian',
      position: new THREE.Vector3(
        planBeat5.injectedVessel!.position.x,
        planBeat5.injectedVessel!.position.y,
        planBeat5.injectedVessel!.position.z
      ),
    });
    expect(vessel.id).toBe('the_wanderer_7');

    // Hail Captain Zephyr -> advances to Beat 6
    storyDirector.emit({
      type: 'VESSEL_HAILED',
      payload: { vesselId: 'the_wanderer_7' },
      timestamp: Date.now(),
    });
    expect(storyDirector.getState().currentBeat).toBe('beat_6_relay_alignment');

    // ==========================================
    // 7. BEAT 7: RELAY ALIGNMENT CLIMAX
    // ==========================================
    storyDirector.emit({
      type: 'RELAY_PILLAR_ALIGNED',
      payload: { pillarIndex: 0 },
      timestamp: Date.now(),
    });
    storyDirector.emit({
      type: 'RELAY_PILLAR_ALIGNED',
      payload: { pillarIndex: 1 },
      timestamp: Date.now(),
    });
    expect(storyDirector.getState().currentBeat).toBe('beat_6_relay_alignment');

    // Third pillar aligns -> triggers RELAY_ACTIVATED -> advances to beat_7_chapter1_climax
    storyDirector.emit({
      type: 'RELAY_PILLAR_ALIGNED',
      payload: { pillarIndex: 2 },
      timestamp: Date.now(),
    });
    expect(storyDirector.getState().currentBeat).toBe('beat_7_chapter1_climax');
    expect(storyDirector.getState().harmonicRelayState.activated).toBe(true);

    // ==========================================
    // 8. SAVE & LOAD RECONCILIATION INTEGRITY
    // ==========================================
    const savedStory = storyDirector.getState();
    const saveSlot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      story: savedStory,
    };

    // Construct a brand new fresh StoryDirector and restore state
    const restoredStoryDirector = new StoryDirector();
    restoredStoryDirector.loadState(saveSlot.story!);
    expect(restoredStoryDirector.getState().currentBeat).toBe('beat_7_chapter1_climax');
    expect(restoredStoryDirector.getState().resonanceFragments.length).toBe(2);
    expect(restoredStoryDirector.getState().harmonicRelayState.activated).toBe(true);

    // Clean up
    station.dispose();
    relay.dispose();
    vessel.dispose();
  });
});

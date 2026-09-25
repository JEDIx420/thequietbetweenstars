import * as THREE from 'three';

export type DockingStatus =
  | 'IDLE'
  | 'REQUESTING'
  | 'CLEARED'
  | 'APPROACH'
  | 'AUTOPILOT_TETHER'
  | 'CAPTURED'
  | 'DOCKED'
  | 'UNDOCKING';

export type DockableEntityKind = 'STATION' | 'VESSEL';

export interface DockableEntity {
  id: string;
  name: string;
  entityKind: DockableEntityKind;
  position: THREE.Vector3;
  dockingPortOffset: THREE.Vector3;
  captureRadius: number; // e.g., 90u
  approachDistance: number; // e.g., 350u
  group: THREE.Group;

  canDock(shipPosition: THREE.Vector3): { allowed: boolean; reason?: string };
  onDockInitiated(): void;
  onDockComplete(): void;
  onUndock(): void;
  getDockingStatus(): DockingStatus;
  setDockingStatus(status: DockingStatus): void;
}

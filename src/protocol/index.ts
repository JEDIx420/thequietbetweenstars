/**
 * THE QUIET BETWEEN STARS - Shared WebRTC Protocol
 * Version 1
 */

export const PROTOCOL_VERSION = 1;

export type ClientRole = 'desktop' | 'companion';

export type GameContext = 'space-flight' | 'planet-exploration' | 'dialogue' | 'menu';

export type ControllerLayout = 'flight-v1' | 'dialogue-v1' | 'standard';

export type GameAction =
  | 'scan'
  | 'map'
  | 'autopilot'
  | 'interact'
  | 'pause'
  | 'confirm'
  | 'cancel'
  | 'journal'
  | 'cycle_target'
  | 'help'
  | 'supply'
  | 'talk'
  | 'altitude_up'
  | 'altitude_down';

export type ActionState = 'down' | 'up' | 'trigger';

export interface ControllerCapabilities {
  haptics?: boolean;
  screenSize?: { width: number; height: number };
  touchPoints?: number;
  gyro?: boolean;
}

export interface HandshakeMessage {
  type: 'handshake';
  version: number;
  role: ClientRole;
  clientId: string;
  timestamp: number;
  capabilities?: ControllerCapabilities;
}

export interface HandshakeAckMessage {
  type: 'handshake_ack';
  version: number;
  accepted: boolean;
  serverTime: number;
  sessionContext: GameContext;
}

export interface NormalizedAxes {
  x: number; // -1.0 (left) to 1.0 (right)
  y: number; // -1.0 (down/pitch-down) to 1.0 (up/pitch-up)
}

export interface RealtimeInputMessage {
  type: 'realtime_input';
  seq: number;
  timestamp: number;
  axes: NormalizedAxes;
  look: NormalizedAxes;
  throttle: number; // 0.0 to 1.0 (or -1.0 to 1.0 for reverse)
}

export interface ActionMessage {
  type: 'action';
  seq: number;
  action: GameAction;
  state: ActionState;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export interface GameContextMessage {
  type: 'context_change';
  context: GameContext;
  layout: ControllerLayout;
  timestamp: number;
}

export interface PingMessage {
  type: 'ping';
  timestamp: number;
}

export interface PongMessage {
  type: 'pong';
  pingTimestamp: number;
  timestamp: number;
}

export interface DialogueLineMessage {
  type: 'dialogue_line';
  speaker: string;
  text: string;
  durationMs?: number;
  timestamp: number;
}

export interface TutorialHintMessage {
  type: 'tutorial_hint';
  action: string;
  prompt: string;
  timestamp: number;
}

export interface SetCourseActionMessage {
  type: 'set_course';
  systemId: string;
  timestamp: number;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface DisconnectMessage {
  type: 'disconnect';
  reason: string;
}

export type ProtocolMessage =
  | HandshakeMessage
  | HandshakeAckMessage
  | RealtimeInputMessage
  | ActionMessage
  | GameContextMessage
  | DialogueLineMessage
  | TutorialHintMessage
  | SetCourseActionMessage
  | PingMessage
  | PongMessage
  | ErrorMessage
  | DisconnectMessage;

/**
 * Validates and parses raw text into a ProtocolMessage
 */
export function deserializeMessage(raw: string | ArrayBuffer): ProtocolMessage | null {
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') {
      return null;
    }
    return obj as ProtocolMessage;
  } catch {
    return null;
  }
}

/**
 * Serializes a ProtocolMessage into JSON string
 */
export function serializeMessage(msg: ProtocolMessage): string {
  return JSON.stringify(msg);
}

/**
 * Clamps a number between min and max
 */
export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return 0;
  return Math.max(min, Math.min(max, val));
}

/**
 * Applies deadzone to an axis value (-1 to 1)
 */
export function applyDeadzone(value: number, deadzone = 0.08): number {
  const abs = Math.abs(value);
  if (abs <= deadzone) return 0;
  const scaled = (abs - deadzone) / (1 - deadzone);
  return Math.sign(value) * clamp(scaled, 0, 1);
}

/**
 * Normalizes and clamps axes with deadzone
 */
export function sanitizeAxes(axes: Partial<NormalizedAxes>, deadzone = 0.08): NormalizedAxes {
  return {
    x: applyDeadzone(clamp(axes.x ?? 0, -1, 1), deadzone),
    y: applyDeadzone(clamp(axes.y ?? 0, -1, 1), deadzone),
  };
}

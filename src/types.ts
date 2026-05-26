export type GameMode = 'speed' | 'item';
export type RoomStatus = 'lobby' | 'countdown' | 'racing' | 'finished';

export interface PlayerState {
  id: string;
  name: string;
  color: string; // Hex color code (e.g., #ff007f for pink, #22d3ee for cyan)
  isHost: boolean;
  isReady: boolean;
  isAI: boolean;
  // Position / physics attributes synced at high rate
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
  speed: number;
  isDrifting: boolean;
  driftAngle: number;
  boosterActive: boolean;
  shieldActive: boolean;
  currentLap: number;
  progress: number; // progress on track spline (0 to 1)
  spinTimer: number; // visual spin penalty
  finished: boolean;
  finalTime?: string;
}

export interface BananaObstacle {
  id: string;
  posX: number;
  posY: number;
  posZ: number;
}

export interface ItemBoxState {
  id: number;
  active: boolean;
  respawnTime?: number;
}

export interface GameRoom {
  code: string;
  mode: GameMode;
  status: RoomStatus;
  players: PlayerState[];
  bananas: BananaObstacle[];
  itemBoxes: ItemBoxState[];
  raceStartTime?: number;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: string;
}

// WebSocket Message Schemas
export type ClientMessageType =
  | 'join_room'
  | 'leave_room'
  | 'set_ready'
  | 'set_mode'
  | 'add_ai'
  | 'remove_ai'
  | 'start_game'
  | 'send_chat'
  | 'sync_physics'
  | 'collect_item_box'
  | 'drop_banana'
  | 'hit_banana'
  | 'shoot_missile'
  | 'cross_lap_finish';

export interface ClientMessage {
  type: ClientMessageType;
  roomId?: string;
  payload?: any;
}

export type ServerMessageType =
  | 'room_updated'
  | 'chat_received'
  | 'game_started'
  | 'physics_broadcast'
  | 'item_box_collected'
  | 'item_box_respawned'
  | 'banana_dropped'
  | 'banana_removed'
  | 'missile_fired'
  | 'player_finished'
  | 'error_occurred';

export interface ServerMessage {
  type: ServerMessageType;
  payload?: any;
}

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GameRoom, PlayerState, ClientMessage, ServerMessage, BananaObstacle } from './src/types';

// Load environment variables
dotenv.config();

const PORT = 3000;
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Attach upgraded WebSocket handler to HTTP server on path '/ws'
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Storage for Game Rooms
const rooms = new Map<string, GameRoom>();

// Map to track which Room and Player ID are associated with each WebSocket connection
const clientMetadata = new Map<WebSocket, { roomId: string; playerId: string }>();

// Helper tool to generate random room codes
function generateRoomCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Broadcasts a message to all players connected in a specific room
function broadcastToRoom(roomId: string, message: ServerMessage, excludeSenderId?: string) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const metadata = clientMetadata.get(client);
      if (metadata && metadata.roomId === roomId) {
        if (excludeSenderId && metadata.playerId === excludeSenderId) {
          return;
        }
        client.send(JSON.stringify(message));
      }
    }
  });
}

// Send localized message directly to a single socket
function sendToSocket(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Clean up player upon disconnect or leave
function handlePlayerExiting(ws: WebSocket) {
  const metadata = clientMetadata.get(ws);
  if (!metadata) return;

  const { roomId, playerId } = metadata;
  const room = rooms.get(roomId);
  if (room) {
    // Filter out departing player
    room.players = room.players.filter((p) => p.id !== playerId);

    // If room is empty, dismantle it
    if (room.players.length === 0 || room.players.every(p => p.isAI)) {
      rooms.delete(roomId);
      console.log(`[Lobby] Room ${roomId} dismantled as all human players left.`);
    } else {
      // If Host disconnected, reassign host privileges to another human client
      const hostPresent = room.players.some((p) => p.isHost && !p.isAI);
      if (!hostPresent) {
        const nextHuman = room.players.find((p) => !p.isAI);
        if (nextHuman) {
          nextHuman.isHost = true;
          nextHuman.isReady = true;
        }
      }
      broadcastToRoom(roomId, { type: 'room_updated', payload: room });
    }
  }

  clientMetadata.delete(ws);
}

// WebSocket client message routing
wss.on('connection', (ws) => {
  console.log('[Socket] Client connected successfully');

  ws.on('message', (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      const { type, roomId, payload } = message;

      switch (type) {
        case 'join_room': {
          let targetRoomId = roomId ? roomId.trim().toUpperCase() : '';
          let room: GameRoom | undefined;

          // Find or create room
          if (targetRoomId) {
            room = rooms.get(targetRoomId);
            if (!room) {
              // Create with requested code
              room = {
                code: targetRoomId,
                mode: 'speed',
                status: 'lobby',
                players: [],
                bananas: [],
                itemBoxes: Array.from({ length: 12 }, (_, i) => ({ id: i, active: true })),
              };
              rooms.set(targetRoomId, room);
            }
          } else {
            // Find an open quick-join room, or create one
            const openRoom = Array.from(rooms.values()).find(
              (r) => r.status === 'lobby' && r.players.filter(p => !p.isAI).length < 6
            );
            if (openRoom) {
              room = openRoom;
              targetRoomId = openRoom.code;
            } else {
              targetRoomId = generateRoomCode();
              room = {
                code: targetRoomId,
                mode: 'speed',
                status: 'lobby',
                players: [],
                bananas: [],
                itemBoxes: Array.from({ length: 12 }, (_, i) => ({ id: i, active: true })),
              };
              rooms.set(targetRoomId, room);
            }
          }

          if (!room) return;

          // Reject if in-game
          if (room.status !== 'lobby' && room.status !== 'finished') {
            sendToSocket(ws, {
              type: 'error_occurred',
              payload: '해당 방은 이미 게임이 진행 중입니다.',
            });
            return;
          }

          const nicknameInput = payload?.name || `Racer #${Math.floor(100+Math.random()*900)}`;
          const chosenColor = payload?.color || '#ff007f';
          const newPlayerId = `p_${Math.floor(Date.now() + Math.random() * 1000)}`;

          const isFirstPlayer = room.players.filter(p => !p.isAI).length === 0;

          const newPlayer: PlayerState = {
            id: newPlayerId,
            name: nicknameInput,
            color: chosenColor,
            isHost: isFirstPlayer,
            isReady: isFirstPlayer, // Host is always ready
            isAI: false,
            posX: 0,
            posY: 0,
            posZ: 0,
            rotY: 0,
            speed: 0,
            isDrifting: false,
            driftAngle: 0,
            boosterActive: false,
            shieldActive: false,
            currentLap: 1,
            progress: 0,
            spinTimer: 0,
            finished: false,
          };

          room.players.push(newPlayer);
          clientMetadata.set(ws, { roomId: targetRoomId, playerId: newPlayerId });

          // Send back welcome package containing room status and assigned player ID
          sendToSocket(ws, {
            type: 'room_updated',
            payload: { room, selfPlayerId: newPlayerId },
          });

          // Broadcast update to others in room
          broadcastToRoom(targetRoomId, { type: 'room_updated', payload: room }, newPlayerId);

          // Add join message to chat
          const systemMsg = {
            id: `sys_${Date.now()}`,
            senderName: `[시스템]`,
            senderColor: '#cbd5e1',
            text: `🏁 ${nicknameInput}님이 방에 입장하셨습니다!`,
            timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          };
          broadcastToRoom(targetRoomId, { type: 'chat_received', payload: systemMsg });
          break;
        }

        case 'leave_room': {
          handlePlayerExiting(ws);
          break;
        }

        case 'set_ready': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player && !player.isHost) {
            player.isReady = payload.isReady;
            broadcastToRoom(meta.roomId, { type: 'room_updated', payload: room });
          }
          break;
        }

        case 'set_mode': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player && player.isHost) {
            room.mode = payload.mode;
            broadcastToRoom(meta.roomId, { type: 'room_updated', payload: room });

            // Notification
            const modeText = payload.mode === 'speed' ? '스피드 매치' : '아이템 대전';
            const systemMsg = {
              id: `sys_${Date.now()}`,
              senderName: `[시스템]`,
              senderColor: '#cbd5e1',
              text: `🛠️ 방장이 게임 모드를 [${modeText}]로 변경했습니다.`,
              timestamp: new Date().toLocaleTimeString(),
            };
            broadcastToRoom(meta.roomId, { type: 'chat_received', payload: systemMsg });
          }
          break;
        }

        case 'add_ai': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player && player.isHost) {
            const aiCount = room.players.filter((p) => p.isAI).length;
            if (room.players.length >= 6) {
              sendToSocket(ws, { type: 'error_occurred', payload: '방 정원이 초과되어 AI를 추가할 수 없습니다.' });
              return;
            }

            const aiNames = ['인공지능 다오', '인공지능 배찌', '인공지능 디지니', '인공지능 우니', '인공지능 케피', '인공지능 모스'];
            const aiColors = ['#fdba74', '#86efac', '#c084fc', '#93c5fd', '#f472b6', '#a7f3d0'];

            const aiId = `ai_${Date.now()}_${Math.floor(Math.random()*100)}`;
            const aiPlayer: PlayerState = {
              id: aiId,
              name: aiNames[aiCount % aiNames.length] + ` (AI)`,
              color: aiColors[aiCount % aiColors.length],
              isHost: false,
              isReady: true,
              isAI: true,
              posX: 0,
              posY: 0,
              posZ: 0,
              rotY: 0,
              speed: 0,
              isDrifting: false,
              driftAngle: 0,
              boosterActive: false,
              shieldActive: false,
              currentLap: 1,
              progress: 0,
              spinTimer: 0,
              finished: false,
            };

            room.players.push(aiPlayer);
            broadcastToRoom(meta.roomId, { type: 'room_updated', payload: room });
          }
          break;
        }

        case 'remove_ai': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player && player.isHost) {
            let aiIndex = -1;
            for (let i = room.players.length - 1; i >= 0; i--) {
              if (room.players[i].isAI) {
                aiIndex = i;
                break;
              }
            }
            if (aiIndex !== -1) {
              room.players.splice(aiIndex, 1);
              broadcastToRoom(meta.roomId, { type: 'room_updated', payload: room });
            }
          }
          break;
        }

        case 'start_game': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player && player.isHost) {
            // Verify if all human players are ready
            const notReadyHuman = room.players.find((p) => !p.isAI && !p.isReady);
            if (notReadyHuman) {
              sendToSocket(ws, {
                type: 'error_occurred',
                payload: '모든 플레이어가 준비를 마쳐야 출발할 수 있습니다!',
              });
              return;
            }

            room.status = 'countdown';
            room.bananas = [];
            room.itemBoxes = Array.from({ length: 12 }, (_, i) => ({ id: i, active: true }));
            room.raceStartTime = Date.now() + 3000; // 3 sec countdown

            // Reset scores & initial positions
            room.players.forEach((p) => {
              p.posX = 0;
              p.posY = 0;
              p.posZ = 0;
              p.rotY = 0;
              p.speed = 0;
              p.isDrifting = false;
              p.driftAngle = 0;
              p.boosterActive = false;
              p.shieldActive = false;
              p.currentLap = 1;
              p.progress = 0;
              p.spinTimer = 0;
              p.finished = false;
              delete p.finalTime;
            });

            broadcastToRoom(meta.roomId, { type: 'room_updated', payload: room });
            broadcastToRoom(meta.roomId, { type: 'game_started', payload: { startTimestamp: room.raceStartTime } });

            // Launch racing phase on server triggers after timeout
            setTimeout(() => {
              const currentRoomState = rooms.get(meta.roomId);
              if (currentRoomState && currentRoomState.status === 'countdown') {
                currentRoomState.status = 'racing';
                broadcastToRoom(meta.roomId, { type: 'room_updated', payload: currentRoomState });
              }
            }, 3000);
          }
          break;
        }

        case 'send_chat': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player) {
            const chatMsg = {
              id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              senderName: player.name,
              senderColor: player.color,
              text: payload.text,
              timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            };
            broadcastToRoom(meta.roomId, { type: 'chat_received', payload: chatMsg });
          }
          break;
        }

        case 'sync_physics': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player) {
            // Unpack physical coordinates
            player.posX = payload.posX;
            player.posY = payload.posY;
            player.posZ = payload.posZ;
            player.rotY = payload.rotY;
            player.speed = payload.speed;
            player.isDrifting = payload.isDrifting;
            player.driftAngle = payload.driftAngle;
            player.boosterActive = payload.boosterActive;
            player.shieldActive = payload.shieldActive;
            player.currentLap = payload.currentLap;
            player.progress = payload.progress;
            player.spinTimer = payload.spinTimer;
            
            // Periodically relay physics snapshot to peers immediately
            broadcastToRoom(meta.roomId, {
              type: 'physics_broadcast',
              payload: { playerId: player.id, state: payload },
            }, player.id);
          }

          // If the Host is sending physics, we can also simulate and relay AI positions
          // to make AI moves synchronized for all client instances!
          const anyHumanHost = room.players.find(p => !p.isAI && p.isHost);
          if (anyHumanHost && anyHumanHost.id === meta.playerId) {
            const aiPlayers = room.players.filter(p => p.isAI);
            if (aiPlayers.length > 0) {
              aiPlayers.forEach(ai => {
                // If AI is not spun out, move AI progress along spline
                if (ai.spinTimer > 0) {
                  ai.spinTimer--;
                } else if (room.status === 'racing' && !ai.finished) {
                  // Incremental progression
                  const speedVariation = 0.00095 + Math.sin(Date.now() * 0.001 + parseFloat(ai.id.split('_')[2] || '0')) * 0.00018;
                  ai.progress += speedVariation;
                  if (ai.progress >= 1.0) {
                    ai.progress -= 1.0;
                    ai.currentLap++;
                    if (ai.currentLap > 3) {
                      ai.finished = true;
                      const timeDiff = Date.now() - (room.raceStartTime || Date.now());
                      const mm = Math.floor(timeDiff / 60000).toString().padStart(2, '0');
                      const ss = Math.floor((timeDiff % 60000) / 1000).toString().padStart(2, '0');
                      const ms = Math.floor((timeDiff % 1000) / 10).toString().padStart(2, '0');
                      ai.finalTime = `${mm}:${ss}.${ms}`;
                      
                      broadcastToRoom(meta.roomId, {
                        type: 'player_finished',
                        payload: { playerId: ai.id, finalTime: ai.finalTime }
                      });
                    }
                  }
                }
              });
              
              // Broadcast full room updates occasionally or send inside sync frame
              // Sending AI updates inside physics_broadcast makes them silky smooth on client!
              aiPlayers.forEach(ai => {
                broadcastToRoom(meta.roomId, {
                  type: 'physics_broadcast',
                  payload: {
                    playerId: ai.id,
                    state: {
                      posX: ai.posX,
                      posY: ai.posY,
                      posZ: ai.posZ,
                      rotY: ai.rotY,
                      speed: ai.speed,
                      isDrifting: ai.isDrifting,
                      driftAngle: ai.driftAngle,
                      boosterActive: ai.boosterActive,
                      shieldActive: ai.shieldActive,
                      currentLap: ai.currentLap,
                      progress: ai.progress,
                      spinTimer: ai.spinTimer,
                      finished: ai.finished
                    }
                  }
                }, anyHumanHost.id); // exclude host since host calculates AI spline positions anyway
              });
            }
          }
          break;
        }

        case 'collect_item_box': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const boxId = payload.id;
          const box = room.itemBoxes.find((b) => b.id === boxId);
          if (box && box.active) {
            box.active = false;

            // Trigger random item choice
            const items = ['booster', 'shield', 'banana', 'missile'];
            const awardedItem = items[Math.floor(Math.random() * items.length)];

            // Tell all players in the room that this specific item box is collected
            broadcastToRoom(meta.roomId, {
              type: 'item_box_collected',
              payload: { id: boxId, collectorId: meta.playerId, item: awardedItem },
            });

            // Set a timer to respawn the active item box after 5 seconds
            setTimeout(() => {
              const activeRoom = rooms.get(meta.roomId);
              if (activeRoom) {
                const refreshedBox = activeRoom.itemBoxes.find((b) => b.id === boxId);
                if (refreshedBox) {
                  refreshedBox.active = true;
                  broadcastToRoom(meta.roomId, {
                    type: 'item_box_respawned',
                    payload: { id: boxId },
                  });
                }
              }
            }, 5000);
          }
          break;
        }

        case 'drop_banana': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const bId = `ban_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          const banana: BananaObstacle = {
            id: bId,
            posX: payload.posX,
            posY: payload.posY,
            posZ: payload.posZ,
          };

          room.bananas.push(banana);
          broadcastToRoom(meta.roomId, {
            type: 'banana_dropped',
            payload: banana,
          });
          break;
        }

        case 'hit_banana': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const bananaId = payload.id;
          const initialBananaCount = room.bananas.length;
          room.bananas = room.bananas.filter((b) => b.id !== bananaId);

          if (room.bananas.length < initialBananaCount) {
            broadcastToRoom(meta.roomId, {
              type: 'banana_removed',
              payload: { id: bananaId, hitPlayerId: meta.playerId },
            });
          }
          break;
        }

        case 'shoot_missile': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          // Target opponent player within room
          broadcastToRoom(meta.roomId, {
            type: 'missile_fired',
            payload: { fromPlayerId: meta.playerId, targetPlayerId: payload.targetPlayerId },
          });
          break;
        }

        case 'cross_lap_finish': {
          const meta = clientMetadata.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;

          const player = room.players.find((p) => p.id === meta.playerId);
          if (player && !player.finished) {
            player.finished = true;
            
            // Format race time duration duration
            const duration = Date.now() - (room.raceStartTime || Date.now());
            const minutesVal = Math.floor(duration / 60000).toString().padStart(2, '0');
            const secondsVal = Math.floor((duration % 60000) / 1000).toString().padStart(2, '0');
            const millisVal = Math.floor((duration % 1000) / 10).toString().padStart(2, '0');
            player.finalTime = `${minutesVal}:${secondsVal}.${millisVal}`;

            broadcastToRoom(meta.roomId, {
              type: 'player_finished',
              payload: { playerId: player.id, finalTime: player.finalTime },
            });

            // Check if all human racers have crossed the finish line
            const racingHumans = room.players.filter((p) => !p.isAI && !p.finished);
            if (racingHumans.length === 0) {
              room.status = 'finished';
              broadcastToRoom(meta.roomId, { type: 'room_updated', payload: room });
            }
          }
          break;
        }
      }
    } catch (e) {
      console.error('[Socket] Failed to parse client payload: ', e);
    }
  });

  ws.on('close', () => {
    console.log('[Socket] Client connection severed');
    handlePlayerExiting(ws);
  });
});

// Configure Vite integration and server static directories
async function startWebEngine() {
  if (process.env.NODE_ENV !== 'production') {
    // Vite Dev Server middleware mode for rapid HMR & code previews
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production optimized assets servicing
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[HTTP Engine] Server running on port ${PORT}`);
  });
}

startWebEngine().catch((err) => {
  console.error('[Boot Err] Failed starting Express/Vite full stack server:', err);
});

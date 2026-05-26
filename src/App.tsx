import { useState, useEffect, useRef } from 'react';
import { GameRoom, ChatMessage, PlayerState, ServerMessage } from './types';
import { Lobby } from './components/Lobby';
import { ThreeGame } from './components/ThreeGame';
import { AudioEngine } from './components/AudioEngine';
import { 
  Gauge, 
  Flag, 
  RotateCcw, 
  Camera, 
  X, 
  ShieldAlert, 
  Sparkles, 
  Flame, 
  User, 
  ChevronRight, 
  Trophy, 
  HelpCircle, 
  Shield, 
  Rocket, 
  Skull,
  MousePointerClick
} from 'lucide-react';

export default function App() {
  // Main view route: 'lobby' | 'in-game'
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [selfPlayerId, setSelfPlayerId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // Game HUD state overlays
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hudState, setHUDState] = useState({ speed: 0, gauge: 0, stock: 0, lap: 1 });
  const [activeItem, setActiveItem] = useState<string | null>(null); // 'booster' | 'shield' | 'banana' | 'missile'
  const [boosterActive, setBoosterActive] = useState(false);
  const [shieldActive, setShieldActive] = useState(false);
  const [cameraType, setCameraType] = useState<'isometric' | 'chase' | 'first'>('isometric');

  // Multi-user rankings
  const [rankings, setRankings] = useState<PlayerState[]>([]);
  const [elapsedTime, setElapsedTime] = useState('00:00.00');

  // Comic popup text items
  const [comicPops, setComicPops] = useState<{ id: string; text: string; color: string }[]>([]);

  // Mobile Controls Steering Action indicators
  const [isMobileSteer, setIsMobileSteer] = useState({
    left: false,
    right: false,
    gas: false,
    brake: false,
    drift: false
  });

  // Floating notifications
  const [toast, setToast] = useState<{ title: string; text: string; icon: string } | null>(null);

  // WebSocket referencing handles
  const socketRef = useRef<WebSocket | null>(null);
  
  // Un-rendered high-frequency physics coordinates to avoid React re-render lagging
  const peerPhysicsUpdatesRef = useRef<Map<string, any>>(new Map());

  // Core Timer loops
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (title: string, text: string, icon: string = 'Bell') => {
    setToast({ title, text, icon });
    setTimeout(() => setToast(null), 3000);
  };

  const showComicPop = (text: string, color: string = '#f43f5e') => {
    const id = `pop_${Date.now()}_${Math.random()}`;
    setComicPops((prev) => [...prev, { id, text, color }]);
    setTimeout(() => {
      setComicPops((prev) => prev.filter((item) => item.id !== id));
    }, 1500);
  };

  // Connects socket and configures real-time listener handlers
  const connectToSocketRoom = (nickname: string, color: string, requestedRoomCode?: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    // Adapt window origin to WebSocket protocol
    const host = window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${host}/ws`;

    console.log(`[Socket] Dialing multiplayer server: ${socketUrl}`);
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      // Send register payload once connected
      ws.send(JSON.stringify({
        type: 'join_room',
        roomId: requestedRoomCode,
        payload: { name: nickname, color: color }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        const { type, payload } = message;

        switch (type) {
          case 'room_updated': {
            if (payload.selfPlayerId) {
              setSelfPlayerId(payload.selfPlayerId);
            }
            setRoom(payload.room);
            break;
          }

          case 'chat_received': {
            setChatMessages((prev) => [...prev, payload]);
            break;
          }

          case 'game_started': {
            setActiveItem(null);
            setBoosterActive(false);
            setShieldActive(false);
            setHUDState({ speed: 0, gauge: 0, stock: 0, lap: 1 });
            peerPhysicsUpdatesRef.current.clear();
            
            // Start countdown ticker
            const startEpoch = payload.startTimestamp;
            const checkCountdown = () => {
              const diff = startEpoch - Date.now();
              if (diff > 2000) {
                setCountdown(3);
                AudioEngine.playItemPickup();
              } else if (diff > 1000) {
                setCountdown(2);
                AudioEngine.playItemPickup();
              } else if (diff > 0) {
                setCountdown(1);
                AudioEngine.playItemPickup();
              } else {
                setCountdown(0); // GO!
                AudioEngine.playBoost();
                showComicPop('GOOOOH!', '#22d3ee');
                setTimeout(() => setCountdown(null), 1000);
                clearInterval(countdownTimer);
                
                // Track real-time elapsed racing timer
                startRaceStopwatch(startEpoch);
              }
            };

            const countdownTimer = setInterval(checkCountdown, 100);
            checkCountdown();
            break;
          }

          case 'physics_broadcast': {
            // Un-reactive fast save
            peerPhysicsUpdatesRef.current.set(payload.playerId, payload.state);
            break;
          }

          case 'item_box_collected': {
            // Update active room meshes inside Three.js through state refs
            setRoom((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                itemBoxes: prev.itemBoxes.map(b => b.id === payload.id ? { ...b, active: false } : b)
              };
            });

            // If we are the item collector, grant item visual slot
            if (payload.collectorId === selfPlayerId) {
              AudioEngine.playItemPickup();
              setActiveItem(payload.item);
              showComicPop('ITEM!!', '#eab308');
              showToast('아이템 획득', getFormattedItemName(payload.item) + ' 획득! [SPACE] 사용', 'Sparkles');
            }
            break;
          }

          case 'item_box_respawned': {
            setRoom((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                itemBoxes: prev.itemBoxes.map(b => b.id === payload.id ? { ...b, active: true } : b)
              };
            });
            break;
          }

          case 'banana_dropped': {
            setRoom((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                bananas: [...prev.bananas, payload]
              };
            });
            break;
          }

          case 'banana_removed': {
            setRoom((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                bananas: prev.bananas.filter(b => b.id !== payload.id)
              };
            });

            // If we hit the banana, trigger spin effect directly inside ThreeGame animation loops
            if (payload.hitPlayerId === selfPlayerId) {
              const localSpinMethod = (window as any).triggerLocalSpinout;
              if (localSpinMethod) {
                localSpinMethod();
              }
              showToast('사고 발생!', '바나나를 밟아 빙글빙글 미끄러집니다!', 'ShieldAlert');
            } else {
              // Find other racer name
              const victim = room?.players.find(p => p.id === payload.hitPlayerId);
              if (victim) {
                showToast('공격 타격', `💥 ${victim.name}님이 트랩에 미끄러졌습니다!`, 'Skull');
              }
            }
            break;
          }

          case 'missile_fired': {
            // Visually trigger target checks
            if (payload.targetPlayerId === selfPlayerId) {
              // If we have an active shield, defend!
              if (shieldActive) {
                setShieldActive(false);
                AudioEngine.playCrash();
                showComicPop('DEFEND!', '#22d3ee');
                showToast('초정밀 방어', '🛡️ 에너르기 쉴드로 유도 미사일을 방어했습니다!', 'Shield');
              } else {
                const localSpinMethod = (window as any).triggerLocalSpinout;
                if (localSpinMethod) {
                  localSpinMethod();
                }
                showToast('로켓 피격!!', '🎯 유도 미사일에 격추되어 스핀아웃 되었습니다!!', 'Skull');
              }
            } else {
              const shooter = room?.players.find(p => p.id === payload.fromPlayerId);
              const victim = room?.players.find(p => p.id === payload.targetPlayerId);
              if (shooter && victim) {
                showToast('미사일 격파', `🚀 ${shooter.name} -> ${victim.name} 타격 성공!`, 'Rocket');
              }
            }
            break;
          }

          case 'player_finished': {
            setRoom((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                players: prev.players.map(p => p.id === payload.playerId ? { ...p, finished: true, finalTime: payload.finalTime } : p)
              };
            });

            if (payload.playerId === selfPlayerId) {
              showComicPop('FINISH!', '#facc15');
              AudioEngine.playBoost();
              showToast('완주 성공!!!', `축하합니다! 기록: ${payload.finalTime}`, 'Trophy');
              if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
              }
            }
            break;
          }

          case 'error_occurred': {
            showToast('경고', payload, 'ShieldAlert');
            break;
          }
        }
      } catch (err) {
        console.error('[Socket ERROR] Failed parsing server event: ', err);
      }
    };

    ws.onclose = () => {
      setRoom(null);
      setSelfPlayerId('');
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      showToast('서버 접속 끊김', '멀티플레이어 서버와 연결이 해제되었습니다.', 'ShieldAlert');
    };
  };

  const startRaceStopwatch = (raceStart: number) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    timerIntervalRef.current = setInterval(() => {
      const diff = Date.now() - raceStart;
      if (diff < 0) return;
      const mm = Math.floor(diff / 60000).toString().padStart(2, '0');
      const ss = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      const ms = Math.floor((diff % 1000) / 10).toString().padStart(2, '0');
      setElapsedTime(`${mm}:${ss}.${ms}`);
    }, 35);
  };

  const getFormattedItemName = (code: string) => {
    switch (code) {
      case 'booster': return '⚡ 툰-피버 부스터';
      case 'shield': return '🛡️ 일렉트릭 에너르기 쉴드';
      case 'banana': return '🍌 바나나 트랩 폭탄';
      case 'missile': return '🚀 자동 유도 로켓 미사일';
      default: return '수수께끼 상자';
    }
  };

  // --- ACTIONS SENDERS VIA SOCKET ---
  const handleJoinRoom = (nickname: string, color: string, code?: string) => {
    connectToSocketRoom(nickname, color, code);
  };

  const handleLeaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'leave_room' }));
      socketRef.current.close();
      socketRef.current = null;
    }
    setRoom(null);
    setSelfPlayerId('');
    setChatMessages([]);
  };

  const handleToggleReady = (isReady: boolean) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'set_ready', payload: { isReady } }));
    }
  };

  const handleSetMode = (mode: 'speed' | 'item') => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'set_mode', payload: { mode } }));
    }
  };

  const handleAddAI = () => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'add_ai' }));
    }
  };

  const handleRemoveAI = () => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'remove_ai' }));
    }
  };

  const handleStartGame = () => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'start_game' }));
    }
  };

  const handleSendChat = (text: string) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'send_chat', payload: { text } }));
    }
  };

  const handleSyncPhysics = (physics: any) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'sync_physics', payload: physics }));
    }
  };

  const handleCollectBox = (boxId: number) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'collect_item_box', payload: { id: boxId } }));
    }
  };

  const handleDropBanana = (pos: { posX: number; posY: number; posZ: number }) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'drop_banana', payload: pos }));
    }
  };

  const handleCrossLap = (lap: number) => {
    if (lap > 3) {
      if (socketRef.current) {
        socketRef.current.send(JSON.stringify({ type: 'cross_lap_finish' }));
      }
    }
  };

  // --- PROCESS ACTIVE ITEM TRIGGERS ---
  const useActiveItem = () => {
    if (!activeItem || countdown !== null) return;
    const item = activeItem;
    setActiveItem(null);

    switch (item) {
      case 'booster': {
        setBoosterActive(true);
        // Calls booster activate trigger inside ThreeGame physics reference
        const triggerActive = (window as any).triggerBoosterInput;
        if (triggerActive) triggerActive();
        break;
      }
      case 'shield': {
        setShieldActive(true);
        AudioEngine.playItemPickup();
        showComicPop('SHIELD!', '#22d3ee');
        showToast('쉴드 장착', '🛡️ 보호막을 둘렀습니다! 피격 1회를 절대 방어합니다.', 'Shield');
        // Auto fade after 5 seconds
        setTimeout(() => {
          setShieldActive(false);
        }, 5000);
        break;
      }
      case 'banana': {
        // Drop behind player locally, which calculates and updates coordinates back to WebSocket
        const triggerDrop = (window as any).triggerDropBanana;
        if (triggerDrop) triggerDrop();
        break;
      }
      case 'missile': {
        // Shoot at the competitor directly in front of us!
        const aheadOpponent = rankings.find(p => p.id !== selfPlayerId && !p.finished && p.progress > (rankings.find(me => me.id === selfPlayerId)?.progress || 0));
        const targetId = aheadOpponent?.id || rankings.find(p => p.id !== selfPlayerId && !p.finished)?.id;

        if (targetId) {
          if (socketRef.current) {
            socketRef.current.send(JSON.stringify({ type: 'shoot_missile', payload: { targetPlayerId: targetId } }));
          }
          AudioEngine.playCrash();
          showComicPop('FIRE!', '#f43f5e');
        } else {
          showToast('락온 실패', '사거리에 락온 가능한 라이더 검출 실패!', 'X');
          // Refund item
          setActiveItem('missile');
        }
        break;
      }
    }
  };

  // --- REAL-TIME LEADERBOARD CALCULATIONS ---
  useEffect(() => {
    if (!room) return;
    
    // Periodically evaluate players ranking scores based on Lap and Spline Progress metrics
    const interval = setInterval(() => {
      const scores = room.players.map((p) => {
        // High rate physics updates stored inside the unstaged reference map
        const latestPhysics = peerPhysicsUpdatesRef.current.get(p.id) || {};
        const pLap = latestPhysics.currentLap || p.currentLap || 1;
        const pProgress = latestPhysics.progress || p.progress || 0;
        
        // Finalized karts gets massive sorting bonus
        const sortedScore = p.finished ? 1000 - (parseFloat(p.finalTime?.replace(':', '') || '999999') / 1000) : (pLap - 1) + pProgress;

        return {
          ...p,
          currentLap: pLap,
          progress: pProgress,
          finished: p.finished || latestPhysics.finished || false,
          sortedScore,
        };
      });

      // Sort descending by progress factor
      scores.sort((a, b) => b.sortedScore - a.sortedScore);
      setRankings(scores);
    }, 200);

    return () => clearInterval(interval);
  }, [room, selfPlayerId]);

  // Handle local hit banana events spawned out from Three.js collisions
  useEffect(() => {
    const handleLocalHitBanana = (e: Event) => {
      const banId = (e as CustomEvent).detail.id;
      if (socketRef.current) {
        socketRef.current.send(JSON.stringify({ type: 'hit_banana', payload: { id: banId } }));
      }
    };
    window.addEventListener('player_hit_banana', handleLocalHitBanana);
    return () => window.removeEventListener('player_hit_banana', handleLocalHitBanana);
  }, []);

  // Teardown connections on complete unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Mini HUD camera toggle switcher
  const toggleCamera = () => {
    AudioEngine.playItemPickup();
    setCameraType((prev) => {
      if (prev === 'isometric') return 'chase';
      if (prev === 'chase') return 'first';
      return 'isometric';
    });
    showComicPop('CAM CHANGED', '#22d3ee');
  };

  const getCameraName = () => {
    if (cameraType === 'isometric') return '쿼터 2.5˚ 뷰';
    if (cameraType === 'chase') return '3인칭 체이스 뷰';
    return '1인칭 파일럿 뷰';
  };

  const selfRacerRankValue = rankings.findIndex(p => p.id === selfPlayerId) + 1;
  const selfRacerDetails = rankings.find(p => p.id === selfPlayerId);

  // --- DRAW MINIMAP RADAR CANVAS ---
  useEffect(() => {
    if (!room || room.status === 'lobby') return;
    const canvas = document.getElementById('minimap-hud-radar') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw track path layout
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render path lines matching trackSpline landmarks
    const centerOfs = { x: canvas.width / 2, y: canvas.height / 2 };
    const zoomScale = 0.28;

    // Redraw points
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
    ctx.lineWidth = 5;
    
    // Exposing sample calculations
    const splinePts = [
      {x: 0, z: 0}, {x: 60, z: 30}, {x: 120, z: 15}, {x: 180, z: -40}, {x: 160, z: -110},
      {x: 90, z: -150}, {x: 20, z: -110}, {x: -40, z: -160}, {x: -100, z: -120},
      {x: -140, z: -160}, {x: -90, z: -15}, {x: -40, z: 15}, {x: 0, z: 0}
    ];

    splinePts.forEach((pt, idx) => {
      const cx = centerOfs.x + pt.x * zoomScale;
      const cy = centerOfs.y + pt.z * zoomScale;
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    // Map connected players onto radar positions
    rankings.forEach((p) => {
      // Find matching coordinates
      const latestPhys = peerPhysicsUpdatesRef.current.get(p.id) || {};
      const rx = centerOfs.x + (latestPhys.posX || 0) * zoomScale;
      const ry = centerOfs.y + (latestPhys.posZ || 0) * zoomScale;

      ctx.save();
      ctx.beginPath();
      // Draw shadow ring
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.arc(rx, ry, p.id === selfPlayerId ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }, [rankings, room, selfPlayerId]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#030408] font-sans">
      
      {/* 1. THREE.JS 3D VIEWPORT CONTAINER */}
      {room && room.status !== 'lobby' && (
        <div className="absolute inset-0 z-0">
          <ThreeGame
            selfPlayerId={selfPlayerId}
            room={room}
            onSyncPhysics={handleSyncPhysics}
            onCollectBox={handleCollectBox}
            onDropBanana={handleDropBanana}
            onCrossLap={handleCrossLap}
            boosterActive={boosterActive}
            setBoosterActive={setBoosterActive}
            shieldActive={shieldActive}
            setShieldActive={setShieldActive}
            isMobileSteer={isMobileSteer}
            cameraType={cameraType}
            setHUDState={setHUDState}
            showComicPop={showComicPop}
            peerPhysicsUpdates={peerPhysicsUpdatesRef}
          />
        </div>
      )}

      {/* 2. BACKGROUND STARBURST NEON COVER */}
      {(!room || room.status === 'lobby') && (
        <div className="absolute inset-0 bg-radial-gradient from-slate-950 via-slate-900 to-black flex flex-col items-center justify-center p-4 overflow-y-auto">
          {/* Logo Heading */}
          <div className="w-full flex justify-center py-6">
            <Lobby
              room={room}
              selfPlayerId={selfPlayerId}
              chatMessages={chatMessages}
              onJoinRoom={handleJoinRoom}
              onLeaveRoom={handleLeaveRoom}
              onToggleReady={handleToggleReady}
              onSetMode={handleSetMode}
              onAddAI={handleAddAI}
              onRemoveAI={handleRemoveAI}
              onStartGame={handleStartGame}
              onSendChat={handleSendChat}
            />
          </div>
        </div>
      )}

      {/* 3. ACTIVE RACING IN-GAME OVERLAY INTERFACES */}
      {room && room.status !== 'lobby' && (
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6 text-white select-none">
          
          {/* Top Row: Timers & Camera Switchers */}
          <div className="flex justify-between items-start w-full">
            <div className="flex flex-col gap-2 pointer-events-auto">
              <div className="bg-slate-950/85 backdrop-blur-md px-4 py-2 rounded-2xl border-2 border-pink-500/70 flex items-center gap-3">
                <span className="text-pink-400 font-extrabold text-xs uppercase tracking-widest font-['Orbitron']">TIME</span>
                <span className="font-['Orbitron'] text-xl font-black">{elapsedTime}</span>
              </div>
              <div className="bg-slate-950/85 backdrop-blur-md px-4 py-2 rounded-2xl border-2 border-yellow-400/70 flex items-center gap-3">
                <span className="text-yellow-400 font-extrabold text-xs uppercase tracking-widest font-['Orbitron']">LAP</span>
                <span className="font-['Orbitron'] text-xl font-black">{hudState.lap} / 3</span>
              </div>
            </div>

            {/* Quick action cameras */}
            <div className="flex gap-2 pointer-events-auto">
              <button 
                onClick={toggleCamera} 
                className="bg-slate-900/90 hover:bg-slate-800 border-2 border-pink-500 rounded-xl px-4 py-2.5 text-xs font-black flex items-center gap-2 transition-all hover:scale-105 active:scale-95 text-slate-200"
              >
                <Camera className="w-4 h-4 text-pink-400" />
                <span>{getCameraName()}</span>
              </button>
              <button 
                onClick={handleLeaveRoom} 
                className="bg-rose-950/90 hover:bg-rose-900 border-2 border-rose-500 rounded-xl px-4 py-2.5 text-xs font-black flex items-center gap-2 transition-all hover:scale-105 active:scale-95 text-slate-100"
              >
                <X className="w-4 h-4 text-rose-400" />
                <span>나가기</span>
              </button>
            </div>

            {/* In-Game realtime leaderboards */}
            <div className="bg-slate-950/85 backdrop-blur-md border-2 border-pink-500/80 rounded-2xl p-4 w-48 md:w-56">
              <span className="text-[10px] font-black tracking-widest uppercase text-pink-400 border-b border-white/10 pb-1.5 block mb-2 font-['Orbitron']">
                LIVE SCORE BOARD ({rankings.length} Riders)
              </span>
              <div className="space-y-1.5 select-text">
                {rankings.map((p, idx) => (
                  <div 
                    key={p.id} 
                    className={`flex items-center justify-between text-xs font-extrabold ${
                      p.id === selfPlayerId 
                        ? 'text-cyan-400 bg-cyan-950/20 px-1 py-0.5 rounded border border-cyan-400/20' 
                        : 'text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="w-4 h-4 rounded bg-slate-800 text-[10px] text-center inline-block leading-4 text-white font-['Orbitron']">
                        {idx + 1}
                      </span>
                      {/* color indicator */}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="truncate max-w-[100px]">{p.name}</span>
                    </div>
                    <span className="font-['Orbitron'] font-black">
                      {p.finished ? (
                        <span className="text-emerald-400">FIN</span>
                      ) : (
                        `L${p.currentLap || 1}`
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center Row: Item Slot overlay for Item Mode */}
          {room.mode === 'item' && (
            <div className="flex flex-col items-center justify-end flex-grow pb-8">
              <div className="flex items-center gap-4 bg-slate-950/90 p-4 rounded-3xl border-2 border-yellow-400 shadow-2xl pointer-events-auto">
                <button
                  onClick={useActiveItem}
                  disabled={!activeItem}
                  className={`relative w-22 h-22 rounded-2xl flex flex-col items-center justify-center border-4 select-none outline-none transition-all duration-100 ${
                    activeItem
                      ? 'bg-yellow-400 border-white text-slate-950 hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(234,179,8,0.5)]'
                      : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                  title="아이템 사용 [SPACE]"
                >
                  {activeItem ? (
                    <>
                      {activeItem === 'booster' && <Flame className="w-10 h-10 animate-pulse text-rose-600 fill-current" />}
                      {activeItem === 'shield' && <Shield className="w-10 h-10 text-blue-600 fill-current animate-ping" />}
                      {activeItem === 'banana' && <Skull className="w-10 h-10 text-amber-600" />}
                      {activeItem === 'missile' && <Rocket className="w-10 h-10 text-red-600 transform rotate-45" />}
                    </>
                  ) : (
                    <HelpCircle className="w-10 h-10 text-slate-700 animate-pulse" />
                  )}
                  <span className="absolute bottom-1 text-[8px] font-black tracking-widest text-center block w-full">SLOT</span>
                </button>
                <div className="text-left w-36">
                  <div className="text-xs font-black text-yellow-300">
                    {activeItem ? getFormattedItemName(activeItem) : '아이템 없음'}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {activeItem ? '클릭 혹은 [SPACE] 키를 눌러 활성화하세요!' : '트랙의 황금 상자를 뚫고 달리세요!'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Row: Dashboard meters details */}
          <div className="flex justify-between items-end w-full">
            
            {/* Left Radar HUD */}
            <div className="flex items-end gap-3 pointer-events-auto">
              <div className="relative border-2 border-pink-500/70 rounded-2xl overflow-hidden p-1 bg-slate-950/95 shadow-2xl">
                <canvas id="minimap-hud-radar" width="130" height="130" className="rounded-xl block" />
                <span className="absolute -top-3 left-4 bg-pink-500 text-[#060b1e] text-[9px] font-black px-2 py-0.5 rounded tracking-widest uppercase font-['Orbitron']">
                  MINI MAP
                </span>
              </div>

              {/* Compact Speed Booster stats for speed mode */}
              {room.mode === 'speed' && (
                <div className="bg-slate-950/95 border-2 border-pink-500/70 p-3 rounded-2xl w-36 flex flex-col justify-between h-[138px]">
                  <span className="text-[9px] font-black tracking-widest text-[#22d3ee] uppercase text-center block border-b border-white/5 pb-1">BOOST ENGINE</span>
                  
                  <div className="flex-grow flex flex-col justify-center gap-1.5">
                    {/* Booster stock charge */}
                    <div className="w-full h-4 bg-slate-900 rounded-lg overflow-hidden border border-pink-400/30 relative flex items-center justify-center">
                      <div 
                        className="h-full bg-gradient-to-r from-pink-500 via-indigo-500 to-cyan-400 transition-all duration-75 absolute left-0 top-0"
                        style={{ width: `${hudState.gauge}%` }}
                      />
                      {hudState.stock > 0 && (
                        <span className="absolute text-[8px] font-black tracking-widest text-[#030408] uppercase animate-pulse z-10">
                          BOOST READY
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-slate-500 text-center block">DRIFT TO GAUGE</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 text-center rounded-lg py-1 font-['Orbitron'] text-xs font-black text-pink-400">
                    STOCKS: {hudState.stock}
                  </div>
                </div>
              )}
            </div>

            {/* Jet Fire boost state flare */}
            {boosterActive && (
              <div className="absolute left-1/2 top-1/4 -translate-x-1/2 bg-gradient-to-r from-red-600 via-pink-500 to-amber-500 border border-white px-8 py-2.5 rounded-full shadow-[0_0_30px_rgba(244,63,94,0.8)] animate-bounce text-xs font-black tracking-widest text-[#000] [text-shadow:0_1px_1px_rgba(255,255,255,0.4)] z-50">
                ⚡ CRITICAL ANIME BURNING BOOSTER ACTIVE! ⚡
              </div>
            )}

            {/* Custom high gauge dashboard Speedometer */}
            <div className="flex items-center gap-5 bg-slate-950/90 px-6 py-4 rounded-3xl border-2 border-pink-500 pointer-events-auto shadow-2xl">
              <div className="text-center relative">
                <h4 className="font-['Orbitron'] text-5xl font-black text-pink-400 tracking-tighter [filter:drop-shadow(0_0_8px_rgba(244,63,94,0.6))]">
                  {hudState.speed}
                </h4>
                <span className="text-[9px] font-black text-slate-400 tracking-widest uppercase block mt-0.5">KM/H</span>
              </div>
              <div className="h-12 w-[1.5px] bg-slate-800" />
              <div className="text-[9px] text-slate-400 flex flex-col gap-0.5">
                <div>💥 <span className="text-cyan-400 font-bold">W / S</span> 조향 가감속</div>
                <div>⚡ <span className="text-pink-500 font-bold">Shift + 방향키</span> 드리프트</div>
                <div>🎯 <span className="text-yellow-400 font-bold">Space/Ctrl</span> 아이템 / 부스터</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MOBILE ON-SCREEN HUD CLICKS CONTROLLERS */}
      {room && room.status !== 'lobby' && (
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-6 select-none lg:hidden">
          <div className="w-full flex justify-between items-end pointer-events-auto gap-4">
            
            {/* Steering (D-PAD) Left Side */}
            <div className="flex gap-3 pointer-events-auto">
              <button
                onTouchStart={() => setIsMobileSteer((prev) => ({ ...prev, left: true }))}
                onTouchEnd={() => setIsMobileSteer((prev) => ({ ...prev, left: false }))}
                onMouseDown={() => setIsMobileSteer((prev) => ({ ...prev, left: true }))}
                onMouseUp={() => setIsMobileSteer((prev) => ({ ...prev, left: false }))}
                className="w-16 h-16 rounded-2xl bg-slate-950/90 border-4 border-pink-500 text-pink-400 font-black text-2xl flex items-center justify-center outline-none select-none hover:scale-105 active:scale-90 transition-all shadow-xl"
              >
                ◀
              </button>
              <button
                onTouchStart={() => setIsMobileSteer((prev) => ({ ...prev, right: true }))}
                onTouchEnd={() => setIsMobileSteer((prev) => ({ ...prev, right: false }))}
                onMouseDown={() => setIsMobileSteer((prev) => ({ ...prev, right: true }))}
                onMouseUp={() => setIsMobileSteer((prev) => ({ ...prev, right: false }))}
                className="w-16 h-16 rounded-2xl bg-slate-950/90 border-4 border-pink-500 text-pink-400 font-black text-2xl flex items-center justify-center outline-none select-none hover:scale-105 active:scale-90 transition-all shadow-xl"
              >
                ▶
              </button>
            </div>

            {/* Gas/Drift Side */}
            <div className="flex flex-col gap-3 pointer-events-auto items-end">
              <div className="flex gap-3">
                {room.mode === 'item' && activeItem && (
                  <button
                    onClick={useActiveItem}
                    className="w-16 h-16 rounded-full bg-yellow-400 border-4 border-white text-slate-900 font-black text-xs flex items-center justify-center outline-none hover:scale-105 active:scale-95 shadow-xl"
                  >
                    ITEM
                  </button>
                )}
                <button
                  onTouchStart={() => setIsMobileSteer((prev) => ({ ...prev, drift: true }))}
                  onTouchEnd={() => setIsMobileSteer((prev) => ({ ...prev, drift: false }))}
                  onMouseDown={() => setIsMobileSteer((prev) => ({ ...prev, drift: true }))}
                  onMouseUp={() => setIsMobileSteer((prev) => ({ ...prev, drift: false }))}
                  className="w-16 h-16 rounded-2xl bg-indigo-600 border-4 border-white text-white font-extrabold text-[10px] flex items-center justify-center outline-none select-none hover:scale-105 active:scale-90 shadow-xl"
                >
                  DRIFT
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onTouchStart={() => setIsMobileSteer((prev) => ({ ...prev, brake: true }))}
                  onTouchEnd={() => setIsMobileSteer((prev) => ({ ...prev, brake: false }))}
                  onMouseDown={() => setIsMobileSteer((prev) => ({ ...prev, brake: true }))}
                  onMouseUp={() => setIsMobileSteer((prev) => ({ ...prev, brake: false }))}
                  className="w-16 h-16 rounded-2xl bg-rose-600 border-4 border-rose-400 text-white text-xs font-black flex items-center justify-center hover:scale-105 active:scale-90 shadow-xl"
                >
                  BRAKE
                </button>
                <button
                  onTouchStart={() => setIsMobileSteer((prev) => ({ ...prev, gas: true }))}
                  onTouchEnd={() => setIsMobileSteer((prev) => ({ ...prev, gas: false }))}
                  onMouseDown={() => setIsMobileSteer((prev) => ({ ...prev, gas: true }))}
                  onMouseUp={() => setIsMobileSteer((prev) => ({ ...prev, gas: false }))}
                  className="w-20 h-20 rounded-2xl bg-pink-500 border-4 border-white text-slate-950 font-black text-xl flex items-center justify-center hover:scale-110 active:scale-90 shadow-2xl"
                >
                  GAS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. FINISH RECONCILE POPUP OVERLAYS */}
      {room && room.status === 'finished' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 select-text">
          <div className="bg-gradient-to-b from-slate-950 via-slate-900 to-black rounded-3xl p-8 border-4 border-pink-500 max-w-xl w-full text-center shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
            
            <div className="inline-block px-6 py-2 rounded-full font-black text-xs tracking-widest mb-4 bg-yellow-400 text-slate-950 shadow-[0_0_15px_rgba(234,179,8,0.5)] uppercase font-['Orbitron']">
              ★ Race Complete ★
            </div>

            <h2 className="text-4xl md:text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-500 to-cyan-400 mb-6 font-['Orbitron'] [text-shadow:3px_3px_0px_#000]">
              FINISH LINE!
            </h2>

            {/* Podium leaderboard list */}
            <div className="space-y-3 mb-8 text-left bg-slate-950/80 p-5 rounded-2xl border-2 border-slate-800">
              <span className="text-[10px] text-slate-500 font-extrabold tracking-wider block border-b border-slate-800/80 pb-1 uppercase">FINAL STANDINGS</span>
              {rankings.map((p, idx) => (
                <div key={p.id} className="flex items-center justify-between py-1 border-b border-slate-900 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full text-xs font-black text-slate-950 text-center flex items-center justify-center ${
                      idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-slate-300' : idx === 2 ? 'bg-amber-600' : 'bg-slate-700 text-white'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="font-bold text-sm tracking-wide text-slate-200">{p.name} {p.id === selfPlayerId && <span className="text-[10px] text-cyan-400">(나)</span>}</span>
                  </div>
                  <span className="font-['Orbitron'] font-extrabold text-[#22d3ee]">
                    {p.finalTime || 'D.N.F (완주 실패)'}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              {room.players.find(p => p.id === selfPlayerId)?.isHost ? (
                <button
                  onClick={handleStartGame}
                  className="flex-1 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 text-slate-900 py-3.5 px-6 rounded-2xl text-xs font-black tracking-widest shadow-lg shadow-pink-500/30 hover:scale-105 active:scale-95 transition-all outline-none"
                >
                  RESTART MATCH 다시 달리기
                </button>
              ) : (
                <div className="flex-1 text-xs text-slate-500 bg-slate-950/50 py-3.5 rounded-2xl flex items-center justify-center font-bold">
                  방장이 매치를 재시작하길 대기 중...
                </div>
              )}
              <button
                onClick={handleLeaveRoom}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3.5 px-6 rounded-2xl text-xs font-black border-2 border-slate-700 hover:scale-105 active:scale-95 transition-all outline-none"
              >
                대기 로비로 복귀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. COUNTDOWN HUD */}
      {countdown !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 text-white font-['Orbitron'] select-none pointer-events-none">
          <div className="text-9xl font-black italic tracking-wider animate-ping text-pink-500 duration-500">
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          <p className="text-xs uppercase tracking-widest text-[#22d3ee] font-sans font-bold mt-4 animate-pulse">
            ★ 준비하세요! 만화풍 초고속 레이스가 시작됩니다 ★
          </p>
        </div>
      )}

      {/* 7. COMIC FLOATING TEXT POPS */}
      <div className="absolute inset-x-0 top-1/4 z-30 pointer-events-none flex flex-col items-center gap-2">
        {comicPops.map((pop) => (
          <div
            key={pop.id}
            className="text-4xl md:text-5xl font-black italic select-none uppercase animate-bounce font-['Orbitron'] tracking-widest drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]"
            style={{
              color: pop.color,
              WebkitTextStroke: '2px #000',
              animationDuration: '1s'
            }}
          >
            {pop.text}
          </div>
        ))}
      </div>

      {/* 8. FLOAT NOTIFICATION TOAST CARD */}
      {toast && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-pink-500/80 rounded-2xl px-5 py-3.5 flex items-center gap-4.5 shadow-2xl backdrop-blur-md pointer-events-none transition-all animate-slide-up select-none min-w-[280px]">
          <div className="w-10 h-10 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-400/40 text-lg">
            {toast.icon === 'ShieldAlert' && <ShieldAlert />}
            {toast.icon === 'Sparkles' && <Sparkles />}
            {toast.icon === 'Flame' && <Flame />}
            {toast.icon === 'Trophy' && <Trophy />}
            {toast.icon === 'Rocket' && <Rocket />}
            {toast.icon === 'Skull' && <Skull />}
            {toast.icon === 'Shield' && <Shield />}
          </div>
          <div>
            <span className="text-[10px] font-black tracking-widest text-slate-400 block uppercase">{toast.title}</span>
            <span className="text-xs font-black text-slate-100 block mt-0.5">{toast.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}

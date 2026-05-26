import React, { useState, useEffect, useRef } from 'react';
import { GameRoom, PlayerState, ChatMessage } from '../types';
import { Shield, Users, Bot, Play, Send, Copy, Plus, Minus, LogOut, Check, Sparkles, Flame, Keyboard } from 'lucide-react';
import { AudioEngine } from './AudioEngine';

interface LobbyProps {
  room: GameRoom | null;
  selfPlayerId: string;
  chatMessages: ChatMessage[];
  onJoinRoom: (nickname: string, color: string, requestedRoomCode?: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (isReady: boolean) => void;
  onSetMode: (mode: 'speed' | 'item') => void;
  onAddAI: () => void;
  onRemoveAI: () => void;
  onStartGame: () => void;
  onSendChat: (text: string) => void;
}

const PRESET_COLORS = [
  { name: '네온 핑크', hex: '#ff007f' },
  { name: '네온 사이언', hex: '#22d3ee' },
  { name: '메탈 오렌지', hex: '#fdba74' },
  { name: '레이싱 옐로우', hex: '#facc15' },
  { name: '바이올렛 플레어', hex: '#c084fc' },
  { name: '에머랄드 리프', hex: '#86efac' },
];

export const Lobby: React.FC<LobbyProps> = ({
  room,
  selfPlayerId,
  chatMessages,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onSetMode,
  onAddAI,
  onRemoveAI,
  onStartGame,
  onSendChat,
}) => {
  const [nickname, setNickname] = useState(() => {
    // Persistent helper for local users
    return localStorage.getItem('kart_nickname') || `라이더_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [selectedColor, setSelectedColor] = useState('#ff007f');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('kart_nickname', nickname);
  }, [nickname]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleCopyCode = async () => {
    if (room?.code) {
      try {
        await navigator.clipboard.writeText(room.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {}
    }
  };

  const submitChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendChat(chatInput.trim());
      setChatInput('');
    }
  };

  const selfPlayer = room?.players.find((p) => p.id === selfPlayerId);
  const isHost = selfPlayer?.isHost || false;

  // Render Joined Room View
  if (room) {
    return (
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-6 text-white min-h-[80vh] items-stretch">
        
        {/* Left Side (8-Cols): Competitors & Mode Options */}
        <div className="lg:col-span-8 flex flex-col justify-between bg-slate-900/80 backdrop-blur-md rounded-3xl border-2 border-slate-700/60 p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500" />
          
          <div>
            {/* Header with Room code */}
            <div className="flex flex-wrap items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
              <div>
                <span className="text-xs font-black tracking-widest text-[#22d3ee] uppercase">MULTIPLAYER ARENA</span>
                <h2 className="text-2xl md:text-3xl font-black italic tracking-wide mt-1 flex items-center gap-2 font-['Orbitron']">
                  ROOM <span className="text-pink-500 underline decoration-cyan-400 decoration-2">{room.code}</span>
                  <button 
                    onClick={handleCopyCode} 
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all hover:scale-105 active:scale-95"
                    title="방 코드 복사"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {copied && <span className="text-xs font-bold text-emerald-400 normal-case not-italic font-sans">복사 완료!</span>}
                </h2>
              </div>
              
              {/* Mode Select panel */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-400">게임 모드:</span>
                {isHost ? (
                  <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                    <button
                      onClick={() => onSetMode('speed')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                        room.mode === 'speed'
                          ? 'bg-pink-500 text-slate-950 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      SPEED 스피드
                    </button>
                    <button
                      onClick={() => onSetMode('item')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                        room.mode === 'item'
                          ? 'bg-yellow-400 text-slate-950 shadow-[0_0_12px_rgba(234,179,8,0.4)]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ITEMS 아이템
                    </button>
                  </div>
                ) : (
                  <span className={`px-4 py-1.5 rounded-xl text-xs font-black border uppercase tracking-wider ${
                    room.mode === 'speed'
                      ? 'border-pink-500/45 text-pink-400 bg-pink-500/10'
                      : 'border-yellow-500/45 text-yellow-400 bg-yellow-500/10'
                  }`}>
                    {room.mode === 'speed' ? '🏁 SPEED 스피드 모드' : '🎯 ITEMS 아이템전'}
                  </span>
                )}
              </div>
            </div>

            {/* Players Grid list */}
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#22d3ee]" />
              참가 라이더 목록 ({room.players.length} / 6)
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {room.players.map((plr) => (
                <div
                  key={plr.id}
                  className={`relative flex items-center justify-between p-4 rounded-2xl border-2 bg-slate-950/70 transition-all ${
                    plr.id === selfPlayerId
                      ? 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                      : plr.isReady
                      ? 'border-emerald-500/40 bg-emerald-950/10'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Kart colored circle */}
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 animate-pulse relative"
                      style={{ backgroundColor: plr.color, boxShadow: `0 0 10px ${plr.color}` }}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm tracking-wide">{plr.name}</span>
                        {plr.id === selfPlayerId && (
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 font-bold px-1.5 py-0.5 rounded">Me</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {plr.isHost && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/20 px-1 py-0.5 rounded font-black flex items-center gap-0.5 uppercase tracking-wider">
                            <Shield className="w-2.5 h-2.5" /> Host
                          </span>
                        )}
                        {plr.isAI && (
                          <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/20 px-1 py-0.5 rounded font-black flex items-center gap-0.5 uppercase tracking-wider">
                            <Bot className="w-2.5 h-2.5" /> CPU
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator badge */}
                  <div>
                    {plr.isHost ? (
                      <span className="text-xs font-black text-amber-400 tracking-wider bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-xl">
                        START
                      </span>
                    ) : plr.isReady ? (
                      <span className="text-xs font-black text-emerald-400 tracking-wider bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-xl">
                        READY
                      </span>
                    ) : (
                      <span className="text-xs font-black text-rose-400 tracking-wider bg-rose-500/10 border border-rose-500/25 px-2.5 py-1 rounded-xl">
                        WAIT
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Space to populate host AI */}
              {room.players.length < 6 && isHost && (
                <button
                  onClick={onAddAI}
                  className="flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-slate-800 hover:border-purple-500/40 bg-slate-950/20 hover:bg-purple-950/10 transition-all group scale-100 active:scale-95"
                >
                  <Bot className="w-5 h-5 text-purple-400 animate-bounce" />
                  <span className="text-xs font-black text-slate-400 group-hover:text-purple-300">경쟁용 인공지능(AI) 추가하기</span>
                </button>
              )}
            </div>
          </div>

          {/* Action panels */}
          <div className="mt-8 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => {
                AudioEngine.playCrash();
                onLeaveRoom();
              }}
              className="px-6 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 font-extrabold text-sm border border-zinc-700 hover:text-white transition-all flex items-center gap-2 active:scale-95"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              대기방 퇴장
            </button>

            {/* AI Controls for Host */}
            {isHost && room.players.some((p) => p.isAI) && (
              <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
                <span className="text-xs font-bold text-slate-400 px-2">AI 제어:</span>
                <button
                  onClick={onRemoveAI}
                  className="p-1 px-2.5 rounded-xl bg-rose-950/30 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-xs font-black flex items-center gap-1 active:scale-95"
                  title="마지막 AI 제거"
                >
                  <Minus className="w-3 h-3" /> AI 제거
                </button>
                <button
                  onClick={onAddAI}
                  className="p-1 px-2.5 rounded-xl bg-purple-950/30 hover:bg-purple-900 border border-purple-500/30 text-purple-400 text-xs font-black flex items-center gap-1 active:scale-95"
                  title="새로운 AI 추가"
                >
                  <Plus className="w-3 h-3" /> AI 추가
                </button>
              </div>
            )}

            {/* Active match launch button */}
            <div>
              {isHost ? (
                <button
                  onClick={onStartGame}
                  className="px-10 py-4 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:opacity-90 font-black text-sm tracking-widest text-[#060b1e] shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase font-['Orbitron']"
                >
                  <Play className="w-5 h-5 fill-current" />
                  MATCH START 레이스 시작
                </button>
              ) : (
                <button
                  onClick={() => {
                    const nextAndCurrentReady = !selfPlayer?.isReady;
                    AudioEngine.playItemPickup();
                    onToggleReady(nextAndCurrentReady);
                  }}
                  className={`px-10 py-4 rounded-2xl font-black text-sm tracking-widest active:scale-95 transition-all text-slate-950 flex items-center gap-2 uppercase ${
                    selfPlayer?.isReady
                      ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)] hover:bg-emerald-300'
                      : 'bg-rose-400 shadow-[0_0_20px_rgba(251,113,133,0.35)] hover:bg-rose-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4 fill-current animate-spin" />
                  {selfPlayer?.isReady ? 'READY 취소' : 'READY 준비 완료'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Side (4-Cols): Global Room Chat */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-slate-950/80 backdrop-blur-md rounded-3xl border-2 border-slate-800 p-5 shadow-2xl overflow-hidden max-h-[550px] lg:max-h-none h-[400px] lg:h-auto">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">실시간 채널 토크</h3>
          </div>

          {/* Chat log window */}
          <div className="flex-grow my-4 overflow-y-auto pr-1 space-y-2.5 select-text">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-500 p-4">
                <Users className="w-8 h-8 opacity-25 mb-1" />
                대화 기록이 아직 없습니다.<br />채팅으로 어필해 보세요!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="text-xs leading-relaxed animate-fade-in break-words">
                  <span
                    className="font-black mr-1"
                    style={{ color: msg.senderColor }}
                  >
                    {msg.senderName}
                  </span>
                  <span className="text-[10px] text-slate-600 mr-2 font-['Orbitron']">{msg.timestamp}</span>
                  <p className="inline text-slate-300 font-sans">{msg.text}</p>
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Form */}
          <form onSubmit={submitChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="대화 내용 입력..."
              maxLength={80}
              className="flex-grow bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-cyan-400 text-white placeholder-slate-600"
            />
            <button
              type="submit"
              className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 hover:scale-105 active:scale-95 text-slate-900 transition-all shadow-[0_0_10px_rgba(34,211,238,0.3)]"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Room Select Screen (Choose profile & Join)
  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/40 backdrop-blur-lg rounded-3xl border-2 border-slate-800/80 p-8 shadow-2xl relative overflow-hidden mt-8">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #f43f5e 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />
      
      <div className="text-center mb-8 transform -rotate-1 relative z-10">
        <h1 className="text-4xl md:text-5xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-yellow-300 to-cyan-400 font-['Orbitron'] [text-shadow:4px_4px_0px_#000]">
          ANIME RAIDER
        </h1>
        <p className="text-pink-400 text-[11px] mt-1 tracking-widest font-black uppercase">
          ★ MULTIPLAYER ARCADE KART ★
        </p>
      </div>

      <div className="space-y-6 relative z-10">
        {/* Profile Nickname */}
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">라이더 닉네임</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={14}
            className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-pink-500 font-bold tracking-wide text-white transition-all placeholder-slate-700"
            placeholder="라이더 이름"
          />
        </div>

        {/* Selected Kart color */}
        <div className="space-y-2.5">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">카트 네온 바디 컬러</label>
          <div className="grid grid-cols-6 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.hex}
                onClick={() => {
                  setSelectedColor(color.hex);
                  AudioEngine.playItemPickup();
                }}
                className={`w-full aspect-square rounded-xl border-2 transition-all flex items-center justify-center cursor-pointer scale-100 active:scale-95 ${
                  selectedColor === color.hex
                    ? 'border-white scale-110 shadow-lg'
                    : 'border-transparent opacity-75 hover:opacity-100 hover:scale-105'
                }`}
                style={{
                  backgroundColor: color.hex,
                  boxShadow: selectedColor === color.hex ? `0 0 15px ${color.hex}` : 'none',
                }}
                title={color.name}
              >
                {selectedColor === color.hex && <Check className="w-4 h-4 text-slate-900 font-black stroke-[3px]" />}
              </button>
            ))}
          </div>
        </div>

        {/* Room choice logic split */}
        <div className="border-t border-slate-800/80 pt-6 space-y-4">
          <button
            onClick={() => {
              AudioEngine.playBoost();
              onJoinRoom(nickname, selectedColor);
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 font-black text-slate-100 shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 tracking-widest text-sm"
          >
            <Sparkles className="w-5 h-5 fill-current animate-bounce" />
            QUICK MATCH 빠른 시작
          </button>

          <div className="flex items-center gap-3 text-xs text-slate-500 font-bold uppercase my-2">
            <div className="h-[1px] flex-grow bg-slate-800/80" />
            <span>OR 방 코드 입력</span>
            <div className="h-[1px] flex-grow bg-slate-800/80" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              className="flex-grow bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 text-sm uppercase focus:outline-none focus:border-cyan-400 text-center font-bold tracking-widest font-['Orbitron'] text-[#22d3ee]"
              placeholder="방 코드 (예: ROOM12)"
              maxLength={8}
            />
            <button
              onClick={() => {
                if (roomCodeInput.trim()) {
                  AudioEngine.playBoost();
                  onJoinRoom(nickname, selectedColor, roomCodeInput.trim());
                }
              }}
              className="px-6 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black tracking-widest hover:scale-105 active:scale-95 transition-all outline-none"
            >
              방 가입
            </button>
          </div>
        </div>

        {/* Quick controls review */}
        <div className="text-[11px] text-slate-500/80 pt-4 border-t border-slate-800/60 leading-relaxed font-sans text-center">
          <Keyboard className="w-3.5 h-3.5 inline mr-1 text-slate-400 align-middle" />
          방향키(<span className="text-slate-400">W, A, S, D</span>) 혹은 터치로 가속/회전, <span className="text-[#ff007f] font-bold">Shift</span> 드리프트, <span className="text-pink-400 font-bold">Space/Ctrl</span> 아이템 사용
        </div>
      </div>
    </div>
  );
};

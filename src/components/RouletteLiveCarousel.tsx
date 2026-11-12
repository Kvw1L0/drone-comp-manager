import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Play, Trophy, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import {
  RouletteParticipant,
  RouletteState,
  broadcastSpinCommand,
  saveRouletteState,
  subscribeRouletteEvents,
} from '../services/rouletteStorage';
import { playTickSound, playWinnerFanfare } from '../utils/audio';

interface RouletteLiveCarouselProps {
  mode?: 'fullscreen' | 'embedded';
  state: RouletteState;
  onUpdateState: (updater: (prev: RouletteState) => RouletteState) => void;
  onOpenPublicScreen?: () => void;
  showSpinButton?: boolean;
}

const REPETITIONS = 20;

export const RouletteLiveCarousel: React.FC<RouletteLiveCarouselProps> = ({
  mode = 'embedded',
  state,
  onUpdateState,
  showSpinButton = true,
}) => {
  const isEmbedded = mode === 'embedded';

  const cardWidth = isEmbedded ? 240 : 290;
  const cardGap = isEmbedded ? 14 : 18;
  const itemStride = cardWidth + cardGap;

  const [soundEnabled, setSoundEnabled] = useState<boolean>(state.soundEnabled !== false);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [activeWinner, setActiveWinner] = useState<RouletteParticipant | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState<boolean>(false);

  const [offsetPx, setOffsetPx] = useState<number>(0);
  const [transitionDuration, setTransitionDuration] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const isSpinningRef = useRef<boolean>(false);
  const tickIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);

  // Build repeated array for smooth carousel looping
  const carouselItems = useMemo(() => {
    const list = state.participants;
    if (!list || list.length === 0) return [];
    const repeated: RouletteParticipant[] = [];
    for (let r = 0; r < REPETITIONS; r++) {
      repeated.push(...list);
    }
    return repeated;
  }, [state.participants]);

  // Central execute spin logic
  const executeSpin = (winnerId: string, durationSec: number) => {
    if (carouselItems.length === 0 || isSpinningRef.current) return;

    setIsSpinning(true);
    setShowWinnerModal(false);
    setActiveWinner(null);

    const winner =
      state.participants.find((p) => p.id === winnerId) ||
      state.participants[Math.floor(Math.random() * state.participants.length)];
    if (!winner) {
      setIsSpinning(false);
      return;
    }

    // Target index in a distant repetition block (e.g. rep 14 of 20)
    const baseListLength = state.participants.length;
    const targetRep = Math.max(6, REPETITIONS - 6);
    const winnerIndexInBase = state.participants.findIndex((p) => p.id === winner.id);
    const targetSlotIndex =
      targetRep * baseListLength + (winnerIndexInBase >= 0 ? winnerIndexInBase : 0);

    // Calculate center translation
    const viewportWidth = containerRef.current?.clientWidth || window.innerWidth;
    const centerOffset = viewportWidth / 2 - cardWidth / 2;
    const targetTranslate = targetSlotIndex * itemStride - centerOffset;

    // Reset offset first without animation
    setTransitionDuration(0);
    setOffsetPx(0);

    // Wait 2 frames to apply reset before initiating the transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionDuration(durationSec);
        setOffsetPx(targetTranslate);

        // Sound ticker loop
        if (soundEnabled && state.soundEnabled) {
          const startTime = Date.now();
          const totalMs = durationSec * 1000;

          if (tickIntervalRef.current) clearTimeout(tickIntervalRef.current);

          const runTickLoop = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / totalMs);
            if (progress >= 0.98 || !isSpinningRef.current) return;

            playTickSound(1.0 + (1 - progress) * 0.4);

            // Progressive deceleration curve for ticks
            const nextDelay = 35 + Math.pow(progress, 3) * 380;
            tickIntervalRef.current = window.setTimeout(runTickLoop, nextDelay);
          };

          runTickLoop();
        }

        // Completion callback
        setTimeout(() => {
          setIsSpinning(false);
          setActiveWinner(winner);
          setShowWinnerModal(true);

          if (tickIntervalRef.current) clearTimeout(tickIntervalRef.current);

          if (soundEnabled && state.soundEnabled) {
            playWinnerFanfare();
          }

          // Confetti celebration
          if (state.confettiEnabled !== false) {
            try {
              confetti({
                particleCount: 140,
                spread: 85,
                origin: { y: 0.6 },
                colors: ['#e60012', '#ff2a2a', '#fbbf24', '#ffffff', '#ffd700'],
              });
              setTimeout(() => {
                confetti({
                  particleCount: 90,
                  angle: 60,
                  spread: 60,
                  origin: { x: 0 },
                  colors: ['#ff2a2a', '#fbbf24'],
                });
                confetti({
                  particleCount: 90,
                  angle: 120,
                  spread: 60,
                  origin: { x: 1 },
                  colors: ['#ff2a2a', '#fbbf24'],
                });
              }, 300);
            } catch {
              // Ignore
            }
          }

          // Record winner in state
          const newWinnerRecord = {
            id: `winner-${Date.now()}`,
            participant: winner,
            prizeTitle: state.prizeTitle || 'Sorteo Oficial',
            timestamp: Date.now(),
          };

          const nextWinners = [newWinnerRecord, ...(state.winners || [])];
          let nextParticipants = state.participants;

          if (state.removeWinnerFromPool) {
            nextParticipants = state.participants.filter((p) => p.id !== winner.id);
          }

          const updatedState: RouletteState = {
            ...state,
            participants: nextParticipants,
            winners: nextWinners,
            isSpinning: false,
          };

          saveRouletteState(updatedState, true);
        }, durationSec * 1000);
      });
    });
  };

  // Listen to remote spin commands via BroadcastChannel
  useEffect(() => {
    const unsub = subscribeRouletteEvents(
      (nextState) => {
        // State update
        if (nextState.soundEnabled !== undefined) {
          setSoundEnabled(nextState.soundEnabled);
        }
      },
      (spinCmd) => {
        // Remote spin command received
        executeSpin(spinCmd.winnerId, spinCmd.durationSec);
      }
    );
    return unsub;
  }, [state.participants]);

  // Trigger spin locally and broadcast to other windows
  const handleStartSpin = () => {
    if (state.participants.length === 0 || isSpinning) return;

    // Pick winner
    const randomIdx = Math.floor(Math.random() * state.participants.length);
    const chosenWinner = state.participants[randomIdx];
    const duration = state.spinDurationSeconds || 8;
    const nonce = (state.spinNonce || 0) + 1;

    // Broadcast command to external screens
    broadcastSpinCommand(chosenWinner.id, duration, nonce);

    // Execute immediately on local carousel
    executeSpin(chosenWinner.id, duration);
  };

  return (
    <div className={`relative flex flex-col ${isEmbedded ? 'w-full' : 'w-full h-full justify-center'}`}>
      {/* Visual Carousel Frame */}
      <div
        className={`relative w-full rounded-2xl overflow-hidden border-2 border-red-500/50 bg-[#090b10] shadow-[0_12px_45px_rgba(0,0,0,0.95)] ${
          isEmbedded ? 'py-4 px-2' : 'py-8 px-4 max-w-7xl mx-auto'
        }`}
      >
        {/* Top Indicator Laser Arrow */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 z-30 flex flex-col items-center">
          <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[16px] border-t-[#ff2a2a] drop-shadow-[0_0_12px_#ff0000]" />
          <div className="w-1.5 h-2 bg-[#ff2a2a] rounded-full shadow-[0_0_8px_#ff2a2a]" />
        </div>

        {/* Bottom Indicator Laser Arrow */}
        <div className="pointer-events-none absolute left-1/2 bottom-0 -translate-x-1/2 z-30 flex flex-col items-center">
          <div className="w-1.5 h-2 bg-[#ff2a2a] rounded-full shadow-[0_0_8px_#ff2a2a]" />
          <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[16px] border-b-[#ff2a2a] drop-shadow-[0_0_12px_#ff0000]" />
        </div>

        {/* Glowing Central Target Reticle Frame */}
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-2xl border-2 border-red-500 ${
            isEmbedded ? 'w-[252px] h-[155px]' : 'w-[304px] h-[190px]'
          }`}
          style={{
            boxShadow: '0 0 35px rgba(255, 42, 42, 0.75), inset 0 0 20px rgba(255, 42, 42, 0.35)',
          }}
        >
          {/* Corner brackets */}
          <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-amber-300" />
          <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-amber-300" />
          <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-amber-300" />
          <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-amber-300" />

          {/* Crosshairs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-amber-300 shadow-[0_0_8px_#fbbf24]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-amber-300 shadow-[0_0_8px_#fbbf24]" />
        </div>

        {/* Horizontal Track Viewport */}
        <div
          ref={containerRef}
          className={`relative w-full overflow-hidden ${isEmbedded ? 'py-4' : 'py-6'}`}
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 14%, black 86%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 14%, black 86%, transparent)',
          }}
        >
          {/* Sliding Carousel Ribbon */}
          <div
            className="flex items-center"
            style={{
              transform: `translateX(-${offsetPx}px)`,
              transition: isSpinning
                ? `transform ${transitionDuration}s cubic-bezier(0.12, 0.8, 0.32, 1)`
                : 'none',
              willChange: 'transform',
            }}
          >
            {carouselItems.map((p, idx) => (
              <div
                key={`${p.id}-${idx}`}
                style={{ width: `${cardWidth}px`, marginRight: `${cardGap}px` }}
                className={`shrink-0 rounded-2xl p-3 sm:p-4 flex flex-col justify-between border-2 border-red-500/40 bg-gradient-to-b from-[#181a24] via-[#10121a] to-[#0a0b10] shadow-[0_10px_35px_rgba(0,0,0,0.9)] relative overflow-hidden select-none ${
                  isEmbedded ? 'h-[142px]' : 'h-[174px]'
                }`}
              >
                {/* Top Row: Division Badge & Number */}
                <div className="flex items-center justify-between h-5">
                  <span className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-amber-300 font-mono text-[10px] sm:text-xs font-black">
                    {p.number || `#${(idx % state.participants.length) + 1}`}
                  </span>
                  {p.division && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-black uppercase tracking-wider ${
                        p.division === 'Tx' || p.division === 'transmision'
                          ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                          : 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                      }`}
                    >
                      {p.division === 'transmision' ? 'Tx' : p.division === 'distribucion' ? 'Dx' : p.division}
                    </span>
                  )}
                </div>

                {/* Middle Row: Name in Bold Racing Typography */}
                <div className="text-center my-auto px-1">
                  <div className={`font-black uppercase text-white tracking-wide leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] line-clamp-2 ${
                    isEmbedded ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'
                  }`}>
                    {p.shortName || p.name}
                  </div>
                </div>

                {/* Bottom Row: Company / Organization */}
                <div className="text-center border-t border-white/10 pt-1.5">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-300 truncate block">
                    {p.company || 'Competidor'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Status Row */}
        <div className="mt-2 flex items-center justify-between px-3 text-xs text-slate-400 font-bold">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-black/60 border border-white/15 text-slate-300 text-[11px]">
              {state.participants.length} Participantes en pozo
            </span>
            <span className="text-amber-300 font-mono text-[11px]">
              Premio: {state.prizeTitle || 'Sorteo Oficial'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              const nextSound = !soundEnabled;
              setSoundEnabled(nextSound);
              onUpdateState((prev) => ({ ...prev, soundEnabled: nextSound }));
            }}
            className="p-1 rounded bg-black/50 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            title={soundEnabled ? 'Silenciar sonidos' : 'Activar sonido'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {/* Main Big Spin Button (Integrated into Carousel Component) */}
      {showSpinButton && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleStartSpin}
            disabled={state.participants.length === 0 || isSpinning}
            className={`w-full sm:w-auto py-3.5 px-8 sm:px-12 rounded-2xl font-black text-sm sm:text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-2xl transition-all cursor-pointer ${
              state.participants.length === 0 || isSpinning
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-75'
                : 'bg-gradient-to-r from-red-600 via-red-500 to-amber-500 hover:brightness-115 active:scale-95 text-white shadow-[0_0_30px_rgba(230,0,18,0.6)] border border-red-400/70 animate-pulse'
            }`}
          >
            <Play className={`w-6 h-6 fill-current ${isSpinning ? 'animate-spin' : ''}`} />
            <span>{isSpinning ? '¡RULETA GIRANDO...!' : '¡GIRAR RULETA AHORA!'}</span>
          </button>
        </div>
      )}

      {/* Winner Spotlight Modal */}
      {showWinnerModal && activeWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="relative w-full max-w-xl p-6 sm:p-8 rounded-3xl border-4 border-amber-400 bg-gradient-to-b from-[#26050a] via-[#140b10] to-[#0a0a0f] text-center shadow-[0_0_90px_rgba(251,191,36,0.65)] animate-in zoom-in-95 duration-300"
            style={{
              clipPath:
                'polygon(20px 0, calc(100% - 20px) 0, 100% 20px, 100% calc(100% - 20px), calc(100% - 20px) 100%, 20px 100%, 0 calc(100% - 20px), 0 20px)',
            }}
          >
            <div className="inline-flex p-3 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-slate-950 shadow-[0_0_35px_rgba(251,191,36,0.95)] mb-3 animate-bounce">
              <Trophy className="w-10 h-10 sm:w-12 sm:h-12" />
            </div>

            <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">
              ¡FELICITACIONES AL GANADOR!
            </div>

            <div className="mt-1 text-sm sm:text-base font-extrabold uppercase text-slate-300">
              {state.prizeTitle || 'Sorteo Oficial'}
            </div>

            {/* Winner Card in Modal */}
            <div className="mt-4 p-5 rounded-2xl border-2 border-red-500/60 bg-[#161822] shadow-2xl space-y-2">
              <div className="flex items-center justify-center gap-2">
                <span className="px-2.5 py-1 rounded bg-black/70 border border-white/20 text-amber-300 font-mono text-sm font-black">
                  {activeWinner.number || '#01'}
                </span>
                {activeWinner.division && (
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider ${
                      activeWinner.division === 'Tx' || activeWinner.division === 'transmision'
                        ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/60'
                        : 'bg-amber-500/30 text-amber-200 border border-amber-400/60'
                    }`}
                  >
                    {activeWinner.division === 'transmision' ? 'Tx' : activeWinner.division === 'distribucion' ? 'Dx' : activeWinner.division}
                  </span>
                )}
              </div>

              <div className="text-2xl sm:text-4xl font-black uppercase text-white tracking-wide drop-shadow-md">
                {activeWinner.name}
              </div>

              <div className="text-sm sm:text-base font-bold uppercase text-slate-300">
                {activeWinner.company || 'Competidor Oficial'}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowWinnerModal(false)}
                className="w-full sm:w-auto py-3 px-8 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:brightness-110 font-black text-slate-950 uppercase text-xs sm:text-sm tracking-wider cursor-pointer shadow-lg shadow-amber-500/40"
              >
                ¡Premio Entregado! Continuar
              </button>

              <button
                type="button"
                onClick={() => {
                  // Reincorporate winner
                  onUpdateState((prev) => ({
                    ...prev,
                    participants: prev.participants.some((p) => p.id === activeWinner.id)
                      ? prev.participants
                      : [activeWinner, ...prev.participants],
                  }));
                  setShowWinnerModal(false);
                }}
                className="w-full sm:w-auto py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/20 font-bold text-slate-300 hover:text-white uppercase text-xs tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                Mantener en el Pozo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

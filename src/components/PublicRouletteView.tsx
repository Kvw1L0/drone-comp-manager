import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Maximize2,
  ArrowLeft,
  Volume2,
  VolumeX,
  Trophy,
  Award,
  Tv,
} from 'lucide-react';
import {
  loadRouletteState,
  saveRouletteState,
  subscribeRouletteState,
  RouletteParticipant,
  RouletteState,
} from '../services/rouletteStorage';
import { playTickSound, playWinnerFanfare } from '../utils/audio';

interface PublicRouletteViewProps {
  onExitPublicView?: () => void;
  standalone?: boolean;
}

// Carousel geometry
const CARD_WIDTH_PX = 290;
const CARD_GAP_PX = 18;
const ITEM_STRIDE_PX = CARD_WIDTH_PX + CARD_GAP_PX;
const REPETITIONS = 20;

export const PublicRouletteView: React.FC<PublicRouletteViewProps> = ({
  onExitPublicView,
}) => {
  const [state, setState] = useState<RouletteState>(loadRouletteState);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [activeWinner, setActiveWinner] = useState<RouletteParticipant | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState<boolean>(false);

  // Position & animation
  const [offsetPx, setOffsetPx] = useState<number>(0);
  const [transitionDuration, setTransitionDuration] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastNonceRef = useRef<number>(state.spinNonce);
  const tickIntervalRef = useRef<number | null>(null);
  const isSpinningRef = useRef<boolean>(false);

  // Keep ref in sync
  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);

  // Sync state across windows/tabs via BroadcastChannel & localStorage
  useEffect(() => {
    const unsubscribe = subscribeRouletteState((newState) => {
      setState(newState);
      if (newState.soundEnabled !== undefined) {
        setSoundEnabled(newState.soundEnabled);
      }
    });
    return unsubscribe;
  }, []);

  // Viewport scrollbar lock
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

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

  // Handle spin triggers from Admin
  useEffect(() => {
    if (state.spinNonce > lastNonceRef.current && state.targetWinnerId) {
      lastNonceRef.current = state.spinNonce;
      executeSpin(state.targetWinnerId, state.spinDurationSeconds);
    }
  }, [state.spinNonce, state.targetWinnerId, state.spinDurationSeconds]);

  const executeSpin = (winnerId: string, durationSec: number) => {
    if (carouselItems.length === 0 || isSpinningRef.current) return;

    setIsSpinning(true);
    setShowWinnerModal(false);
    setActiveWinner(null);

    const winner =
      state.participants.find((p) => p.id === winnerId) ||
      state.participants[Math.floor(Math.random() * state.participants.length)];
    if (!winner) return;

    // Target index in a distant repetition block (e.g. rep 15 of 20)
    const baseListLength = state.participants.length;
    const targetRep = Math.max(8, REPETITIONS - 5);
    const winnerIndexInBase = state.participants.findIndex((p) => p.id === winner.id);
    const targetSlotIndex =
      targetRep * baseListLength + (winnerIndexInBase >= 0 ? winnerIndexInBase : 0);

    // Calculate center translation
    const viewportWidth = containerRef.current?.clientWidth || window.innerWidth;
    const centerOffset = viewportWidth / 2 - CARD_WIDTH_PX / 2;
    const targetTranslate = targetSlotIndex * ITEM_STRIDE_PX - centerOffset;

    // Reset offset first if at the far end so it can spin naturally again
    setTransitionDuration(0);
    setOffsetPx(0);

    // Give browser a frame to apply reset before initiating the transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionDuration(durationSec);
        setOffsetPx(targetTranslate);

        // Sound ticker loop that progressively slows down
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
            const nextDelay = 35 + Math.pow(progress, 3) * 360;
            tickIntervalRef.current = window.setTimeout(runTickLoop, nextDelay);
          };

          runTickLoop();
        }

        // Completion timeout
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

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      id="public-roulette-root"
      onDoubleClick={handleToggleFullscreen}
      className="font-broadcast-narrow relative h-screen h-[100dvh] max-h-screen w-full bg-[#08090c] text-white flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 18%, rgba(220, 0, 18, 0.28) 0%, rgba(10, 11, 16, 0.94) 55%, #060709 100%),
          repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 2px, transparent 2px, transparent 8px)
        `,
      }}
    >
      {/* ===================================================================== */}
      {/* KEY VISUAL HUD FRAME: METALLIC BARS, CHEVRONS & TECH SHIELDS          */}
      {/* ===================================================================== */}

      {/* Subtle Background Watermark */}
      <svg
        viewBox="0 0 400 400"
        className="pointer-events-none fixed -right-24 top-1/2 -translate-y-1/2 w-[520px] h-[520px] opacity-[0.035]"
        fill="none"
      >
        <polygon
          points="200,20 370,115 370,285 200,380 30,285 30,115"
          stroke="#ffffff"
          strokeWidth="28"
          strokeLinejoin="round"
        />
      </svg>

      {/* Top Metallic Bar & Right Glowing Red Accent (Exact KV match) */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-14 z-0">
        <div
          className="w-full h-7 bg-gradient-to-b from-[#23252c] via-[#14161b] to-[#090a0d] border-b border-white/10"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 72% 100%, 69% 45%, 31% 45%, 28% 100%, 0 100%)',
          }}
        />
        <div
          className="hidden sm:block absolute top-5 right-0 w-[30%] h-7 bg-gradient-to-r from-[#ff0015] via-[#d60012] to-[#5a0006] shadow-[0_0_25px_rgba(255,0,21,0.75)] border-y border-red-400/50"
          style={{
            clipPath: 'polygon(12% 0, 100% 0, 100% 100%, 0% 100%)',
          }}
        />
      </div>

      {/* Top-Left Beveled Corner Tech Shield (Exact KV match with red glowing parallelogram) */}
      <div className="pointer-events-none hidden md:block absolute top-4 left-3 w-44 h-48 z-0 opacity-90">
        <svg viewBox="0 0 210 230" fill="none" className="w-full h-full">
          <polygon
            points="6,6 196,6 196,65 92,195 6,195"
            fill="#101217"
            stroke="#e60012"
            strokeWidth="3.5"
          />
          <polygon
            points="16,16 182,16 182,60 86,181 16,181"
            fill="#16181f"
            stroke="#ff2a2a"
            strokeWidth="1.2"
            strokeOpacity="0.6"
          />
          <polygon
            points="92,88 135,88 94,142 64,142"
            fill="url(#rouletteTlRedGlow)"
          />
          <defs>
            <linearGradient id="rouletteTlRedGlow" x1="64" y1="88" x2="135" y2="142" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ff1e1e" />
              <stop offset="100%" stopColor="#7a0009" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Bottom-Right Beveled Corner Tech Shield (Exact KV match) */}
      <div className="pointer-events-none hidden md:block absolute bottom-4 right-3 w-44 h-48 z-0 opacity-90">
        <svg viewBox="0 0 210 230" fill="none" className="w-full h-full">
          <polygon
            points="204,224 14,224 14,165 118,35 204,35"
            fill="#101217"
            stroke="#e60012"
            strokeWidth="3.5"
          />
          <polygon
            points="194,214 28,214 28,170 124,49 194,49"
            fill="#16181f"
            stroke="#ff2a2a"
            strokeWidth="1.2"
            strokeOpacity="0.6"
          />
          <polygon
            points="118,142 75,142 116,88 146,88"
            fill="url(#rouletteBrRedGlow)"
          />
          <defs>
            <linearGradient id="rouletteBrRedGlow" x1="75" y1="88" x2="146" y2="142" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ff1e1e" />
              <stop offset="100%" stopColor="#7a0009" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Discreet Hover Controls Top-Right */}
      <div className="fixed top-2 right-3 z-50 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity duration-200">
        <a
          href="?vista=ranking"
          title="Ver Pantalla de Ranking"
          className="px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-slate-800 border border-white/20 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
        >
          <Tv className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Ranking</span>
        </a>
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Silenciar Ruleta' : 'Activar Sonido'}
          className="p-2 rounded-lg bg-black/80 hover:bg-red-950 border border-white/20 text-white cursor-pointer"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
        </button>
        <button
          type="button"
          onClick={handleToggleFullscreen}
          title="Pantalla Completa"
          className="p-2 rounded-lg bg-black/80 hover:bg-red-950 border border-white/20 text-white cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        {onExitPublicView && (
          <button
            type="button"
            onClick={onExitPublicView}
            className="px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-red-950 border border-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Salir
          </button>
        )}
      </div>

      {/* ===================================================================== */}
      {/* STRICT TOP LOGO (ENLARGED) + RED FLANKING SUBTITLE LINES             */}
      {/* ===================================================================== */}
      <header className="relative z-10 pt-3 sm:pt-4 px-4 flex flex-col items-center text-center shrink-0">
        <img
          src="/rally-drone-logo.png"
          alt="The First Grid Rally Drone Race"
          className="h-20 sm:h-28 md:h-32 lg:h-36 xl:h-40 max-h-[160px] w-auto object-contain drop-shadow-[0_6px_28px_rgba(230,0,18,0.85)] filter brightness-110 select-none transition-transform hover:scale-105 duration-300"
        />

        <div className="flex items-center justify-center gap-2 sm:gap-4 w-full max-w-2xl mt-1 sm:mt-2">
          <div className="h-[2.5px] flex-1 max-w-[160px] bg-gradient-to-r from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_12px_#e60012]" />
          <span className="text-xs sm:text-base md:text-lg font-black uppercase tracking-[0.26em] text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] flex items-center gap-2">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            {state.prizeTitle || 'SORTEO OFICIAL DE COMPETENCIA'}
          </span>
          <div className="h-[2.5px] flex-1 max-w-[160px] bg-gradient-to-l from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_12px_#e60012]" />
        </div>
      </header>

      {/* ===================================================================== */}
      {/* MAIN CAROUSEL ROULETTE STAGE                                          */}
      {/* ===================================================================== */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full px-2 sm:px-4 my-auto overflow-hidden">
        {carouselItems.length === 0 ? (
          <div className="text-center p-8 bg-slate-900/90 border border-slate-800 rounded-3xl max-w-md shadow-2xl">
            <Award className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-slate-200">No hay participantes cargados en la ruleta.</p>
            <p className="text-sm text-slate-400 mt-1">
              Cargue un archivo Excel o active la nómina oficial desde el panel de control.
            </p>
          </div>
        ) : (
          <div className="relative w-full max-w-[98vw] flex flex-col items-center">
            {/* Top Indicator Laser Arrow */}
            <div className="pointer-events-none absolute left-1/2 -top-6 -translate-x-1/2 z-30 flex flex-col items-center animate-bounce">
              <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[20px] border-t-[#ff2a2a] drop-shadow-[0_0_14px_#ff0000]" />
              <div className="w-1.5 h-3 bg-[#ff2a2a] rounded-full shadow-[0_0_10px_#ff2a2a]" />
            </div>

            {/* Bottom Indicator Laser Arrow */}
            <div className="pointer-events-none absolute left-1/2 -bottom-6 -translate-x-1/2 z-30 flex flex-col items-center">
              <div className="w-1.5 h-3 bg-[#ff2a2a] rounded-full shadow-[0_0_10px_#ff2a2a]" />
              <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-b-[20px] border-b-[#ff2a2a] drop-shadow-[0_0_14px_#ff0000]" />
            </div>

            {/* Glowing Central Target Reticle Frame */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[304px] h-[190px] rounded-2xl border-2 border-red-500"
              style={{
                boxShadow: '0 0 45px rgba(255, 42, 42, 0.8), inset 0 0 25px rgba(255, 42, 42, 0.4)',
              }}
            >
              {/* Corner brackets in bright gold */}
              <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-amber-300" />
              <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-amber-300" />
              <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-amber-300" />
              <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-amber-300" />

              {/* Center vertical crosshair ticks */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-amber-300 shadow-[0_0_8px_#fbbf24]" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-amber-300 shadow-[0_0_8px_#fbbf24]" />
            </div>

            {/* Horizontal Track Viewport with Vignette Fade Masks */}
            <div
              ref={containerRef}
              className="relative w-full overflow-hidden py-8"
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
                    style={{ width: `${CARD_WIDTH_PX}px`, marginRight: `${CARD_GAP_PX}px` }}
                    className="shrink-0 h-[174px] rounded-2xl p-4 flex flex-col justify-between border-2 border-red-500/40 bg-gradient-to-b from-[#181a24] via-[#10121a] to-[#0a0b10] shadow-[0_10px_35px_rgba(0,0,0,0.9)] relative overflow-hidden"
                  >
                    {/* Top Row: Division Badge (if present) */}
                    <div className="flex items-center justify-end h-5">
                      {p.division && (
                        <span
                          className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider ${
                            p.division === 'Tx' || p.division === 'transmision'
                              ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                              : 'bg-amber-500/25 text-amber-200 border border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                          }`}
                        >
                          {p.division === 'transmision' ? 'Tx' : p.division === 'distribucion' ? 'Dx' : p.division}
                        </span>
                      )}
                    </div>

                    {/* Middle Row: Name in Bold Racing Typography */}
                    <div className="text-center my-auto px-2">
                      <div className="text-2xl sm:text-3xl font-black uppercase text-white tracking-wide leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] line-clamp-2">
                        {p.shortName || p.name}
                      </div>
                    </div>

                    {/* Bottom Row: Company / Organization */}
                    <div className="text-center border-t border-white/10 pt-2">
                      <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 truncate block">
                        {p.company || 'Competidor'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Competitors In Wheel */}
            <div className="mt-3 text-center">
              <span className="px-4 py-1.5 rounded-full bg-black/70 border border-white/10 text-xs font-bold text-slate-300 uppercase tracking-widest shadow-md">
                {state.participants.length} Participantes
              </span>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* WINNER SPOTLIGHT MODAL                                                */}
      {/* ===================================================================== */}
      {showWinnerModal && activeWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="relative w-full max-w-xl p-8 rounded-3xl border-4 border-amber-400 bg-gradient-to-b from-[#26050a] via-[#140b10] to-[#0a0a0f] text-center shadow-[0_0_90px_rgba(251,191,36,0.65)] animate-in zoom-in-95 duration-300"
            style={{
              clipPath: 'polygon(20px 0, calc(100% - 20px) 0, 100% 20px, 100% calc(100% - 20px), calc(100% - 20px) 100%, 20px 100%, 0 calc(100% - 20px), 0 20px)',
            }}
          >
            <div className="inline-flex p-3 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-slate-950 shadow-[0_0_35px_rgba(251,191,36,0.95)] mb-3 animate-bounce">
              <Trophy className="w-12 h-12" />
            </div>

            <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">
              ¡TENEMOS UN GANADOR!
            </div>

            <div className="mt-1 text-sm font-bold text-slate-300 uppercase">
              {state.prizeTitle || 'PREMIO OFICIAL DE COMPETENCIA'}
            </div>

            <div className="my-6 p-6 rounded-2xl bg-black/75 border-2 border-amber-400/80 shadow-inner">
              <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase tracking-wide text-white drop-shadow-[0_4px_22px_rgba(251,191,36,0.9)]">
                {activeWinner.name}
              </h2>
              <p className="mt-2.5 text-lg sm:text-xl font-extrabold uppercase text-amber-300 tracking-wider">
                {activeWinner.company} {activeWinner.division ? `• ${activeWinner.division}` : ''}
              </p>
            </div>

            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowWinnerModal(false)}
                className="py-3 px-10 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-amber-500 hover:brightness-110 active:scale-95 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-red-600/40 transition cursor-pointer"
              >
                Aceptar y Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STRICT BOTTOM LOGO: GRUPO EMPRESAS CHILQUINTA                         */}
      {/* ===================================================================== */}
      <footer className="relative z-10 pb-3 pt-1 px-4 flex flex-col items-center justify-center shrink-0">
        <div className="flex items-center justify-center py-1 px-6">
          <img
            src="/logo-grupo-empresas-chilquinta-horizontal-white.png"
            alt="Grupo Empresas Chilquinta"
            className="h-6 sm:h-7 md:h-9 max-h-[38px] w-auto object-contain drop-shadow-[0_2px_12px_rgba(230,0,18,0.45)] select-none"
          />
        </div>
      </footer>
    </div>
  );
};

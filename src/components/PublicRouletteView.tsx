import React, { useEffect, useState } from 'react';
import {
  Maximize2,
  ArrowLeft,
  Tv,
  Sparkles,
} from 'lucide-react';
import {
  loadRouletteState,
  saveRouletteState,
  subscribeRouletteEvents,
  RouletteState,
} from '../services/rouletteStorage';
import { RouletteLiveCarousel } from './RouletteLiveCarousel';

interface PublicRouletteViewProps {
  onExitPublicView?: () => void;
}

export const PublicRouletteView: React.FC<PublicRouletteViewProps> = ({
  onExitPublicView,
}) => {
  const [state, setState] = useState<RouletteState>(loadRouletteState);

  // Sync state across windows/tabs
  useEffect(() => {
    const unsubscribe = subscribeRouletteEvents((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  const updateState = (updater: (prev: RouletteState) => RouletteState) => {
    setState((prev) => {
      const next = updater(prev);
      saveRouletteState(next, true);
      return next;
    });
  };

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

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div
      onDoubleClick={handleToggleFullscreen}
      className="font-broadcast-narrow relative h-screen h-[100dvh] max-h-screen w-full bg-[#08090c] text-white flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 15%, rgba(220, 0, 18, 0.28) 0%, rgba(10, 11, 16, 0.94) 55%, #050608 100%),
          repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 2px, transparent 2px, transparent 8px)
        `,
      }}
    >
      {/* Discreet Hover-Only Controls */}
      <div className="fixed top-2 right-3 z-50 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity duration-200">
        <a
          href="/?vista=ranking"
          title="Ver Ranking Oficial"
          className="px-2.5 py-1.5 rounded-lg bg-black/80 hover:bg-slate-800 border border-white/20 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
        >
          <Tv className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Ranking</span>
        </a>
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

      {/* TOP HEADER: OFFICIAL LOGO + SUBTITLE */}
      <header className="relative z-10 pt-2 sm:pt-3 px-4 flex flex-col items-center text-center shrink-0">
        <img
          src="/rally-drone-logo.png"
          alt="The First Grid Rally Drone Race"
          className="h-16 sm:h-20 md:h-24 lg:h-28 max-h-[115px] w-auto object-contain drop-shadow-[0_4px_20px_rgba(230,0,18,0.85)] filter brightness-110 select-none"
        />

        {state.prizeTitle ? (
          <div className="flex items-center justify-center gap-2 sm:gap-4 w-full max-w-2xl mt-1">
            <div className="h-[2.5px] flex-1 max-w-[160px] bg-gradient-to-r from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_12px_#e60012]" />
            <span className="text-xs sm:text-base md:text-lg font-black uppercase tracking-[0.24em] text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              {state.prizeTitle}
            </span>
            <div className="h-[2.5px] flex-1 max-w-[160px] bg-gradient-to-l from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_12px_#e60012]" />
          </div>
        ) : null}
      </header>

      {/* MAIN CAROUSEL ROULETTE STAGE */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-7xl mx-auto px-2 sm:px-4 my-auto overflow-hidden">
        <RouletteLiveCarousel
          mode="fullscreen"
          state={state}
          onUpdateState={updateState}
          showSpinButton={false}
        />
      </main>

      {/* BOTTOM FOOTER */}
      <footer className="relative z-10 pb-2 sm:pb-3 pt-1 px-4 flex flex-col items-center justify-center shrink-0">
        <div className="flex items-center justify-center py-1 px-6">
          <img
            src="/logo-grupo-empresas-chilquinta-horizontal-white.png"
            alt="Grupo Empresas Chilquinta"
            className="h-6 sm:h-7 md:h-8 max-h-[32px] w-auto object-contain drop-shadow-[0_2px_12px_rgba(230,0,18,0.4)] select-none"
          />
        </div>
      </footer>
    </div>
  );
};

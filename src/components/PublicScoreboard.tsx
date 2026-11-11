import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  WifiOff,
  Maximize2,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';
import {
  computeEventRanking,
  formatMsToTime,
  formatScore,
  filterAndRankByDivision,
  formatTeamDivisionLabel,
} from '../utils/scoring';
import {
  DEFAULT_RANKING_COLUMNS,
  RankingRow,
  RankingTeamFilter,
  RankingVisibleColumns,
} from '../types/domain';

interface PublicScoreboardProps {
  onExitPublicView?: () => void;
}

const PAGE_INTERVAL_MS = 8000;
const ROWS_PER_PAGE = 10;

/**
 * Top White Drone + House/Power-Plug Hexagon Emblem from the "Rally Drone Race" Key Visual
 */
const RallyDroneHeaderEmblem: React.FC = () => (
  <div className="flex flex-col items-center select-none">
    <svg
      viewBox="0 0 360 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-60 sm:w-72 md:w-80 h-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
      aria-hidden="true"
    >
      {/* Left Propeller & Motor */}
      <rect x="18" y="25" width="76" height="4.5" rx="2.25" fill="#ffffff" />
      <rect x="49" y="29" width="14" height="7" rx="1.5" fill="#ffffff" />
      {/* Left Arm */}
      <path
        d="M52 36 L108 36 L142 46 L142 53 L103 44 L52 44 Z"
        fill="#ffffff"
      />
      <path
        d="M90 44 L104 54 L120 54 L112 44 Z"
        fill="#e2e8f0"
      />

      {/* Right Propeller & Motor */}
      <rect x="266" y="25" width="76" height="4.5" rx="2.25" fill="#ffffff" />
      <rect x="297" y="29" width="14" height="7" rx="1.5" fill="#ffffff" />
      {/* Right Arm */}
      <path
        d="M308 36 L252 36 L218 46 L218 53 L257 44 L308 44 Z"
        fill="#ffffff"
      />
      <path
        d="M270 44 L256 54 L240 54 L248 44 Z"
        fill="#e2e8f0"
      />

      {/* Center House / Hexagon Power-Plug Emblem */}
      <path
        d="M180 6 L214 31 V76 C214 80 211 83 207 83 H153 C149 83 146 80 146 76 V31 L180 6 Z"
        fill="#090a0f"
        stroke="#ffffff"
        strokeWidth="6.5"
        strokeLinejoin="round"
      />
      {/* Roof Peak Inner Detail */}
      <path
        d="M161 34 L180 19 L199 34"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner Power Plug & Cord Loop */}
      <path
        d="M165 44 V63 C165 70 171 74 178 74 H193"
        stroke="#ffffff"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      {/* Plug Body */}
      <rect x="173" y="42" width="18" height="14" rx="3" fill="#ffffff" />
      {/* Plug Prongs */}
      <line x1="178" y1="35" x2="178" y2="42" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      <line x1="186" y1="35" x2="186" y2="42" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    </svg>

    {/* » RALLY DRONE RACE « Subtitle */}
    <div className="flex items-center gap-2.5 -mt-1">
      <span className="text-[#ff1e1e] font-black text-xs sm:text-sm tracking-tighter leading-none drop-shadow-[0_0_8px_rgba(255,30,30,0.8)]">
        »»
      </span>
      <span className="text-white font-bold text-[11px] sm:text-xs md:text-sm tracking-[0.34em] uppercase">
        RALLY DRONE RACE
      </span>
      <span className="text-[#ff1e1e] font-black text-xs sm:text-sm tracking-tighter leading-none drop-shadow-[0_0_8px_rgba(255,30,30,0.8)]">
        ««
      </span>
    </div>
  </div>
);

/**
 * Red Chilquinta House/Plug Emblem for the bottom footer
 */
const ChilquintaFooterIcon: React.FC = () => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 drop-shadow-[0_0_10px_rgba(230,0,18,0.6)]"
    aria-hidden="true"
  >
    <path
      d="M32 6 L56 24 V54 C56 57 54 59 51 59 H13 C10 59 8 57 8 54 V24 L32 6 Z"
      stroke="#e60012"
      strokeWidth="5.5"
      strokeLinejoin="round"
      fill="#090a0f"
    />
    <path
      d="M20 27 L32 17 L44 27"
      stroke="#e60012"
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect x="25" y="31" width="14" height="11" rx="2.5" fill="#e60012" />
    <line x1="29" y1="25" x2="29" y2="31" stroke="#e60012" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="35" y1="25" x2="35" y2="31" stroke="#e60012" strokeWidth="3.5" strokeLinecap="round" />
    <path
      d="M21 34 V46 C21 50 24 52 29 52 H42"
      stroke="#e60012"
      strokeWidth="4.5"
      strokeLinecap="round"
    />
  </svg>
);

export const PublicScoreboard: React.FC<PublicScoreboardProps> = ({
  onExitPublicView,
}) => {
  const {
    activeEvent,
    tests,
    publicParticipants,
    publicResults,
    isOnline,
  } = useCompetition();

  const [currentPage, setCurrentPage] = useState<number>(0);

  const teamFilter: RankingTeamFilter =
    activeEvent.rankingTeamFilter || 'todos';

  // Resolve visible columns from Admin settings (with fallback to RankingViewMode)
  const visibleColumns: RankingVisibleColumns = useMemo(() => {
    const base: RankingVisibleColumns = {
      ...DEFAULT_RANKING_COLUMNS,
      ...(activeEvent.rankingVisibleColumns || {}),
    };
    if (
      activeEvent.rankingVisibleColumns === undefined &&
      activeEvent.rankingViewMode === 'detallado'
    ) {
      base.showTracksBreakdown = true;
    }
    return base;
  }, [activeEvent.rankingVisibleColumns, activeEvent.rankingViewMode]);

  // Cache last valid ranking so if connection drops, the giant TV screen retains the last ranking
  const cachedRankingRef = useRef<ReturnType<typeof computeEventRanking> | null>(null);

  const liveRanking = useMemo(() => {
    const computed = computeEventRanking({
      event: activeEvent,
      tests,
      participants: publicParticipants,
      results: publicResults,
    });
    if (isOnline || !cachedRankingRef.current) {
      cachedRankingRef.current = computed;
    }
    return isOnline ? computed : cachedRankingRef.current;
  }, [activeEvent, tests, publicParticipants, publicResults, isOnline]);

  // Helper to get total effective time across completed tests
  const getRowEffectiveTimeSummary = (row: RankingRow): number | null => {
    let sumMs = 0;
    let hasAnyTime = false;
    for (const t of tests) {
      const cell = row.testCells[t.id];
      if (cell && cell.status === 'completado' && cell.effectiveTimeMs !== null) {
        sumMs += cell.effectiveTimeMs;
        hasAnyTime = true;
      }
    }
    return hasAnyTime ? sumMs : null;
  };

  // Rows filtered and ranked strictly by Admin configuration
  const displayedRows: RankingRow[] = useMemo(() => {
    return filterAndRankByDivision(liveRanking.rows, teamFilter);
  }, [liveRanking.rows, teamFilter]);

  const totalPages = Math.max(1, Math.ceil(displayedRows.length / ROWS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((prev) => (prev >= totalPages ? 0 : prev));
  }, [totalPages]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, PAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    const start = currentPage * ROWS_PER_PAGE;
    return displayedRows.slice(start, start + ROWS_PER_PAGE);
  }, [displayedRows, currentPage]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Subtitle below RANKING GENERAL
  const subtitleLabel =
    teamFilter === 'distribucion'
      ? 'CLASIFICACIÓN • DISTRIBUCIÓN'
      : teamFilter === 'transmision'
      ? 'CLASIFICACIÓN • TRANSMISIÓN'
      : 'CLASIFICACIÓN';

  const hasCompetitorColumn =
    visibleColumns.showCompetitorNumber ||
    visibleColumns.showFullName ||
    visibleColumns.showTeamDivision ||
    visibleColumns.showCompany;

  return (
    <div
      onDoubleClick={handleToggleFullscreen}
      className="relative min-h-screen w-full bg-[#08090c] text-white flex flex-col justify-between overflow-hidden select-none font-sans"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 18%, rgba(220, 0, 18, 0.22) 0%, rgba(10, 11, 16, 0.92) 55%, #060709 100%),
          repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 2px, transparent 2px, transparent 8px)
        `,
      }}
    >
      {/* ===================================================================== */}
      {/* DECORATIVE KEY VISUAL HUD FRAME & CORNER BEVELS (1:1 WITH IMAGE)      */}
      {/* ===================================================================== */}

      {/* Subtle Large Watermark Hexagon on Right Background */}
      <svg
        viewBox="0 0 400 400"
        className="pointer-events-none fixed -right-24 top-1/2 -translate-y-1/2 w-[520px] h-[520px] opacity-[0.04]"
        fill="none"
      >
        <polygon
          points="200,20 370,115 370,285 200,380 30,285 30,115"
          stroke="#ffffff"
          strokeWidth="28"
          strokeLinejoin="round"
        />
      </svg>

      {/* Top Metallic Bar & Right Glowing Red Accent */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-14 z-0">
        {/* Top dark brushed steel bar */}
        <div
          className="w-full h-7 bg-gradient-to-b from-[#23252c] via-[#14161b] to-[#090a0d] border-b border-white/10"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 72% 100%, 69% 45%, 31% 45%, 28% 100%, 0 100%)',
          }}
        />
        {/* Right-side red neon bar from reference KV */}
        <div
          className="hidden sm:block absolute top-5 right-0 w-[30%] h-7 bg-gradient-to-r from-[#ff0015] via-[#d60012] to-[#5a0006] shadow-[0_0_25px_rgba(255,0,21,0.75)] border-y border-red-400/50"
          style={{
            clipPath: 'polygon(12% 0, 100% 0, 100% 100%, 0% 100%)',
          }}
        />
      </div>

      {/* Top-Left Beveled Corner Tech Shield */}
      <div className="pointer-events-none hidden md:block absolute top-4 left-3 w-48 h-52 z-0 opacity-90">
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
          {/* Glowing red trapezoid inside top-left shield */}
          <polygon
            points="92,88 135,88 94,142 64,142"
            fill="url(#tlRedGlow)"
          />
          <defs>
            <linearGradient id="tlRedGlow" x1="64" y1="88" x2="135" y2="142" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ff1e1e" />
              <stop offset="100%" stopColor="#7a0009" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Bottom-Right Beveled Corner Tech Shield */}
      <div className="pointer-events-none hidden md:block absolute bottom-4 right-3 w-48 h-52 z-0 opacity-90">
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
          {/* Glowing red trapezoid inside bottom-right shield */}
          <polygon
            points="118,142 75,142 116,88 146,88"
            fill="url(#brRedGlow)"
          />
          <defs>
            <linearGradient id="brRedGlow" x1="75" y1="88" x2="146" y2="142" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ff1e1e" />
              <stop offset="100%" stopColor="#7a0009" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Discreet Hover-Only Controls (Invisible during TV Broadcast) */}
      <div className="fixed top-2 right-3 z-50 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity duration-200">
        {!isOnline && (
          <div className="px-3 py-1 rounded-lg bg-rose-950/95 border border-rose-500 text-rose-200 text-xs font-extrabold flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            OFFLINE
          </div>
        )}
        <button
          type="button"
          onClick={handleToggleFullscreen}
          title="Pantalla Completa (o Doble Clic)"
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
      {/* TOP HEADER: DRONE LOGO + RANKING GENERAL + CLASIFICACIÓN              */}
      {/* ===================================================================== */}
      <header className="relative z-10 pt-3 sm:pt-4 px-4 flex flex-col items-center text-center">
        <RallyDroneHeaderEmblem />

        <h1
          className="mt-1 text-2xl sm:text-4xl md:text-5xl font-black italic uppercase tracking-wider text-white"
          style={{
            textShadow:
              '0 2px 0 #cbd5e1, 0 4px 14px rgba(0,0,0,0.95), 0 0 28px rgba(230,0,18,0.35)',
            letterSpacing: '0.06em',
          }}
        >
          RANKING GENERAL
        </h1>

        {/* — CLASIFICACIÓN — with flanking red bars */}
        <div className="flex items-center justify-center gap-3 sm:gap-5 w-full max-w-2xl mt-0.5">
          <div className="h-[3px] flex-1 max-w-[160px] bg-gradient-to-r from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_10px_#e60012]" />
          <span className="text-xs sm:text-sm md:text-base font-bold uppercase tracking-[0.28em] text-slate-200">
            {subtitleLabel}
          </span>
          <div className="h-[3px] flex-1 max-w-[160px] bg-gradient-to-l from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_10px_#e60012]" />
        </div>
      </header>

      {/* ===================================================================== */}
      {/* MAIN VERTICAL RANKING TABLE (TOP 1-3 HIGHLIGHTED VERTICALLY)          */}
      {/* ===================================================================== */}
      <main className="relative z-10 flex-1 flex flex-col justify-center w-full max-w-6xl mx-auto px-3 sm:px-8 md:px-14 my-2">
        <div
          className="w-full overflow-hidden shadow-[0_12px_50px_rgba(0,0,0,0.95)] border border-red-500/40 bg-[#0b0c10]/95"
          style={{
            clipPath:
              'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%, 0 14px)',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              {/* Crimson Beveled Header Bar */}
              <thead>
                <tr
                  className="text-white text-[11px] sm:text-xs md:text-sm font-extrabold uppercase tracking-wider border-b-2 border-[#ff3b3b]"
                  style={{
                    background:
                      'linear-gradient(90deg, #6e0007 0%, #c8000f 25%, #e60012 50%, #c8000f 75%, #6e0007 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 12px rgba(0,0,0,0.6)',
                  }}
                >
                  <th className="py-2.5 sm:py-3 px-3 sm:px-5 w-20 sm:w-24 text-center border-r border-white/15">
                    POS.
                  </th>

                  {hasCompetitorColumn && (
                    <th className="py-2.5 sm:py-3 px-4 sm:px-6 border-r border-white/15">
                      COMPETIDOR
                    </th>
                  )}

                  {visibleColumns.showTracksBreakdown &&
                    tests.map((t, idx) => (
                      <th
                        key={t.id}
                        className="py-2.5 sm:py-3 px-3 text-center border-r border-white/15"
                      >
                        P{idx + 1}: {t.name.split(' ')[0]}
                      </th>
                    ))}

                  {visibleColumns.showTotalTime && (
                    <th className="py-2.5 sm:py-3 px-3 sm:px-5 text-center border-r border-white/15">
                      TIEMPO TOTAL
                    </th>
                  )}

                  {visibleColumns.showPoints && (
                    <th className="py-2.5 sm:py-3 px-4 sm:px-6 text-center w-44 sm:w-56">
                      PUNTOS ACUMULADOS
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {paginatedRows.map((row) => {
                  const pos = row.position ?? 0;
                  const isTop1 = !row.isDisqualified && pos === 1;
                  const isTop2 = !row.isDisqualified && pos === 2;
                  const isTop3 = !row.isDisqualified && pos === 3;
                  const isTop3Row = isTop1 || isTop2 || isTop3;

                  const totalTimeMs = getRowEffectiveTimeSummary(row);
                  const formattedPos =
                    pos > 0 ? String(pos).padStart(2, '0') : '—';

                  // Row styling: Top 1 (Gold & Crimson Bevel), Top 2 (Silver Bevel), Top 3 (Bronze/Gold Bevel), 04+ (Carbon & Red Line)
                  const rowStyle: React.CSSProperties = isTop1
                    ? {
                        background:
                          'linear-gradient(90deg, rgba(230,0,18,0.48) 0%, rgba(245,158,11,0.34) 45%, rgba(230,0,18,0.42) 100%)',
                        boxShadow:
                          'inset 0 0 18px rgba(251,191,36,0.38), inset 0 2px 0 rgba(253,224,71,0.65), inset 0 -2px 0 rgba(251,191,36,0.55)',
                      }
                    : isTop2
                    ? {
                        background:
                          'linear-gradient(90deg, rgba(148,163,184,0.28) 0%, rgba(226,232,240,0.18) 50%, rgba(30,41,59,0.55) 100%)',
                        boxShadow:
                          'inset 0 0 14px rgba(226,232,240,0.25), inset 0 1.5px 0 rgba(241,245,249,0.55), inset 0 -1.5px 0 rgba(148,163,184,0.45)',
                      }
                    : isTop3
                    ? {
                        background:
                          'linear-gradient(90deg, rgba(217,119,6,0.32) 0%, rgba(180,83,9,0.22) 50%, rgba(69,26,3,0.55) 100%)',
                        boxShadow:
                          'inset 0 0 14px rgba(245,158,11,0.25), inset 0 1.5px 0 rgba(251,191,36,0.5), inset 0 -1.5px 0 rgba(217,119,6,0.45)',
                      }
                    : {
                        background:
                          pos % 2 === 0
                            ? 'linear-gradient(90deg, rgba(18,20,26,0.95) 0%, rgba(26,28,36,0.9) 50%, rgba(18,20,26,0.95) 100%)'
                            : 'linear-gradient(90deg, rgba(12,14,18,0.95) 0%, rgba(20,22,29,0.9) 50%, rgba(12,14,18,0.95) 100%)',
                      };

                  const cellPadding = isTop3Row
                    ? 'py-2.5 sm:py-3.5'
                    : 'py-1.5 sm:py-2';

                  return (
                    <tr
                      key={row.participantId}
                      style={rowStyle}
                      className={`border-b transition-colors ${
                        isTop1
                          ? 'border-amber-400/80'
                          : isTop2
                          ? 'border-slate-300/60'
                          : isTop3
                          ? 'border-amber-600/70'
                          : 'border-[#e60012]/45'
                      }`}
                    >
                      {/* POS. COLUMN */}
                      <td
                        className={`${cellPadding} px-3 sm:px-5 text-center border-r border-white/10 font-mono`}
                      >
                        {row.isDisqualified ? (
                          <span className="inline-block px-2.5 py-0.5 rounded bg-rose-600 text-white font-black text-xs sm:text-sm">
                            DQ
                          </span>
                        ) : isTop3Row ? (
                          <div className="inline-flex items-center justify-center">
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded font-black tracking-tighter ${
                                isTop1
                                  ? 'text-xl sm:text-2xl md:text-3xl bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600 text-slate-950 shadow-[0_0_16px_rgba(251,191,36,0.8)] border border-yellow-200'
                                  : isTop2
                                  ? 'text-lg sm:text-xl md:text-2xl bg-gradient-to-b from-white via-slate-200 to-slate-400 text-slate-950 shadow-[0_0_12px_rgba(226,232,240,0.6)] border border-white'
                                  : 'text-lg sm:text-xl md:text-2xl bg-gradient-to-b from-amber-300 via-amber-500 to-amber-800 text-slate-950 shadow-[0_0_12px_rgba(217,119,6,0.6)] border border-amber-300'
                              }`}
                            >
                              {formattedPos}
                            </span>
                          </div>
                        ) : (
                          <span className="text-base sm:text-lg md:text-xl font-extrabold text-white tracking-tight">
                            {formattedPos}
                          </span>
                        )}
                      </td>

                      {/* COMPETIDOR COLUMN (Dynamic Sub-filters from Admin) */}
                      {hasCompetitorColumn && (
                        <td
                          className={`${cellPadding} px-4 sm:px-6 border-r border-white/10`}
                        >
                          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                            {visibleColumns.showCompetitorNumber && (
                              <span
                                className={`font-mono font-extrabold px-2 py-0.5 rounded border ${
                                  isTop1
                                    ? 'bg-amber-400/20 border-amber-300 text-amber-200 text-xs sm:text-sm'
                                    : isTop2
                                    ? 'bg-slate-200/20 border-slate-300 text-slate-100 text-xs sm:text-sm'
                                    : isTop3
                                    ? 'bg-amber-600/25 border-amber-400 text-amber-200 text-xs sm:text-sm'
                                    : 'bg-white/5 border-white/15 text-red-300 text-xs'
                                }`}
                              >
                                {row.competitorNumber || row.participantId}
                              </span>
                            )}

                            {visibleColumns.showFullName && (
                              <span
                                className={`font-extrabold tracking-tight ${
                                  isTop1
                                    ? 'text-lg sm:text-2xl md:text-[26px] text-amber-100 drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)]'
                                    : isTop2
                                    ? 'text-base sm:text-xl md:text-2xl text-white drop-shadow-[0_2px_6px_rgba(255,255,255,0.35)]'
                                    : isTop3
                                    ? 'text-base sm:text-xl md:text-2xl text-amber-100 drop-shadow-[0_2px_6px_rgba(217,119,6,0.4)]'
                                    : 'text-sm sm:text-lg md:text-xl text-white'
                                }`}
                              >
                                {row.fullName}
                              </span>
                            )}

                            {visibleColumns.showTeamDivision && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-black uppercase tracking-wider border ${
                                  row.teamDivision === 'transmision'
                                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50'
                                    : 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                                }`}
                              >
                                {formatTeamDivisionLabel(row.teamDivision)}
                              </span>
                            )}

                            {visibleColumns.showCompany && row.companyOrTeam && (
                              <span
                                className={`font-semibold ${
                                  isTop3Row
                                    ? 'text-xs sm:text-sm text-slate-200'
                                    : 'text-xs text-slate-400'
                                }`}
                              >
                                • {row.companyOrTeam}
                              </span>
                            )}

                            {row.hasPendingTie && (
                              <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Empate
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* OPTIONAL TRACKS BREAKDOWN COLUMNS (P1, P2, P3) */}
                      {visibleColumns.showTracksBreakdown &&
                        tests.map((t) => {
                          const cell = row.testCells[t.id];
                          return (
                            <td
                              key={t.id}
                              className={`${cellPadding} px-2.5 sm:px-3 text-center border-r border-white/10 font-mono`}
                            >
                              {cell && cell.status === 'completado' ? (
                                <div className="leading-tight">
                                  <div
                                    className={`font-black ${
                                      isTop3Row
                                        ? 'text-xs sm:text-sm text-amber-300'
                                        : 'text-xs text-white'
                                    }`}
                                  >
                                    {formatScore(cell.contribution)}
                                  </div>
                                  {cell.effectiveTimeMs !== null && (
                                    <div className="text-[10px] sm:text-[11px] text-slate-300">
                                      {formatMsToTime(cell.effectiveTimeMs)}
                                    </div>
                                  )}
                                </div>
                              ) : cell?.status === 'dq' || cell?.status === 'dnf' ? (
                                <span className="text-[11px] font-black text-rose-400 uppercase">
                                  {cell.status}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500 font-bold">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}

                      {/* TIEMPO TOTAL COLUMN */}
                      {visibleColumns.showTotalTime && (
                        <td
                          className={`${cellPadding} px-3 sm:px-5 text-center border-r border-white/10 font-mono`}
                        >
                          <span
                            className={`font-bold ${
                              isTop1
                                ? 'text-base sm:text-xl md:text-2xl text-amber-200'
                                : isTop2
                                ? 'text-sm sm:text-lg md:text-xl text-slate-100'
                                : isTop3
                                ? 'text-sm sm:text-lg md:text-xl text-amber-200'
                                : 'text-xs sm:text-base md:text-lg text-slate-200'
                            }`}
                          >
                            {totalTimeMs !== null ? formatMsToTime(totalTimeMs) : '—'}
                          </span>
                        </td>
                      )}

                      {/* PUNTOS ACUMULADOS COLUMN */}
                      {visibleColumns.showPoints && (
                        <td
                          className={`${cellPadding} px-4 sm:px-6 text-center font-mono`}
                        >
                          <span
                            className={`font-black tracking-tight ${
                              isTop1
                                ? 'text-xl sm:text-2xl md:text-3xl text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.75)]'
                                : isTop2
                                ? 'text-lg sm:text-xl md:text-2xl text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]'
                                : isTop3
                                ? 'text-lg sm:text-xl md:text-2xl text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.55)]'
                                : 'text-base sm:text-lg md:text-xl text-white'
                            }`}
                          >
                            {formatScore(row.totalContribution)}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ===================================================================== */}
      {/* BOTTOM FOOTER: LEFT RED BAR + GRUPO EMPRESAS CHILQUINTA               */}
      {/* ===================================================================== */}
      <footer className="relative z-10 pb-3 sm:pb-4 pt-1 px-4 flex flex-col items-center justify-center">
        {/* Left Glowing Red Bar + Hazard Stripes from Key Visual */}
        <div
          className="pointer-events-none hidden sm:block absolute bottom-3 left-0 w-[30%] h-7 bg-gradient-to-r from-[#5a0006] via-[#e60012] to-[#ff1e1e] shadow-[0_0_25px_rgba(255,0,21,0.75)] border-y border-red-400/50"
          style={{
            clipPath: 'polygon(0 0, 88% 0, 100% 100%, 0% 100%)',
          }}
        />

        {/* Centered Grupo Empresas CHILQUINTA Branding */}
        <div className="relative z-10 flex items-center justify-center gap-2.5 sm:gap-3 py-1 px-6">
          <span className="text-sm sm:text-base md:text-lg font-medium text-slate-200 tracking-wide">
            Grupo Empresas
          </span>
          <ChilquintaFooterIcon />
          <span className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-wider text-white">
            CHILQUINTA
          </span>
        </div>

        {/* Subtle Page Indicator Dots (Only shown if > 1 page, zero buttons) */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {Array.from({ length: totalPages }).map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentPage
                    ? 'w-6 bg-[#e60012] shadow-[0_0_8px_#e60012]'
                    : 'w-1.5 bg-white/25'
                }`}
              />
            ))}
          </div>
        )}
      </footer>
    </div>
  );
};

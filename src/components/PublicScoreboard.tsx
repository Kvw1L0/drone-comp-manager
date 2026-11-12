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

  // Check if URL explicitly forces the split-screen Podium view (?vista=podio or ?podio)
  const isUrlPodiumForced = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('vista') === 'podio' ||
      params.get('pantalla') === 'podio' ||
      params.get('podio') !== null
    );
  }, []);

  const showSplitTeamPodium =
    Boolean(activeEvent.showTeamPodiumOverlay) || isUrlPodiumForced;

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

  // Rows filtered by Admin configuration; `row.position` ALWAYS holds the General Tournament Position!
  const displayedRows: RankingRow[] = useMemo(() => {
    return filterAndRankByDivision(liveRanking.rows, teamFilter);
  }, [liveRanking.rows, teamFilter]);

  // Top 6 winners per team for the Split-Screen Podium (1x 1°, 2x 2°, 3x 3°)
  const distribucionWinners = useMemo(() => {
    return filterAndRankByDivision(liveRanking.rows, 'distribucion')
      .filter((r) => !r.isDisqualified && r.completedTestsCount > 0)
      .slice(0, 6);
  }, [liveRanking.rows]);

  const transmisionWinners = useMemo(() => {
    return filterAndRankByDivision(liveRanking.rows, 'transmision')
      .filter((r) => !r.isDisqualified && r.completedTestsCount > 0)
      .slice(0, 6);
  }, [liveRanking.rows]);

  const totalPages = Math.max(1, Math.ceil(displayedRows.length / ROWS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((prev) => (prev >= totalPages ? 0 : prev));
  }, [totalPages]);

  useEffect(() => {
    if (totalPages <= 1 || showSplitTeamPodium) return;
    const timer = window.setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, PAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [totalPages, showSplitTeamPodium]);

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

  // Subtitle below main header
  const subtitleLabel = showSplitTeamPodium
    ? 'PODIO OFICIAL POR EQUIPOS • DISTRIBUCIÓN & TRANSMISIÓN'
    : teamFilter === 'distribucion'
    ? 'CLASIFICACIÓN • DISTRIBUCIÓN'
    : teamFilter === 'transmision'
    ? 'CLASIFICACIÓN • TRANSMISIÓN'
    : 'CLASIFICACIÓN';

  const hasCompetitorColumn =
    visibleColumns.showCompetitorNumber ||
    visibleColumns.showFullName ||
    visibleColumns.showTeamDivision ||
    visibleColumns.showCompany;

  // Helper to render one side of the Split-Screen Team Podium (1x 1°, 2x 2°, 3x 3°)
  const renderTeamPodiumColumn = (
    divisionKey: 'distribucion' | 'transmision',
    winners: RankingRow[]
  ) => {
    const isTrans = divisionKey === 'transmision';
    const title = isTrans ? 'EQUIPO TRANSMISIÓN' : 'EQUIPO DISTRIBUCIÓN';
    const headerGrad = isTrans
      ? 'linear-gradient(90deg, #064e63 0%, #0891b2 50%, #064e63 100%)'
      : 'linear-gradient(90deg, #78350f 0%, #d97706 50%, #78350f 100%)';
    const borderAccent = isTrans ? 'border-cyan-400/70' : 'border-amber-400/70';

    return (
      <div
        className={`flex flex-col overflow-hidden shadow-[0_16px_55px_rgba(0,0,0,0.96)] border-2 ${borderAccent} bg-[#0b0c10]/95`}
        style={{
          clipPath:
            'polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px)',
        }}
      >
        {/* Team Header Bar */}
        <div
          className="py-3 sm:py-3.5 md:py-4 px-5 sm:px-6 text-center border-b-2 border-white/25 flex items-center justify-center"
          style={{
            background: headerGrad,
            boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.4), 0 4px 14px rgba(0,0,0,0.6)',
          }}
        >
          <span className="text-xl sm:text-2xl md:text-3xl lg:text-[32px] font-black uppercase tracking-wider text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {isTrans ? '⚡ ' : '🏅 '}
            {title}
          </span>
        </div>

        {/* Subheader */}
        <div className="grid grid-cols-12 bg-[#14161d] border-b border-red-500/40 text-xs sm:text-sm md:text-base font-black uppercase tracking-wider text-slate-300 py-2 px-4 sm:px-6">
          <div className="col-span-3 text-center">PREMIO</div>
          <div className="col-span-6">PILOTO PREMIADO</div>
          <div className="col-span-3 text-right pr-2">PTS / TIEMPO</div>
        </div>

        {/* 6 Podium Slots: 1st (1), 2nd (2), 3rd (3) */}
        <div className="divide-y divide-white/10">
          {[0, 1, 2, 3, 4, 5].map((slotIdx) => {
            const row = winners[slotIdx];
            const awardTier: 1 | 2 | 3 = slotIdx === 0 ? 1 : slotIdx <= 2 ? 2 : 3;
            const isTier1 = awardTier === 1;
            const isTier2 = awardTier === 2;

            const rowStyle: React.CSSProperties = isTier1
              ? {
                  background:
                    'linear-gradient(90deg, rgba(230,0,18,0.58) 0%, rgba(245,158,11,0.45) 50%, rgba(230,0,18,0.48) 100%)',
                  boxShadow:
                    'inset 0 0 24px rgba(251,191,36,0.5), inset 0 2px 0 rgba(253,224,71,0.85), inset 0 -2px 0 rgba(251,191,36,0.7)',
                }
              : isTier2
              ? {
                  background:
                    'linear-gradient(90deg, rgba(148,163,184,0.35) 0%, rgba(226,232,240,0.25) 50%, rgba(30,41,59,0.7) 100%)',
                  boxShadow:
                    'inset 0 0 18px rgba(226,232,240,0.32), inset 0 1.5px 0 rgba(241,245,249,0.65)',
                }
              : {
                  background:
                    'linear-gradient(90deg, rgba(217,119,6,0.38) 0%, rgba(180,83,9,0.26) 50%, rgba(69,26,3,0.7) 100%)',
                  boxShadow:
                    'inset 0 0 16px rgba(245,158,11,0.3), inset 0 1.5px 0 rgba(251,191,36,0.55)',
                };

            const totalTimeMs = row ? getRowEffectiveTimeSummary(row) : null;

            return (
              <div
                key={row ? row.participantId : `empty-${slotIdx}`}
                style={rowStyle}
                className={`grid grid-cols-12 items-center px-4 sm:px-6 transition-colors ${
                  isTier1 ? 'py-3.5 sm:py-4 md:py-4.5' : 'py-2.5 sm:py-3.5 md:py-3.5'
                }`}
              >
                {/* PREMIO BADGE (1° LUGAR, 2° LUGAR, 3° LUGAR) */}
                <div className="col-span-3 flex flex-col items-center justify-center pr-3 border-r border-white/15">
                  <span
                    className={`inline-flex items-center justify-center px-3 sm:px-4 py-1 rounded font-black uppercase tracking-tight leading-none ${
                      isTier1
                        ? 'text-lg sm:text-2xl md:text-3xl lg:text-[28px] bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-600 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.9)] border-2 border-yellow-100'
                        : isTier2
                        ? 'text-base sm:text-xl md:text-2xl lg:text-[24px] bg-gradient-to-b from-white via-slate-200 to-slate-400 text-slate-950 shadow-[0_0_14px_rgba(226,232,240,0.65)] border border-white'
                        : 'text-base sm:text-xl md:text-2xl lg:text-[24px] bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-slate-950 shadow-[0_0_14px_rgba(217,119,6,0.65)] border border-amber-200'
                    }`}
                  >
                    {awardTier}° LUGAR
                  </span>
                  {row?.position && (
                    <span className="text-xs sm:text-sm md:text-base font-bold text-amber-200 mt-1">
                      #{String(row.position).padStart(2, '0')} General
                    </span>
                  )}
                </div>

                {/* PILOT INFO */}
                <div className="col-span-6 pl-4 sm:pl-5 pr-2 min-w-0">
                  {row ? (
                    <div className="flex flex-col min-w-0 justify-center">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-black/60 border border-white/30 text-amber-200 font-black text-xs sm:text-base md:text-lg shrink-0">
                          {row.competitorNumber}
                        </span>
                        <span
                          className={`font-black uppercase truncate leading-tight ${
                            isTier1
                              ? 'text-xl sm:text-2xl md:text-3xl lg:text-[32px] text-amber-100 drop-shadow-[0_2px_10px_rgba(251,191,36,0.7)]'
                              : isTier2
                              ? 'text-lg sm:text-xl md:text-2xl lg:text-[28px] text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.4)]'
                              : 'text-base sm:text-xl md:text-2xl lg:text-[26px] text-amber-100'
                          }`}
                        >
                          {row.fullName}
                        </span>
                      </div>
                      {row.companyOrTeam && (
                        <span className="text-xs sm:text-sm md:text-base font-bold uppercase text-slate-300 truncate mt-0.5 pl-0.5">
                          {row.companyOrTeam}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm sm:text-base md:text-lg font-bold text-slate-400 uppercase tracking-wide">
                      Vacante por definir
                    </span>
                  )}
                </div>

                {/* SCORE & TIME */}
                <div className="col-span-3 text-right pr-2">
                  {row ? (
                    <div className="leading-tight flex flex-col items-end">
                      <div
                        className={`font-black leading-none ${
                          isTier1
                            ? 'text-2xl sm:text-3xl md:text-4xl lg:text-[40px] text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.85)]'
                            : isTier2
                            ? 'text-xl sm:text-2xl md:text-3xl lg:text-[34px] text-white'
                            : 'text-xl sm:text-2xl md:text-3xl lg:text-[34px] text-amber-300'
                        }`}
                      >
                        {formatScore(row.totalContribution)}
                      </div>
                      <div className="text-xs sm:text-sm md:text-base font-bold text-slate-200 mt-1 font-mono">
                        {totalTimeMs !== null ? formatMsToTime(totalTimeMs) : '—'}
                      </div>
                    </div>
                  ) : (
                    <span className="text-base sm:text-lg font-bold text-slate-500">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      onDoubleClick={handleToggleFullscreen}
      className="font-broadcast-narrow relative h-screen h-[100dvh] max-h-screen w-full bg-[#08090c] text-white flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 18%, rgba(220, 0, 18, 0.22) 0%, rgba(10, 11, 16, 0.92) 55%, #060709 100%),
          repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 2px, transparent 2px, transparent 8px)
        `,
      }}
    >
      {/* ===================================================================== */}
      {/* DECORATIVE KEY VISUAL HUD FRAME & CORNER BEVELS                       */}
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
      {/* TOP HEADER: OFFICIAL UPLOADED LOGO + RANKING GENERAL / PODIO EQUIPOS  */}
      {/* ===================================================================== */}
      <header className="relative z-10 pt-1.5 sm:pt-2 px-4 flex flex-col items-center text-center shrink-0">
        <img
          src="/rally-drone-logo.png"
          alt="The First Grid Rally Drone Race of Chile"
          className="h-12 sm:h-16 md:h-20 max-h-[82px] w-auto object-contain drop-shadow-[0_4px_16px_rgba(230,0,18,0.65)] select-none"
        />

        <h1
          className="mt-0.5 text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black italic uppercase tracking-wider text-white leading-none drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]"
          style={{
            letterSpacing: '0.04em',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'geometricPrecision',
          }}
        >
          {showSplitTeamPodium ? 'PODIO POR EQUIPOS' : 'RANKING GENERAL'}
        </h1>

        {/* — CLASIFICACIÓN — with flanking red bars */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 w-full max-w-3xl mt-0.5">
          <div className="h-[2.5px] flex-1 max-w-[150px] bg-gradient-to-r from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_10px_#e60012]" />
          <span className="text-xs sm:text-base md:text-lg font-black uppercase tracking-[0.24em] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {subtitleLabel}
          </span>
          <div className="h-[2.5px] flex-1 max-w-[150px] bg-gradient-to-l from-transparent via-[#e60012] to-[#ff2a2a] shadow-[0_0_10px_#e60012]" />
        </div>
      </header>

      {/* ===================================================================== */}
      {/* MAIN BODY: EITHER SPLIT-SCREEN TEAM PODIUM OR GENERAL RANKING TABLE   */}
      {/* ===================================================================== */}
      {showSplitTeamPodium ? (
        <main className="relative z-10 flex-1 min-h-0 flex flex-col justify-center w-full max-w-[98vw] 2xl:max-w-[99vw] mx-auto px-2 sm:px-4 md:px-6 my-1 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-7 items-stretch w-full">
            {renderTeamPodiumColumn('distribucion', distribucionWinners)}
            {renderTeamPodiumColumn('transmision', transmisionWinners)}
          </div>
        </main>
      ) : (
        <main className="relative z-10 flex-1 min-h-0 flex flex-col justify-center w-full max-w-6xl mx-auto px-2 sm:px-6 md:px-10 my-1 overflow-hidden">
          <div
            className="w-full overflow-hidden shadow-[0_14px_55px_rgba(0,0,0,0.96)] border-2 border-red-500/55 bg-[#0b0c10]/95"
            style={{
              clipPath:
                'polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                {/* Crimson Beveled Header Bar */}
                <thead>
                  <tr
                    className="text-white text-sm sm:text-base md:text-xl font-black uppercase tracking-wider border-b-2 border-[#ff3b3b]"
                    style={{
                      background:
                        'linear-gradient(90deg, #6e0007 0%, #c8000f 25%, #e60012 50%, #c8000f 75%, #6e0007 100%)',
                      boxShadow:
                        'inset 0 1.5px 0 rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.6)',
                    }}
                  >
                    <th className="py-2.5 sm:py-3 px-3 sm:px-5 w-24 sm:w-28 text-center border-r border-white/20">
                      POS.
                    </th>

                    {hasCompetitorColumn && (
                      <th className="py-2.5 sm:py-3 px-4 sm:px-6 border-r border-white/20">
                        COMPETIDOR
                      </th>
                    )}

                    {visibleColumns.showTracksBreakdown &&
                      tests.map((t, idx) => (
                        <th
                          key={t.id}
                          className="py-2.5 sm:py-3 px-2.5 text-center border-r border-white/20"
                        >
                          P{idx + 1}:{' '}
                          {t.name.replace(/^Pista\s*\d+\s*-\s*/i, '').split(' ')[0]}
                        </th>
                      ))}

                    {visibleColumns.showTotalTime && (
                      <th className="py-2.5 sm:py-3 px-3 sm:px-5 text-center border-r border-white/20">
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
                    // Always use the pilot's General Tournament Position (`row.position`)
                    const generalPos = row.position ?? 0;

                    const isTop1 = !row.isDisqualified && generalPos === 1;
                    const isTop2 = !row.isDisqualified && generalPos === 2;
                    const isTop3 = !row.isDisqualified && generalPos === 3;
                    const isTop3GeneralRow = isTop1 || isTop2 || isTop3;

                    const totalTimeMs = getRowEffectiveTimeSummary(row);
                    const formattedPos =
                      generalPos > 0 ? String(generalPos).padStart(2, '0') : '—';

                    // Row styling: Top 1, 2, 3 General (Larger, beveled & golden/metallic) vs regular rows
                    const rowStyle: React.CSSProperties = isTop1
                      ? {
                          background:
                            'linear-gradient(90deg, rgba(230,0,18,0.52) 0%, rgba(245,158,11,0.40) 45%, rgba(230,0,18,0.45) 100%)',
                          boxShadow:
                            'inset 0 0 22px rgba(251,191,36,0.45), inset 0 2px 0 rgba(253,224,71,0.75), inset 0 -2px 0 rgba(251,191,36,0.65)',
                        }
                      : isTop2
                      ? {
                          background:
                            'linear-gradient(90deg, rgba(245,158,11,0.28) 0%, rgba(226,232,240,0.24) 50%, rgba(30,41,59,0.65) 100%)',
                          boxShadow:
                            'inset 0 0 16px rgba(251,191,36,0.30), inset 0 2px 0 rgba(253,224,71,0.55), inset 0 -2px 0 rgba(226,232,240,0.45)',
                        }
                      : isTop3
                      ? {
                          background:
                            'linear-gradient(90deg, rgba(217,119,6,0.36) 0%, rgba(180,83,9,0.25) 50%, rgba(69,26,3,0.60) 100%)',
                          boxShadow:
                            'inset 0 0 16px rgba(245,158,11,0.30), inset 0 1.5px 0 rgba(251,191,36,0.55), inset 0 -1.5px 0 rgba(217,119,6,0.50)',
                        }
                      : {
                          background:
                            generalPos % 2 === 0
                              ? 'linear-gradient(90deg, rgba(18,20,26,0.96) 0%, rgba(26,28,36,0.92) 50%, rgba(18,20,26,0.96) 100%)'
                              : 'linear-gradient(90deg, rgba(12,14,18,0.96) 0%, rgba(20,22,29,0.92) 50%, rgba(12,14,18,0.96) 100%)',
                        };

                    const cellPadding = isTop3GeneralRow
                      ? 'py-1.5 sm:py-2 md:py-2.5'
                      : 'py-1 sm:py-1.5 md:py-2';

                    return (
                      <tr
                        key={row.participantId}
                        style={rowStyle}
                        className={`border-b transition-colors ${
                          isTop1
                            ? 'border-amber-400/90'
                            : isTop2
                            ? 'border-amber-300/70'
                            : isTop3
                            ? 'border-amber-500/75'
                            : 'border-[#e60012]/50'
                        }`}
                      >
                        {/* POS. GENERAL EN EL CERTAMEN */}
                        <td
                          className={`${cellPadding} px-3 sm:px-5 text-center border-r border-white/15`}
                        >
                          {row.isDisqualified ? (
                            <span className="inline-block px-2.5 py-0.5 rounded bg-rose-600 text-white font-black text-sm sm:text-base">
                              DQ
                            </span>
                          ) : isTop3GeneralRow ? (
                            <div className="inline-flex flex-col items-center justify-center">
                              <span
                                className={`inline-flex items-center justify-center px-3 py-0.5 rounded font-black tracking-tight leading-none ${
                                  isTop1
                                    ? 'text-2xl sm:text-3xl md:text-4xl bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-600 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.85)] border-2 border-yellow-100'
                                    : isTop2
                                    ? 'text-xl sm:text-2xl md:text-3xl bg-gradient-to-b from-yellow-100 via-amber-300 to-amber-500 text-slate-950 shadow-[0_0_14px_rgba(251,191,36,0.65)] border border-yellow-100'
                                    : 'text-xl sm:text-2xl md:text-3xl bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-slate-950 shadow-[0_0_14px_rgba(217,119,6,0.65)] border border-amber-200'
                                }`}
                              >
                                {formattedPos}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xl sm:text-2xl md:text-[26px] font-black text-white tracking-tight leading-none">
                              {formattedPos}
                            </span>
                          )}
                        </td>

                        {/* COMPETIDOR COLUMN (Dynamic Sub-filters from Admin, NO relative group position) */}
                        {hasCompetitorColumn && (
                          <td
                            className={`${cellPadding} px-4 sm:px-6 border-r border-white/15`}
                          >
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                              {visibleColumns.showCompetitorNumber && (
                                <span
                                  className={`font-black px-2 py-0.5 rounded border leading-none ${
                                    isTop1
                                      ? 'bg-amber-400/25 border-amber-300 text-amber-200 text-sm sm:text-lg'
                                      : isTop2
                                      ? 'bg-amber-400/20 border-amber-300/80 text-amber-100 text-sm sm:text-base'
                                      : isTop3
                                      ? 'bg-amber-600/25 border-amber-400 text-amber-200 text-sm sm:text-base'
                                      : 'bg-white/10 border-white/20 text-red-300 text-sm sm:text-base'
                                  }`}
                                >
                                  {row.competitorNumber || row.participantId}
                                </span>
                              )}

                              {visibleColumns.showFullName && (
                                <span
                                  className={`font-black uppercase tracking-wide leading-tight ${
                                    isTop1
                                      ? 'text-xl sm:text-3xl md:text-[32px] text-amber-100 drop-shadow-[0_2px_10px_rgba(251,191,36,0.6)]'
                                      : isTop2
                                      ? 'text-lg sm:text-2xl md:text-[28px] text-white drop-shadow-[0_2px_8px_rgba(251,191,36,0.45)]'
                                      : isTop3
                                      ? 'text-lg sm:text-2xl md:text-[26px] text-amber-100 drop-shadow-[0_2px_8px_rgba(217,119,6,0.45)]'
                                      : 'text-lg sm:text-xl md:text-2xl text-white'
                                  }`}
                                >
                                  {row.fullName}
                                </span>
                              )}

                              {visibleColumns.showTeamDivision && (
                                <span
                                  className={`px-2 py-0.5 rounded text-xs sm:text-sm font-black uppercase tracking-wider border ${
                                    row.teamDivision === 'transmision'
                                      ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/60'
                                      : 'bg-amber-500/25 text-amber-200 border-amber-400/60'
                                  }`}
                                >
                                  {formatTeamDivisionLabel(row.teamDivision)}
                                </span>
                              )}

                              {visibleColumns.showCompany && row.companyOrTeam && (
                                <span
                                  className={`font-bold uppercase tracking-wide ${
                                    isTop3GeneralRow
                                      ? 'text-sm sm:text-base md:text-lg text-amber-200/90'
                                      : 'text-xs sm:text-sm md:text-base text-slate-300'
                                  }`}
                                >
                                  • {row.companyOrTeam}
                                </span>
                              )}

                              {row.hasPendingTie && (
                                <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Empate
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* OPTIONAL TRACKS BREAKDOWN COLUMNS (P1 to P5) */}
                        {visibleColumns.showTracksBreakdown &&
                          tests.map((t) => {
                            const cell = row.testCells[t.id];
                            return (
                              <td
                                key={t.id}
                                className={`${cellPadding} px-2.5 sm:px-3 text-center border-r border-white/15`}
                              >
                                {cell && cell.status === 'completado' ? (
                                  <div className="leading-tight">
                                    <div
                                      className={`font-black ${
                                        isTop3GeneralRow
                                          ? 'text-sm sm:text-base md:text-lg text-amber-300'
                                          : 'text-sm sm:text-base text-white'
                                      }`}
                                    >
                                      {formatScore(cell.contribution)}
                                    </div>
                                    {cell.effectiveTimeMs !== null && (
                                      <div className="text-xs sm:text-sm font-bold text-slate-300">
                                        {formatMsToTime(cell.effectiveTimeMs)}
                                      </div>
                                    )}
                                  </div>
                                ) : cell?.status === 'dq' || cell?.status === 'dnf' ? (
                                  <span className="text-xs sm:text-sm font-black text-rose-400 uppercase">
                                    {cell.status}
                                  </span>
                                ) : (
                                  <span className="text-xs sm:text-sm text-slate-500 font-bold">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}

                        {/* TIEMPO TOTAL COLUMN */}
                        {visibleColumns.showTotalTime && (
                          <td
                            className={`${cellPadding} px-3 sm:px-5 text-center border-r border-white/15`}
                          >
                            <span
                              className={`font-black tracking-wide ${
                                isTop1
                                  ? 'text-lg sm:text-2xl md:text-[26px] text-amber-200'
                                  : isTop2
                                  ? 'text-base sm:text-xl md:text-2xl text-white'
                                  : isTop3
                                  ? 'text-base sm:text-xl md:text-2xl text-amber-200'
                                  : 'text-base sm:text-lg md:text-xl text-slate-200'
                              }`}
                            >
                              {totalTimeMs !== null ? formatMsToTime(totalTimeMs) : '—'}
                            </span>
                          </td>
                        )}

                        {/* PUNTOS ACUMULADOS COLUMN */}
                        {visibleColumns.showPoints && (
                          <td
                            className={`${cellPadding} px-4 sm:px-6 text-center`}
                          >
                            <span
                              className={`font-black tracking-wide leading-none ${
                                isTop1
                                  ? 'text-2xl sm:text-3xl md:text-4xl text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.85)]'
                                  : isTop2
                                  ? 'text-xl sm:text-2xl md:text-3xl text-white drop-shadow-[0_0_12px_rgba(251,191,36,0.55)]'
                                  : isTop3
                                  ? 'text-xl sm:text-2xl md:text-3xl text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.65)]'
                                  : 'text-xl sm:text-2xl md:text-[26px] text-white'
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
      )}

      {/* ===================================================================== */}
      {/* BOTTOM FOOTER: OFFICIAL UPLOADED LOGO GRUPO EMPRESAS CHILQUINTA        */}
      {/* ===================================================================== */}
      <footer className="relative z-10 pb-2 sm:pb-2.5 pt-0.5 px-4 flex flex-col items-center justify-center shrink-0">
        <div className="relative z-10 flex items-center justify-center py-1 px-6">
          <img
            src="/logo-grupo-empresas-chilquinta-horizontal-white.png"
            alt="Grupo Empresas Chilquinta"
            className="h-8 sm:h-9 md:h-11 max-h-[44px] w-auto object-contain drop-shadow-[0_2px_12px_rgba(230,0,18,0.4)] select-none"
          />
        </div>

        {!showSplitTeamPodium && totalPages > 1 && (
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

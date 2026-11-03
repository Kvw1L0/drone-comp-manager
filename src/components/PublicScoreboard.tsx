import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ArrowLeft,
  LayoutList,
  Table2,
  Timer,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';
import {
  compareFloats,
  computeEventRanking,
  formatMsToTime,
  formatScore,
} from '../utils/scoring';
import { RankingRow, RankingViewMode } from '../types/domain';
import { BrandLogo } from './BrandLogo';

interface PublicScoreboardProps {
  onExitPublicView?: () => void;
}

const PAGE_INTERVAL_MS = 8000;

export const PublicScoreboard: React.FC<PublicScoreboardProps> = ({
  onExitPublicView,
}) => {
  const {
    activeEvent,
    tests,
    publicParticipants,
    publicResults,
    isOnline,
    lastSyncTimestamp,
    setEventRankingViewMode,
  } = useCompetition();

  const [viewFilter, setViewFilter] = useState<'general' | string>('general');
  const [autoPage, setAutoPage] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(0);

  const rankingViewMode: RankingViewMode =
    activeEvent.rankingViewMode || 'detallado';

  const rowsPerPage = rankingViewMode === 'resumen' ? 12 : 9;

  // Cache last valid ranking so if connection drops, the giant screen retains the last ranking
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

  // Helper to get total effective time across completed tests (or for selected test filter)
  const getRowEffectiveTimeSummary = (row: RankingRow): number | null => {
    if (viewFilter !== 'general') {
      const cell = row.testCells[viewFilter];
      return cell && cell.status === 'completado' ? cell.effectiveTimeMs : null;
    }
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

  // Sort rows either by General Ranking or by a specific Test
  const displayedRows: RankingRow[] = useMemo(() => {
    if (viewFilter === 'general') {
      return liveRanking.rows;
    }

    const targetTest = tests.find((t) => t.id === viewFilter);
    if (!targetTest) return liveRanking.rows;

    const eligible = liveRanking.rows.filter((r) => !r.isDisqualified);
    const dq = liveRanking.rows.filter((r) => r.isDisqualified);

    const sortedEligible = [...eligible].sort((a, b) => {
      const cellA = a.testCells[targetTest.id];
      const cellB = b.testCells[targetTest.id];
      const completedA = cellA?.status === 'completado';
      const completedB = cellB?.status === 'completado';

      if (completedA && !completedB) return -1;
      if (!completedA && completedB) return 1;

      const contribA = cellA?.contribution ?? 0;
      const contribB = cellB?.contribution ?? 0;
      const cmp = compareFloats(contribB, contribA);
      if (cmp !== 0) return cmp;

      if (
        completedA &&
        completedB &&
        cellA.effectiveTimeMs !== null &&
        cellB.effectiveTimeMs !== null
      ) {
        return cellA.effectiveTimeMs - cellB.effectiveTimeMs;
      }
      return 0;
    });

    return [
      ...sortedEligible.map((r, idx) => ({
        ...r,
        position: idx + 1,
      })),
      ...dq,
    ];
  }, [liveRanking.rows, viewFilter, tests]);

  const totalPages = Math.max(1, Math.ceil(displayedRows.length / rowsPerPage));

  useEffect(() => {
    setCurrentPage((prev) => (prev >= totalPages ? 0 : prev));
  }, [totalPages]);

  useEffect(() => {
    if (!autoPage || totalPages <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, PAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoPage, totalPages]);

  const podiumRows = useMemo(() => {
    return displayedRows
      .filter((r) => !r.isDisqualified && r.completedTestsCount > 0)
      .slice(0, 3);
  }, [displayedRows]);

  const paginatedRows = useMemo(() => {
    const start = currentPage * rowsPerPage;
    return displayedRows.slice(start, start + rowsPerPage);
  }, [displayedRows, currentPage, rowsPerPage]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const renderTestCellBadge = (row: RankingRow, testId: string) => {
    const cell = row.testCells[testId];
    if (!cell || cell.status === 'pendiente') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-400 text-xs font-bold uppercase tracking-wide">
          Pendiente
        </span>
      );
    }
    if (cell.status === 'dnf') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-950 border border-rose-600 text-rose-300 text-xs font-extrabold uppercase">
          DNF (0,00)
        </span>
      );
    }
    if (cell.status === 'dq') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-950 border border-rose-600 text-rose-300 text-xs font-extrabold uppercase">
          DQ (0,00)
        </span>
      );
    }

    return (
      <div className="flex flex-col items-end">
        <span className="text-base sm:text-lg font-extrabold text-white font-mono">
          {formatScore(cell.contribution)} pts
        </span>
        {cell.effectiveTimeMs !== null && (
          <span className="text-xs text-sky-300 font-mono flex items-center gap-1">
            <Timer className="w-3 h-3 text-sky-400" />
            {formatMsToTime(cell.effectiveTimeMs)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-6 select-none">
      {/* Top Broadcast Header */}
      <div className="space-y-4">
        <header
          className="rounded-2xl p-4 sm:p-5 border border-white/15 shadow-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4"
          style={{
            background: `linear-gradient(90deg, #090d16 0%, ${
              activeEvent.primaryColor || '#e60012'
            }44 100%)`,
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0 border border-white/20"
              style={{ backgroundColor: activeEvent.primaryColor || '#e60012' }}
            >
              <BrandLogo className="w-12 h-12" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {liveRanking.isRankingProvisional ? (
                  <span className="px-3 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider">
                    RANKING PROVISIONAL (PRUEBAS ABIERTAS)
                  </span>
                ) : (
                  <span className="px-3 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider">
                    CLASIFICACIÓN OFICIAL FINAL
                  </span>
                )}

                {liveRanking.hasUnresolvedTies && (
                  <span className="px-3 py-0.5 rounded-full bg-amber-950 border border-amber-400 text-amber-300 font-extrabold text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    DESEMPATE PENDIENTE EN TABLA
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                {activeEvent.name}
              </h1>
            </div>
          </div>

          {/* Right Controls: Detailed/Summary Switcher + Filter + Connection Status */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Ranking View Mode Toggle (Detallado vs Resumen) */}
            <div className="flex items-center gap-1 bg-slate-900/95 p-1.5 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setEventRankingViewMode('detallado')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                  rankingViewMode === 'detallado'
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                Detallado
              </button>
              <button
                type="button"
                onClick={() => setEventRankingViewMode('resumen')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                  rankingViewMode === 'resumen'
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                Resumen
              </button>
            </div>

            {/* View Filter: General or By Test */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setViewFilter('general')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  viewFilter === 'general'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                General
              </button>
              {tests.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setViewFilter(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    viewFilter === t.id
                      ? 'bg-sky-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* Connection & Sync Badge */}
            {isOnline ? (
              <div className="px-3.5 py-2 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs font-extrabold flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
                <div>
                  <div>EN VIVO</div>
                  <div className="text-[10px] text-emerald-400/80 font-mono">
                    Act: {new Date(lastSyncTimestamp).toLocaleTimeString('es-CL')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2 rounded-xl bg-rose-950 border-2 border-rose-500 text-rose-200 text-xs font-extrabold flex items-center gap-2 animate-pulse">
                <WifiOff className="w-5 h-5 text-rose-400" />
                <div>
                  <div>CONEXIÓN PERDIDA</div>
                  <div className="text-[10px] text-rose-300">
                    Conservando último ranking recibido
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleToggleFullscreen}
              title="Pantalla Completa 16:9"
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {onExitPublicView && (
              <button
                type="button"
                onClick={onExitPublicView}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Salir
              </button>
            )}
          </div>
        </header>

        {/* Top 3 Podium Cards (Now with Track Times & Total Time!) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {podiumRows.map((podium, idx) => {
            const medalColors = [
              'from-amber-400/25 to-slate-900 border-amber-400 text-amber-300',
              'from-slate-300/20 to-slate-900 border-slate-300 text-slate-200',
              'from-amber-700/25 to-slate-900 border-amber-600 text-amber-400',
            ];
            const totalTimeMs = getRowEffectiveTimeSummary(podium);

            return (
              <div
                key={podium.participantId}
                className={`rounded-2xl bg-gradient-to-br ${medalColors[idx]} border-2 p-4 flex flex-col justify-between gap-3 shadow-xl`}
              >
                {/* Top Row: Position, Name & Total Score / Total Time */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950'
                          : 'bg-amber-700 text-white'
                      }`}
                    >
                      #{podium.position}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-bold uppercase text-sky-300 truncate">
                        {podium.competitorNumber} • {podium.companyOrTeam}
                      </div>
                      <div className="text-lg sm:text-xl font-black text-white leading-tight truncate">
                        {podium.fullName}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-2xl sm:text-3xl font-black text-white font-mono leading-none">
                      {viewFilter === 'general'
                        ? formatScore(podium.totalContribution)
                        : formatScore(podium.testCells[viewFilter]?.contribution)}{' '}
                      <span className="text-xs font-extrabold text-amber-300">PTS</span>
                    </div>
                    <div className="text-xs sm:text-sm font-mono font-bold text-sky-300 mt-1 flex items-center justify-end gap-1">
                      <Timer className="w-3.5 h-3.5 text-sky-400" />
                      <span>
                        {totalTimeMs !== null ? formatMsToTime(totalTimeMs) : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Per-Track Times & Points Breakdown */}
                <div className="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-white/15">
                  {tests.map((t, tIdx) => {
                    const cell = podium.testCells[t.id];
                    const isCompleted = cell?.status === 'completado';
                    return (
                      <div
                        key={t.id}
                        className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between"
                      >
                        <div className="text-[10px] font-extrabold uppercase text-slate-300 truncate">
                          P{tIdx + 1} • {t.name.split(' ')[0]}
                        </div>
                        {isCompleted ? (
                          <div className="mt-0.5">
                            <div className="text-xs font-black text-sky-300 font-mono">
                              {formatMsToTime(cell.effectiveTimeMs)}
                            </div>
                            <div className="text-[10px] font-bold text-emerald-400 font-mono">
                              {formatScore(cell.contribution)} pts
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] font-bold text-slate-400 uppercase mt-1">
                            {cell?.status && cell.status !== 'pendiente'
                              ? cell.status.toUpperCase()
                              : 'Pend.'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Main High-Contrast Classification Table (Detallado vs Resumen) */}
        <div className="bg-slate-900/95 border-2 border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            {rankingViewMode === 'resumen' ? (
              /* =============================================================== */
              /* MODO RESUMEN: POSICIÓN | PILOTO | PUNTOS / TIEMPO               */
              /* =============================================================== */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b-2 border-slate-800 text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    <th className="py-3.5 px-5 w-28">Posición</th>
                    <th className="py-3.5 px-5">Piloto Competidor</th>
                    <th className="py-3.5 px-6 text-right text-amber-300 text-sm">
                      Puntos / Tiempo Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {paginatedRows.map((row) => {
                    const totalTimeMs = getRowEffectiveTimeSummary(row);
                    const displayPoints =
                      viewFilter === 'general'
                        ? row.totalContribution
                        : row.testCells[viewFilter]?.contribution ?? 0;

                    return (
                      <tr
                        key={row.participantId}
                        className={`transition ${
                          row.isDisqualified
                            ? 'bg-rose-950/30 text-slate-400'
                            : row.position && row.position <= 3
                            ? 'bg-sky-950/25'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-5">
                          {row.isDisqualified ? (
                            <span className="px-3 py-1 rounded-lg bg-rose-600 text-white font-black text-sm">
                              DQ
                            </span>
                          ) : (
                            <span
                              className={`w-10 h-9 rounded-lg flex items-center justify-center font-black text-base ${
                                row.position === 1
                                  ? 'bg-amber-400 text-slate-950'
                                  : row.position === 2
                                  ? 'bg-slate-300 text-slate-950'
                                  : row.position === 3
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-slate-800 text-white'
                              }`}
                            >
                              {row.position}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-xs font-extrabold">
                              {row.competitorNumber || row.participantId}
                            </span>
                            <span className="text-lg sm:text-xl font-extrabold text-white">
                              {row.fullName}
                            </span>
                            <span className="text-xs sm:text-sm text-slate-400 font-semibold">
                              • {row.companyOrTeam}
                            </span>
                            {row.hasPendingTie && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[11px] font-black uppercase">
                                Desempate pendiente
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-6 text-right">
                          <div className="inline-flex items-center justify-end gap-3 font-mono">
                            <span className="text-xl sm:text-2xl font-black text-amber-300">
                              {formatScore(displayPoints)} pts
                            </span>
                            <span className="text-slate-600">/</span>
                            <span className="text-base sm:text-lg font-bold text-sky-300 flex items-center gap-1 min-w-[92px] justify-end">
                              <Timer className="w-4 h-4 text-sky-400 shrink-0" />
                              {totalTimeMs !== null ? formatMsToTime(totalTimeMs) : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              /* =============================================================== */
              /* MODO DETALLADO: TODAS LAS PISTAS, TIEMPOS, AVANCE Y TOTAL       */
              /* =============================================================== */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b-2 border-slate-800 text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    <th className="py-3.5 px-4 w-24">Posición</th>
                    <th className="py-3.5 px-4">Piloto Competidor</th>
                    <th className="py-3.5 px-4">Empresa / Equipo</th>
                    {tests.map((t, idx) => (
                      <th key={t.id} className="py-3.5 px-4 text-right">
                        <div>
                          Pista {idx + 1}: {t.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {t.scoringMethod === 'time_calculated'
                            ? `Mejor: ${formatMsToTime(liveRanking.bestTimeByTestId[t.id])}`
                            : `Máx: ${formatScore(t.maxContribution)} pts`}
                        </div>
                      </th>
                    ))}
                    <th className="py-3.5 px-4 text-center">Avance</th>
                    <th className="py-3.5 px-5 text-right text-amber-300 text-sm">
                      Total (Pts / Tiempo)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {paginatedRows.map((row) => {
                    const totalTimeMs = getRowEffectiveTimeSummary(row);
                    return (
                      <tr
                        key={row.participantId}
                        className={`transition ${
                          row.isDisqualified
                            ? 'bg-rose-950/30 text-slate-400'
                            : row.position && row.position <= 3
                            ? 'bg-sky-950/25'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {row.isDisqualified ? (
                              <span className="px-3 py-1 rounded-lg bg-rose-600 text-white font-black text-sm">
                                DQ
                              </span>
                            ) : (
                              <span
                                className={`w-10 h-9 rounded-lg flex items-center justify-center font-black text-base ${
                                  row.position === 1
                                    ? 'bg-amber-400 text-slate-950'
                                    : row.position === 2
                                    ? 'bg-slate-300 text-slate-950'
                                    : row.position === 3
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-slate-800 text-white'
                                }`}
                              >
                                {row.position}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-xs font-extrabold">
                              {row.competitorNumber || row.participantId}
                            </span>
                            <span className="text-base sm:text-lg font-extrabold text-white">
                              {row.fullName}
                            </span>
                            {row.hasPendingTie && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[11px] font-black uppercase">
                                Desempate pendiente
                              </span>
                            )}
                            {row.isDisqualified && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-950 border border-rose-600 text-rose-300 text-[11px] font-bold">
                                Descalificado General
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-sm font-semibold text-slate-300">
                          {row.companyOrTeam || '—'}
                        </td>

                        {tests.map((t) => (
                          <td key={t.id} className="py-3 px-4 text-right">
                            {renderTestCellBadge(row, t.id)}
                          </td>
                        ))}

                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                              row.completedTestsCount === row.totalTestsCount
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {row.completedTestsCount}/{row.totalTestsCount}
                          </span>
                        </td>

                        <td className="py-3 px-5 text-right">
                          <div className="flex flex-col items-end font-mono">
                            <span className="text-xl sm:text-2xl font-black text-amber-300 leading-tight">
                              {formatScore(row.totalContribution)} pts
                            </span>
                            <span className="text-xs text-sky-300 font-bold flex items-center gap-1">
                              <Timer className="w-3 h-3 text-sky-400" />
                              {totalTimeMs !== null ? formatMsToTime(totalTimeMs) : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Footer Pagination & Legend Bar */}
      <footer className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            Total pilotos en tabla: <strong className="text-white">{displayedRows.length}</strong>
          </span>
          <span>•</span>
          <span>
            Vista activa:{' '}
            <strong className="text-sky-300 uppercase">{rankingViewMode}</strong>
          </span>
          <span>•</span>
          <span>
            <strong>DNF:</strong> No finalizó (0,00 pts)
          </span>
          <span>•</span>
          <span>
            <strong>DQ:</strong> Descalificado
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoPage((p) => !p)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {autoPage ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-400" /> Pausar Rotación
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-400" /> Reanudar Rotación
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages)
            }
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 font-extrabold text-white">
            Página {currentPage + 1} de {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setCurrentPage((prev) => (prev + 1) % totalPages)}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};

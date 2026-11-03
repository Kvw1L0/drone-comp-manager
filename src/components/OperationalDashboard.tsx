import React from 'react';
import {
  CheckCircle2,
  Clock,
  Flag,
  PlayCircle,
  PauseCircle,
  XCircle,
  Timer,
  Tv,
  Settings,
  AlertTriangle,
  Award,
  ArrowRight,
  Users,
  Zap,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';
import { computeEventRanking, formatMsToTime, formatScore } from '../utils/scoring';
import { TrackStatus } from '../types/domain';

interface OperationalDashboardProps {
  onNavigateResultEntry: (params?: {
    participantId?: string;
    trackId?: string;
    testId?: string;
  }) => void;
  onNavigateAdmin: () => void;
  onOpenPublicScreen: () => void;
}

export const OperationalDashboard: React.FC<OperationalDashboardProps> = ({
  onNavigateResultEntry,
  onNavigateAdmin,
  onOpenPublicScreen,
}) => {
  const {
    activeEvent,
    tracks,
    tests,
    participants,
    results,
    currentUser,
    updateTrackLiveState,
  } = useCompetition();

  const publishedResults = results
    .filter((r) => r.publicationStatus === 'publicado')
    .sort((a, b) => (b.publishedAt || b.updatedAt) - (a.publishedAt || a.updatedAt));

  const rankingSummary = computeEventRanking({
    event: activeEvent,
    tests,
    participants,
    results,
  });

  const handleTrackStatusChange = async (
    trackId: string,
    status: TrackStatus,
    currentParticipantId: string | null,
    currentTestId: string | null
  ) => {
    try {
      await updateTrackLiveState({
        trackId,
        status,
        currentParticipantId,
        currentTestId,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar pista');
    }
  };

  return (
    <div className="space-y-6">
      {/* Compact Event Hero & Quick Actions */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                  activeEvent.status === 'en_curso'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : activeEvent.status === 'preparacion'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                }`}
              >
                <Flag className="w-3 h-3" />
                {activeEvent.status.replace('_', ' ')}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-semibold">
                {activeEvent.date}
              </span>
              {rankingSummary.isRankingProvisional && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-700/60 text-amber-300 text-[11px] font-bold">
                  En Curso
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {activeEvent.name}
            </h1>
          </div>

          {/* Primary Operational CTA Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateResultEntry()}
              className="flex-1 sm:flex-initial px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/15 transition cursor-pointer"
            >
              <Timer className="w-4 h-4" />
              Registrar Tiempo
            </button>
            <button
              type="button"
              onClick={onOpenPublicScreen}
              className="px-4 py-3 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer"
            >
              <Tv className="w-4 h-4" />
              Ranking 16:9
            </button>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={onNavigateAdmin}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer"
                title="Configuración y Administración"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Clean 3-Card KPI Strip with Icons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5 pt-5 border-t border-slate-800/80">
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Pilotos en Competencia
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {participants.filter((p) => !p.isDisqualified).length}{' '}
                <span className="text-xs font-normal text-slate-500">activos</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Tiempos Registrados
              </div>
              <div className="text-xl sm:text-2xl font-black text-sky-400">
                {publishedResults.length}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {participants.length * tests.length}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Mejor Tiempo Velocidad
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
                {formatMsToTime(rankingSummary.bestTimeByTestId['test_velocidad'])}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Simultaneous Tracks Status Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-sky-400" />
            Pistas Activas ({tracks.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {tracks.map((track) => {
            const currentPilot = participants.find(
              (p) => p.id === track.currentParticipantId
            );
            const currentTest = tests.find((t) => t.id === track.currentTestId);
            const assignedTests = tests.filter((t) =>
              track.assignedTestIds.includes(t.id)
            );

            return (
              <div
                key={track.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between transition ${
                  track.status === 'operativa'
                    ? 'bg-slate-900/90 border-emerald-500/35'
                    : track.status === 'en_pausa'
                    ? 'bg-slate-900/80 border-amber-500/35'
                    : 'bg-slate-900/50 border-rose-500/35'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-extrabold text-white text-sm truncate">
                      {track.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                        track.status === 'operativa'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : track.status === 'en_pausa'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {track.status === 'operativa' && <CheckCircle2 className="w-3 h-3" />}
                      {track.status === 'en_pausa' && <PauseCircle className="w-3 h-3" />}
                      {track.status === 'cerrada' && <XCircle className="w-3 h-3" />}
                      {track.status === 'operativa'
                        ? 'Activa'
                        : track.status === 'en_pausa'
                        ? 'Pausa'
                        : 'Cerrada'}
                    </span>
                  </div>

                  {/* Active Pilot in Track */}
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-3 space-y-2">
                    <select
                      aria-label={`Piloto en ${track.name}`}
                      value={track.currentParticipantId || ''}
                      onChange={(e) =>
                        handleTrackStatusChange(
                          track.id,
                          track.status,
                          e.target.value || null,
                          track.currentTestId || assignedTests[0]?.id || null
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-semibold"
                    >
                      <option value="">— Pista Libre —</option>
                      {participants
                        .filter((p) => !p.isDisqualified)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.competitorNumber} • {p.fullName}
                          </option>
                        ))}
                    </select>

                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label={`Prueba activa en ${track.name}`}
                        value={track.currentTestId || ''}
                        onChange={(e) =>
                          handleTrackStatusChange(
                            track.id,
                            track.status,
                            track.currentParticipantId || null,
                            e.target.value || null
                          )
                        }
                        className="flex-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-sky-300"
                      >
                        {assignedTests.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label={`Estado de ${track.name}`}
                        value={track.status}
                        onChange={(e) =>
                          handleTrackStatusChange(
                            track.id,
                            e.target.value as TrackStatus,
                            track.currentParticipantId || null,
                            track.currentTestId || null
                          )
                        }
                        className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300"
                      >
                        <option value="operativa">Activa</option>
                        <option value="en_pausa">Pausa</option>
                        <option value="cerrada">Cerrada</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onNavigateResultEntry({
                      participantId: currentPilot?.id,
                      trackId: track.id,
                      testId: currentTest?.id || assignedTests[0]?.id,
                    })
                  }
                  className="w-full py-2 px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500 hover:text-slate-950 border border-sky-500/35 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Timer className="w-3.5 h-3.5" />
                  {currentPilot
                    ? `Cronometrar a ${currentPilot.fullName.split(' ')[0]}`
                    : `Ir a ${track.name.split('-')[0].trim()}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Split: Recent Published Results & Top Classification Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Results */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Últimos Tiempos
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              {publishedResults.length} registros
            </span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {publishedResults.slice(0, 8).map((res) => {
              const pilot = participants.find((p) => p.id === res.participantId);
              const test = tests.find((t) => t.id === res.testId);

              return (
                <div
                  key={res.id}
                  className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 font-mono text-xs font-bold shrink-0">
                        {pilot?.competitorNumber || res.participantId}
                      </span>
                      <span className="font-bold text-white text-sm truncate">
                        {pilot?.fullName || res.participantId}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span className="text-sky-300/90 font-medium">
                        {test?.name || res.testId}
                      </span>
                      <span>•</span>
                      <span className="truncate">{pilot?.companyOrTeam}</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {res.participationStatus === 'dnf' || res.participationStatus === 'dq' ? (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-950 border border-rose-700 text-rose-300 font-extrabold text-xs uppercase">
                        {res.participationStatus}
                      </span>
                    ) : (
                      <div>
                        <div className="text-sm font-black text-emerald-400 font-mono">
                          +{formatScore(res.contribution)} pts
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {formatMsToTime(res.effectiveTimeMs)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Top 6 Preview */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Top Clasificación
              </h2>
              <button
                type="button"
                onClick={onOpenPublicScreen}
                className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                Pantalla 16:9 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {rankingSummary.hasUnresolvedTies && (
              <div className="mb-3 p-2.5 rounded-xl bg-amber-950/60 border border-amber-700/60 text-amber-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Empate pendiente de resolución en tabla</span>
              </div>
            )}

            <div className="space-y-2">
              {rankingSummary.rows.slice(0, 6).map((row) => (
                <div
                  key={row.participantId}
                  className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                        row.position === 1
                          ? 'bg-amber-400 text-slate-950'
                          : row.position === 2
                          ? 'bg-slate-300 text-slate-950'
                          : row.position === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {row.position}
                    </span>
                    <div className="truncate">
                      <div className="font-bold text-sm text-white truncate">
                        {row.fullName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {row.competitorNumber} • {row.companyOrTeam}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-amber-300 font-mono">
                      {formatScore(row.totalContribution)}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {row.completedTestsCount}/{row.totalTestsCount}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  CheckCircle2,
  Clock,
  Flag,
  PlayCircle,
  PauseCircle,
  XCircle,
  UserCheck,
  ClipboardEdit,
  Tv,
  Settings,
  AlertTriangle,
  Award,
  ArrowRight,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';
import { computeEventRanking, formatMsToTime, formatScore } from '../utils/scoring';
import { TrackStatus } from '../types/domain';

interface OperationalDashboardProps {
  onNavigateAccreditation: (participantId?: string) => void;
  onNavigateResultEntry: (params?: {
    participantId?: string;
    trackId?: string;
    testId?: string;
  }) => void;
  onNavigateAdmin: () => void;
  onOpenPublicScreen: () => void;
}

export const OperationalDashboard: React.FC<OperationalDashboardProps> = ({
  onNavigateAccreditation,
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

  const accreditedCount = participants.filter(
    (p) => p.accreditationStatus === 'habilitado'
  ).length;
  const pendingAccreditationCount = participants.filter(
    (p) => p.accreditationStatus === 'pendiente'
  ).length;
  const disqualifiedCount = participants.filter((p) => p.isDisqualified).length;

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
      {/* Event Hero & Quick Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                  activeEvent.status === 'en_curso'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : activeEvent.status === 'preparacion'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                Estado: {activeEvent.status.replace('_', ' ')}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-xs font-semibold">
                Fecha: {activeEvent.date}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 text-xs">
                Reglas v{activeEvent.configVersion}
              </span>
              {rankingSummary.isRankingProvisional && (
                <span className="px-2.5 py-1 rounded-md bg-amber-950/90 border border-amber-700 text-amber-300 text-xs font-bold">
                  Puntajes y Ranking Provisionales (Pruebas Abiertas)
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {activeEvent.name}
            </h1>
          </div>

          {/* Primary Operational CTA Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigateAccreditation()}
              className="flex-1 sm:flex-initial px-5 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
            >
              <UserCheck className="w-5 h-5" />
              Acreditar Pilotos ({pendingAccreditationCount} pend.)
            </button>
            <button
              type="button"
              onClick={() => onNavigateResultEntry()}
              className="flex-1 sm:flex-initial px-5 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
            >
              <ClipboardEdit className="w-5 h-5" />
              Registrar Resultado
            </button>
            <button
              type="button"
              onClick={onOpenPublicScreen}
              className="px-4 py-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-bold text-sm flex items-center gap-2 transition cursor-pointer"
            >
              <Tv className="w-5 h-5" />
              Pantalla 16:9
            </button>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={onNavigateAdmin}
                className="px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm flex items-center gap-2 transition cursor-pointer"
              >
                <Settings className="w-5 h-5" />
                Administrar
              </button>
            )}
          </div>
        </div>

        {/* KPI Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6 pt-5 border-t border-slate-800">
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-xs font-bold uppercase text-slate-400">
              Pilotos Habilitados
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                {accreditedCount}
              </span>
              <span className="text-xs text-slate-400">de {participants.length} inscritos</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-xs font-bold uppercase text-slate-400">
              Acreditación Pendiente
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-400">
                {pendingAccreditationCount}
              </span>
              <span className="text-xs text-slate-400">
                {disqualifiedCount > 0 ? `• ${disqualifiedCount} DQ` : 'por verificar'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-xs font-bold uppercase text-slate-400">
              Resultados Publicados
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-sky-400">
                {publishedResults.length}
              </span>
              <span className="text-xs text-slate-400">
                de {participants.length * tests.length} posibles
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-xs font-bold uppercase text-slate-400">
              Mejor Tiempo Velocidad
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-extrabold text-amber-300 font-mono">
                {formatMsToTime(rankingSummary.bestTimeByTestId['test_velocidad'])}
              </span>
              <span className="text-xs text-slate-400">ref. 100 pts</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Simultaneous Tracks Status Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-sky-400" />
            Estado Operativo de las {tracks.length} Pistas Simultáneas
          </h2>
          <span className="text-xs text-slate-400">
            Seleccione una pista para cargar resultados directamente
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
                    ? 'bg-slate-900 border-emerald-500/40'
                    : track.status === 'en_pausa'
                    ? 'bg-slate-900/90 border-amber-500/40'
                    : 'bg-slate-900/60 border-rose-500/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-extrabold text-white text-base">{track.name}</h3>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                        track.status === 'operativa'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : track.status === 'en_pausa'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {track.status === 'operativa' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {track.status === 'en_pausa' && <PauseCircle className="w-3.5 h-3.5" />}
                      {track.status === 'cerrada' && <XCircle className="w-3.5 h-3.5" />}
                      {track.status === 'operativa'
                        ? 'OPERATIVA'
                        : track.status === 'en_pausa'
                        ? 'EN PAUSA'
                        : 'CERRADA'}
                    </span>
                  </div>

                  {/* Assigned Tests Badges */}
                  <div className="mb-3">
                    <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Pruebas habilitadas en esta pista:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {assignedTests.map((t) => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-sky-300 font-medium"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Active Pilot in Track */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 mb-3">
                    <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Piloto / Turno Actual en Pista:
                    </div>
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
                      className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold mb-2"
                    >
                      <option value="">— Pista Libre / Sin piloto asignado —</option>
                      {participants
                        .filter((p) => p.accreditationStatus === 'habilitado' && !p.isDisqualified)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.competitorNumber} - {p.fullName} ({p.companyOrTeam})
                          </option>
                        ))}
                    </select>

                    <div className="flex items-center justify-between gap-2">
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
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-sky-300"
                      >
                        <option value="">— Seleccionar modalidad —</option>
                        {assignedTests.map((t) => (
                          <option key={t.id} value={t.id}>
                            Prueba: {t.name}
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
                        className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300"
                      >
                        <option value="operativa">Operativa</option>
                        <option value="en_pausa">En Pausa</option>
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
                  className="w-full py-2.5 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <ClipboardEdit className="w-4 h-4" />
                  {currentPilot
                    ? `Evaluar a ${currentPilot.fullName.split(' ')[0]} en ${track.name.split('-')[0]}`
                    : `Registrar en ${track.name.split('-')[0]}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Split: Recent Published Results & Top Classification Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Results */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              Últimos Resultados Publicados en Tiempo Real
            </h2>
            <span className="text-xs text-slate-400">
              Total publicados: {publishedResults.length}
            </span>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {publishedResults.slice(0, 10).map((res) => {
              const pilot = participants.find((p) => p.id === res.participantId);
              const test = tests.find((t) => t.id === res.testId);
              const track = tracks.find((tr) => tr.id === res.trackId);

              return (
                <div
                  key={res.id}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-xs font-bold">
                        {pilot?.competitorNumber || res.participantId}
                      </span>
                      <span className="font-bold text-white text-sm">
                        {pilot?.fullName || res.participantId}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({pilot?.companyOrTeam || 'Sin equipo'})
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-slate-300 font-semibold">
                        Prueba: {test?.name || res.testId}
                      </span>
                      <span>•</span>
                      <span>{track?.name || res.trackId}</span>
                      <span>•</span>
                      <span>Por: {res.updatedByName} (v{res.version})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {res.participationStatus === 'dnf' ? (
                      <span className="px-3 py-1 rounded-lg bg-rose-950 border border-rose-700 text-rose-300 font-extrabold text-xs">
                        DNF (0,00 pts)
                      </span>
                    ) : res.participationStatus === 'dq' ? (
                      <span className="px-3 py-1 rounded-lg bg-rose-950 border border-rose-700 text-rose-300 font-extrabold text-xs">
                        DQ (0,00 pts)
                      </span>
                    ) : (
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-emerald-400">
                          Aporte: {formatScore(res.contribution)} pts
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Neto: {formatScore(res.netScore)} | Tiempo:{' '}
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

        {/* Live Top 6 + Tie Alerts Preview */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                Líderes Provisionales
              </h2>
              <button
                type="button"
                onClick={onOpenPublicScreen}
                className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                Ver Ranking Completo <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {rankingSummary.hasUnresolvedTies && (
              <div className="mb-3 p-3 rounded-xl bg-amber-950/70 border border-amber-700/70 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Empate persistente detectado:</strong> Existen pilotos que mantienen
                  igualdad tras los 4 criterios de desempate. Se muestran en la misma posición
                  con indicación de <em>Desempate pendiente</em>.
                </div>
              </div>
            )}

            <div className="space-y-2">
              {rankingSummary.rows.slice(0, 7).map((row) => (
                <div
                  key={row.participantId}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs ${
                        row.position === 1
                          ? 'bg-amber-400 text-slate-950'
                          : row.position === 2
                          ? 'bg-slate-300 text-slate-950'
                          : row.position === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      #{row.position}
                    </span>
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-1.5">
                        {row.fullName}
                        {row.hasPendingTie && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-bold">
                            EMPATE PENDIENTE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.competitorNumber} • {row.companyOrTeam} • {row.completedTestsCount}/
                        {row.totalTestsCount} pruebas
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-white font-mono">
                      {formatScore(row.totalContribution)}
                    </div>
                    <div className="text-[10px] text-slate-400">PTS TOTAL</div>
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

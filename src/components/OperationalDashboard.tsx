import React from 'react';
import {
  CheckCircle2,
  Clock,
  PlayCircle,
  PauseCircle,
  XCircle,
  Timer,
  Award,
  Users,
  Zap,
  Download,
  FileSpreadsheet,
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
}) => {
  const {
    activeEvent,
    tracks,
    tests,
    participants,
    results,
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
        <div className="max-w-4xl mx-auto space-y-4">
      {/* Field Backup Excel Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              Planilla Oficial de Control a Mano
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                .XLSX
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              31 pilotos cargados • Pistas 1 a 5 • Fórmulas de tiempos, faltas y firmas de jueces
            </div>
          </div>
        </div>
        <a
          href="/Planilla_Control_Tiempos_Competencia_Drones.xlsx"
          download="Planilla_Control_Tiempos_Competencia_Drones.xlsx"
          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.35)] cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          Descargar Planilla Excel
        </a>
      </div>

      {/* Compact 3-KPI Strip */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="kv-hud-card p-3 rounded-2xl flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase text-slate-400 truncate">
              Pilotos
            </div>
            <div className="text-base sm:text-lg font-black text-white font-mono">
              {participants.filter((p) => !p.isDisqualified).length}
            </div>
          </div>
        </div>

        <div className="kv-hud-card p-3 rounded-2xl flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase text-slate-400 truncate">
              Tiempos
            </div>
            <div className="text-base sm:text-lg font-black text-sky-400 font-mono">
              {publishedResults.length}/{participants.length * tests.length}
            </div>
          </div>
        </div>

        <div className="kv-hud-card p-3 rounded-2xl flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase text-slate-400 truncate">
              Récord Vel.
            </div>
            <div className="text-xs sm:text-base font-black text-amber-300 font-mono truncate">
              {formatMsToTime(rankingSummary.bestTimeByTestId['test_velocidad'])}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Simultaneous Tracks Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              className="kv-hud-card rounded-2xl p-3.5 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
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
                    {track.status === 'operativa' && <PlayCircle className="w-3 h-3" />}
                    {track.status === 'en_pausa' && <PauseCircle className="w-3 h-3" />}
                    {track.status === 'cerrada' && <XCircle className="w-3 h-3" />}
                    {track.status === 'operativa'
                      ? 'Activa'
                      : track.status === 'en_pausa'
                      ? 'Pausa'
                      : 'Cerrada'}
                  </span>
                </div>

                <div className="space-y-1.5">
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
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-semibold"
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
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-sky-300"
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
                      className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300"
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
                className={`w-full py-2.5 px-3 rounded-xl ${
                  currentTest?.scoringMethod === 'manual'
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black shadow'
                    : 'bg-sky-500 hover:bg-sky-400 text-white font-extrabold'
                } text-xs flex items-center justify-center gap-1.5 transition cursor-pointer`}
              >
                {currentTest?.scoringMethod === 'manual' ? (
                  <Award className="w-3.5 h-3.5" />
                ) : (
                  <Timer className="w-3.5 h-3.5" />
                )}
                {currentPilot
                  ? (currentTest?.scoringMethod === 'manual'
                      ? `Evaluar Puntos a ${currentPilot.fullName.split(' ')[0]}`
                      : `Cronometrar a ${currentPilot.fullName.split(' ')[0]}`)
                  : `Abrir ${track.name.split('-')[0].trim()}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Compact Recent & Top 5 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="kv-hud-card rounded-2xl p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
            <Award className="w-4 h-4 text-amber-400" />
            Top 5 Clasificación
          </h2>
          <div className="space-y-1.5">
            {rankingSummary.rows.slice(0, 5).map((row) => (
              <div
                key={row.participantId}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
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
                  <span className="font-bold text-xs text-white truncate">
                    {row.fullName}
                  </span>
                </div>
                <span className="text-xs font-black text-amber-300 font-mono shrink-0">
                  {formatScore(row.totalContribution)} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="kv-hud-card rounded-2xl p-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
            <Clock className="w-4 h-4 text-emerald-400" />
            Últimos Tiempos
          </h2>
          <div className="space-y-1.5">
            {publishedResults.slice(0, 5).map((res) => {
              const pilot = participants.find((p) => p.id === res.participantId);
              const test = tests.find((t) => t.id === res.testId);
              return (
                <div
                  key={res.id}
                  className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-white truncate">
                      {pilot?.competitorNumber} {pilot?.fullName}
                    </div>
                    <div className="text-[10px] text-sky-300 truncate">
                      {test?.name}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <div className="text-xs font-black text-emerald-400">
                      +{formatScore(res.contribution)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatMsToTime(res.effectiveTimeMs)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

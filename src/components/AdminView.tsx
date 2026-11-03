import React, { useMemo, useState } from 'react';
import {
  Settings,
  Sliders,
  Users,
  FileSpreadsheet,
  Award,
  History,
  ShieldAlert,
  Plus,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  RefreshCw,
  Edit3,
  Trash2,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';
import {
  AccreditationRequirement,
  EvaluationTest,
  Participant,
  TieBreakerRule,
  Track,
  UserRole,
} from '../types/domain';
import {
  computeEventRanking,
  formatMsToTime,
  formatScore,
} from '../utils/scoring';
import {
  buildParticipantFromCsvRow,
   generateRankingCsv,
  parseAndValidateParticipantsCsv,
} from '../utils/csv';

interface AdminViewProps {
  onEditResultInForm: (params: {
    participantId: string;
    testId: string;
    trackId: string;
  }) => void;
}

type AdminTab =
  | 'eventos'
  | 'pruebas_pistas'
  | 'participantes'
  | 'resultados_empates'
  | 'usuarios'
  | 'auditoria';

export const AdminView: React.FC<AdminViewProps> = ({ onEditResultInForm }) => {
  const {
    currentUser,
    events,
    activeEvent,
    setActiveEventId,
    tracks,
    tests,
    participants,
    results,
    auditLogs,
    users,
    createEvent,
    updateEventDetails,
    saveTestConfig,
    toggleTestStatus,
    saveTrackConfig,
    saveParticipantAdmin,
    importParticipantsBatch,
    setParticipantGeneralDQ,
    annulPublishedResult,
    resolvePersistentTie,
    clearTieResolution,
    saveStaffUser,
    resetDemoDatabase,
    setEventRankingViewMode,
  } = useCompetition();

  const [activeTab, setActiveTab] = useState<AdminTab>('eventos');
  const [bannerMsg, setBannerMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const publishedResultsCount = useMemo(
    () => results.filter((r) => r.publicationStatus === 'publicado').length,
    [results]
  );

  const rankingData = useMemo(
    () =>
      computeEventRanking({
        event: activeEvent,
        tests,
        participants,
        results,
      }),
    [activeEvent, tests, participants, results]
  );

  // ============================================================================
  // TAB 1: EVENT SETTINGS & NEW EVENT STATE
  // ============================================================================
  const [evName, setEvName] = useState(activeEvent.name);
  const [evDate, setEvDate] = useState(activeEvent.date);
  const [evStatus, setEvStatus] = useState(activeEvent.status);
  const [evPrimary, setEvPrimary] = useState(activeEvent.primaryColor);
  const [evSecondary, setEvSecondary] = useState(activeEvent.secondaryColor);
  const [evLogo, setEvLogo] = useState(activeEvent.logoUrl);
  const [evReqs, setEvReqs] = useState<AccreditationRequirement[]>(
    activeEvent.accreditationRequirements
  );
  const [evTieRules, setEvTieRules] = useState<TieBreakerRule[]>(
    activeEvent.tieBreakerRules
  );
  const [evExtraReason, setEvExtraReason] = useState('');
  const [newReqLabel, setNewReqLabel] = useState('');

  // Sync local event form when activeEvent changes
  React.useEffect(() => {
    setEvName(activeEvent.name);
    setEvDate(activeEvent.date);
    setEvStatus(activeEvent.status);
    setEvPrimary(activeEvent.primaryColor);
    setEvSecondary(activeEvent.secondaryColor);
    setEvLogo(activeEvent.logoUrl);
    setEvReqs(activeEvent.accreditationRequirements);
    setEvTieRules(activeEvent.tieBreakerRules);
    setEvExtraReason('');
  }, [activeEvent]);

  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-12-05');

  const handleSaveEventConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerMsg(null);
    try {
      await updateEventDetails({
        eventId: activeEvent.id,
        name: evName,
        date: evDate,
        primaryColor: evPrimary,
        secondaryColor: evSecondary,
        logoUrl: evLogo,
        status: evStatus,
        accreditationRequirements: evReqs,
        tieBreakerRules: evTieRules,
        extraordinaryReason: evExtraReason.trim() || undefined,
      });
      setEvExtraReason('');
      setBannerMsg({
        type: 'success',
        text: 'Configuración del evento actualizada correctamente.',
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar evento.',
      });
    }
  };

  const handleCreateNewEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    setBannerMsg(null);
    try {
      const id = await createEvent({
        name: newEventName.trim(),
        date: newEventDate,
        primaryColor: '#0284c7',
        secondaryColor: '#f59e0b',
        logoUrl: '',
      });
      setNewEventName('');
      setBannerMsg({
        type: 'success',
        text: `Nuevo evento "${newEventName}" (${id}) creado con datos separados.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al crear evento.',
      });
    }
  };

  // ============================================================================
  // TAB 2: TESTS & TRACKS STATE
  // ============================================================================
  const [editingTest, setEditingTest] = useState<EvaluationTest | null>(null);
  const [testExtraReason, setTestExtraReason] = useState('');
  const [closeOpenReasonByTest, setCloseOpenReasonByTest] = useState<
    Record<string, string>
  >({});
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTest) return;
    setBannerMsg(null);
    try {
      await saveTestConfig({
        test: editingTest,
        extraordinaryReason: testExtraReason.trim() || undefined,
      });
      setEditingTest(null);
      setTestExtraReason('');
      setBannerMsg({
        type: 'success',
        text: `Prueba "${editingTest.name}" guardada y puntajes recalculados consistentemente.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar prueba.',
      });
    }
  };

  const handleToggleTestOpenClose = async (test: EvaluationTest) => {
    const targetStatus = test.status === 'abierta' ? 'cerrada' : 'abierta';
    const reason =
      (closeOpenReasonByTest[test.id] || '').trim() ||
      (targetStatus === 'cerrada'
        ? 'Cierre oficial de prueba por dirección de competencia'
        : 'Reapertura administrativa de prueba');
    setBannerMsg(null);
    try {
      await toggleTestStatus({
        testId: test.id,
        status: targetStatus,
        reason,
      });
      setBannerMsg({
        type: 'success',
        text: `Prueba "${test.name}" cambiada a estado ${targetStatus.toUpperCase()}.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al cambiar estado de prueba.',
      });
    }
  };

  const handleSaveTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack) return;
    setBannerMsg(null);
    try {
      await saveTrackConfig(editingTrack);
      setEditingTrack(null);
      setBannerMsg({
        type: 'success',
        text: `Pista "${editingTrack.name}" actualizada.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar pista.',
      });
    }
  };

  // ============================================================================
  // TAB 3: PARTICIPANTS, CSV IMPORT & GENERAL DQ STATE
  // ============================================================================
  const [csvRawText, setCsvRawText] = useState('');
  const [dqModalParticipant, setDqModalParticipant] =
    useState<Participant | null>(null);
  const [dqReasonInput, setDqReasonInput] = useState('');
  const [editingParticipant, setEditingParticipant] = useState<{
    isNew: boolean;
    id: string;
    fullName: string;
    companyOrTeam: string;
    competitorNumber: string;
    accreditationStatus: Participant['accreditationStatus'];
    internalNotes: string;
  } | null>(null);

  const csvPreview = useMemo(() => {
    if (!csvRawText.trim()) return null;
    return parseAndValidateParticipantsCsv(csvRawText, participants);
  }, [csvRawText, participants]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvRawText(String(reader.result || ''));
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview || csvPreview.validCount === 0) return;
    setBannerMsg(null);
    try {
      const validRows = csvPreview.rows.filter((r) => r.isValid);
      const built = validRows.map((r) =>
        buildParticipantFromCsvRow(
          r,
          activeEvent.id,
          activeEvent.accreditationRequirements
        )
      );
      await importParticipantsBatch(built);
      setCsvRawText('');
      setBannerMsg({
        type: 'success',
        text: `Se importaron ${built.length} participantes válidos al evento "${activeEvent.name}".`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al importar CSV.',
      });
    }
  };

  const handleApplyOrLiftDQ = async () => {
    if (!dqModalParticipant) return;
    setBannerMsg(null);
    try {
      const nextDq = !dqModalParticipant.isDisqualified;
      await setParticipantGeneralDQ({
        participantId: dqModalParticipant.id,
        isDisqualified: nextDq,
        reason: dqReasonInput,
      });
      setDqModalParticipant(null);
      setDqReasonInput('');
      setBannerMsg({
        type: 'success',
        text: nextDq
          ? `Piloto ${dqModalParticipant.fullName} marcado como DQ GENERAL (excluido de puestos premiables; historial conservado).`
          : `Se levantó la descalificación general de ${dqModalParticipant.fullName}.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al actualizar DQ.',
      });
    }
  };

  const handleSaveParticipantModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant) return;
    setBannerMsg(null);
    try {
      const existing = participants.find((p) => p.id === editingParticipant.id);
      const checks: Record<string, boolean> =
        existing?.requirementsChecks || {};
      if (!existing) {
        for (const req of activeEvent.accreditationRequirements) {
          checks[req.id] = editingParticipant.accreditationStatus === 'habilitado';
        }
      }
      await saveParticipantAdmin({
        isNew: editingParticipant.isNew,
        participant: {
          id: editingParticipant.id,
          eventId: activeEvent.id,
          fullName: editingParticipant.fullName,
          companyOrTeam: editingParticipant.companyOrTeam,
          competitorNumber: editingParticipant.competitorNumber,
          accreditationStatus: editingParticipant.accreditationStatus,
          requirementsChecks: checks,
          internalNotes: editingParticipant.internalNotes,
          isDisqualified: existing?.isDisqualified || false,
          disqualificationReason: existing?.disqualificationReason,
        },
      });
      setEditingParticipant(null);
      setBannerMsg({
        type: 'success',
        text: `Participante "${editingParticipant.fullName}" guardado.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar participante.',
      });
    }
  };

  // ============================================================================
  // TAB 4: RESULTS, ANNULMENTS, TIES & CSV EXPORT
  // ============================================================================
  const [annulModalResultId, setAnnulModalResultId] = useState<string | null>(
    null
  );
  const [annulReason, setAnnulReason] = useState('');
  const [tieReasonByGroup, setTieReasonByGroup] = useState<
    Record<string, string>
  >({});
  const [tieOrderByGroup, setTieOrderByGroup] = useState<
    Record<string, string[]>
  >({});

  const handleConfirmAnnul = async () => {
    if (!annulModalResultId) return;
    const target = results.find((r) => r.id === annulModalResultId);
    if (!target) return;
    setBannerMsg(null);
    try {
      await annulPublishedResult({
        resultId: target.id,
        reason: annulReason,
        expectedVersion: target.version,
      });
      setAnnulModalResultId(null);
      setAnnulReason('');
      setBannerMsg({
        type: 'success',
        text: 'Resultado anulado oficialmente y aportes de la prueba recalculados.',
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al anular resultado.',
      });
    }
  };

  const handleExportRankingCsv = () => {
    const csvContent = generateRankingCsv(
      activeEvent.name,
      tests,
      rankingData.rows
    );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ranking_${activeEvent.id}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Identify persistent tie groups from ranking
  const persistentTieGroups = useMemo(() => {
    const map = new Map<string, typeof rankingData.rows>();
    for (const row of rankingData.rows) {
      if (row.tieGroupKey && (row.hasPendingTie || row.tieResolutionReason)) {
        const list = map.get(row.tieGroupKey) || [];
        list.push(row);
        map.set(row.tieGroupKey, list);
      }
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 1);
  }, [rankingData.rows]);

  // ============================================================================
  // TAB 5: STAFF USERS MANAGEMENT
  // ============================================================================
  const [userForm, setUserForm] = useState<{
    uid?: string;
    email: string;
    displayName: string;
    role: UserRole;
    active: boolean;
  }>({
    email: '',
    displayName: '',
    role: 'staff',
    active: true,
  });

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerMsg(null);
    try {
      await saveStaffUser(userForm);
      setUserForm({
        email: '',
        displayName: '',
        role: 'staff',
        active: true,
      });
      setBannerMsg({
        type: 'success',
        text: 'Usuario del personal guardado correctamente.',
      });
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar usuario.',
      });
    }
  };

  // Access guard: strictly require admin role in UI as well as backend
  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-8 rounded-2xl bg-rose-950/80 border-2 border-rose-600 text-rose-100 text-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
        <h2 className="text-xl font-extrabold">
          Acceso Restringido a Administradores
        </h2>
        <p className="text-sm text-rose-200 max-w-lg mx-auto">
          Su perfil actual ({currentUser?.displayName} — Rol:{' '}
          {currentUser?.role?.toUpperCase()}) no posee permisos para modificar
          reglas de puntuación, configurar pistas, gestionar usuarios ni
          sobrescribir resultados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header & Sub-navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2.5">
              <Settings className="w-6 h-6 text-sky-400" />
              Panel de Administración y Control de Reglas
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Evento activo: <strong className="text-white">{activeEvent.name}</strong>{' '}
              • Configuración v{activeEvent.configVersion} •{' '}
              {publishedResultsCount} resultados publicados
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Ranking View Mode Selector (Controls Public Screen & Admin Table) */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-700">
              <span className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                Vista Ranking:
              </span>
              <button
                type="button"
                onClick={() => {
                  setEventRankingViewMode('detallado');
                  setActiveTab('resultados_empates');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  (activeEvent.rankingViewMode || 'detallado') === 'detallado'
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Detallado (Pistas)
              </button>
              <button
                type="button"
                onClick={() => {
                  setEventRankingViewMode('resumen');
                  setActiveTab('resultados_empates');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  activeEvent.rankingViewMode === 'resumen'
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Resumen (Pts / Tiempo)
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportRankingCsv}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Exportar Ranking CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    '¿Restaurar todos los datos ficticios de demostración (35 pilotos y 4 pistas) a su estado inicial?'
                  )
                ) {
                  resetDemoDatabase();
                  setBannerMsg({
                    type: 'success',
                    text: 'Datos de demostración restaurados al estado original.',
                  });
                }
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurar Demo Inicial
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-800">
          {(
            [
              { id: 'eventos', label: '1. Eventos y Reglas', icon: Settings },
              {
                id: 'pruebas_pistas',
                label: `2. Pruebas (${tests.length}) y Pistas (${tracks.length})`,
                icon: Sliders,
              },
              {
                id: 'participantes',
                label: `3. Pilotos (${participants.length}) y CSV`,
                icon: FileSpreadsheet,
              },
              {
                id: 'resultados_empates',
                label: `4. Ranking y Resultados (${results.length})`,
                icon: Award,
              },
              {
                id: 'usuarios',
                label: `5. Accesos Staff (${users.length})`,
                icon: Users,
              },
              {
                id: 'auditoria',
                label: `6. Historial (${auditLogs.length})`,
                icon: History,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setBannerMsg(null);
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-sky-500 text-slate-950 shadow'
                    : 'bg-slate-950/70 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMsg && (
        <div
          className={`p-4 rounded-xl border text-sm font-bold flex items-center justify-between ${
            bannerMsg.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/60 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {bannerMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{bannerMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: EVENTOS, IDENTIDAD VISUAL Y REGLAS                             */}
      {/* ===================================================================== */}
      {activeTab === 'eventos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Switch or Create Multi-Event */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-extrabold text-white">
                Eventos Registrados (Datos Separados)
              </h2>
              <div className="space-y-2">
                {events.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setActiveEventId(ev.id)}
                    className={`w-full p-3.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                      ev.id === activeEvent.id
                        ? 'bg-sky-950/80 border-sky-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="font-extrabold text-sm">{ev.name}</div>
                      <div className="text-xs text-slate-400">
                        Fecha: {ev.date} • Estado: {ev.status} • v{ev.configVersion}
                      </div>
                    </div>
                    {ev.id === activeEvent.id && (
                      <span className="px-2 py-0.5 rounded bg-sky-500 text-slate-950 text-[10px] font-extrabold">
                        ACTIVO
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <form
                onSubmit={handleCreateNewEvent}
                className="pt-4 border-t border-slate-800 space-y-3"
              >
                <div className="text-xs font-extrabold uppercase text-sky-300">
                  Crear Nuevo Evento Independiente
                </div>
                <input
                  type="text"
                  required
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder="Nombre del nuevo evento..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
                <input
                  type="date"
                  required
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Crear Evento con Pruebas y Pistas Base
                </button>
              </form>
            </div>
          </div>

          {/* Right: Active Event Configuration */}
          <form
            onSubmit={handleSaveEventConfig}
            className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  Configuración del Evento Activo
                </h2>
                <p className="text-xs text-slate-400">
                  Identidad visual, estado operativo, requisitos de acreditación y reglas de
                  desempate.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-800 text-sky-300 text-xs font-bold">
                Versión Reglas: v{activeEvent.configVersion}
              </span>
            </div>

            {publishedResultsCount > 0 && (
              <div className="p-4 rounded-xl bg-amber-950/70 border border-amber-500/60 text-amber-200 text-xs space-y-2">
                <div className="font-extrabold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  Protección de Reglas Activa ({publishedResultsCount} resultados publicados)
                </div>
                <p>
                  Existen resultados oficiales publicados. Si modifica las reglas de clasificación o
                  desempates, debe ingresar un motivo de modificación extraordinaria para generar una
                  nueva versión de configuración (v{activeEvent.configVersion + 1}) y recalcular.
                </p>
                <input
                  type="text"
                  value={evExtraReason}
                  onChange={(e) => setEvExtraReason(e.target.value)}
                  placeholder="Motivo obligatorio si modifica reglas de clasificación con resultados publicados..."
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-amber-500 text-white text-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Nombre del Evento
                </label>
                <input
                  type="text"
                  required
                  value={evName}
                  onChange={(e) => setEvName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  required
                  value={evDate}
                  onChange={(e) => setEvDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Estado del Evento
                </label>
                <select
                  value={evStatus}
                  onChange={(e) =>
                    setEvStatus(e.target.value as typeof activeEvent.status)
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                >
                  <option value="preparacion">En Preparación</option>
                  <option value="en_curso">En Curso</option>
                  <option value="finalizado">Finalizado (Cerrado)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  URL del Logo (Opcional)
                </label>
                <input
                  type="text"
                  value={evLogo}
                  onChange={(e) => setEvLogo(e.target.value)}
                  placeholder="https://... o vacío para icono oficial"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Color Primario Institucional
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={evPrimary}
                    onChange={(e) => setEvPrimary(e.target.value)}
                    className="w-12 h-10 rounded bg-slate-950 border border-slate-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={evPrimary}
                    onChange={(e) => setEvPrimary(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Color Secundario / Acento
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={evSecondary}
                    onChange={(e) => setEvSecondary(e.target.value)}
                    className="w-12 h-10 rounded bg-slate-950 border border-slate-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={evSecondary}
                    onChange={(e) => setEvSecondary(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Configurable Accreditation Requirements */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="text-xs font-extrabold uppercase text-emerald-400">
                Requisitos de Acreditación Manual del Staff
              </div>
              <div className="space-y-2">
                {evReqs.map((req, idx) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  >
                    <input
                      type="text"
                      value={req.label}
                      onChange={(e) => {
                        const next = [...evReqs];
                        next[idx] = { ...req, label: e.target.value };
                        setEvReqs(next);
                      }}
                      className="flex-1 bg-transparent text-white font-medium focus:outline-none"
                    />
                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={req.required}
                        onChange={(e) => {
                          const next = [...evReqs];
                          next[idx] = { ...req, required: e.target.checked };
                          setEvReqs(next);
                        }}
                      />
                      Obligatorio
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setEvReqs(evReqs.filter((r) => r.id !== req.id))
                      }
                      className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                      title="Eliminar requisito"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newReqLabel}
                  onChange={(e) => setNewReqLabel(e.target.value)}
                  placeholder="Agregar nuevo requisito de acreditación..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newReqLabel.trim()) return;
                    setEvReqs([
                      ...evReqs,
                      {
                        id: `req_${Date.now()}`,
                        label: newReqLabel.trim(),
                        required: true,
                      },
                    ]);
                    setNewReqLabel('');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs cursor-pointer"
                >
                  + Añadir Requisito
                </button>
              </div>
            </div>

            {/* Tie-breaker Hierarchy */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <div className="text-xs font-extrabold uppercase text-amber-300">
                Reglas de Clasificación y Orden de Desempate Configuradas
              </div>
              <div className="space-y-1.5">
                {evTieRules.map((rule, idx) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  >
                    <span className="font-bold text-white">
                      {idx + 1}. {rule.label} ({rule.direction === 'desc' ? 'Mayor gana' : 'Menor tiempo válido gana'})
                    </span>
                    <div className="flex gap-1">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...evTieRules];
                            const tmp = next[idx - 1];
                            next[idx - 1] = next[idx];
                            next[idx] = tmp;
                            setEvTieRules(next);
                          }}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                        >
                          ↑ Subir
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm cursor-pointer"
              >
                Guardar Configuración del Evento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PRUEBAS Y 4 PISTAS                                             */}
      {/* ===================================================================== */}
      {activeTab === 'pruebas_pistas' && (
        <div className="space-y-6">
          {/* Evaluation Tests Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  Modalidades de Evaluación (Pruebas)
                </h2>
                <p className="text-xs text-slate-400">
                  Configuración inicial editable (Velocidad 33,33 + Habilidades 33,33 + Destreza
                  33,34 = 100,00). Los descuentos se aplican sobre puntos base antes de ponderar.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingTest({
                    id: `test_${Date.now()}`,
                    eventId: activeEvent.id,
                    name: 'Nueva Prueba',
                    scoringMethod: 'manual',
                    maxBaseScore: 100,
                    maxContribution: 25,
                    timeLimitMs: 300000,
                    enableSecondsPenalty: true,
                    officialAttemptsCount: 1,
                    attemptSelectionRule: 'best_score',
                    assignedTrackIds: tracks.map((tr) => tr.id),
                    status: 'abierta',
                    order: tests.length + 1,
                  })
                }
                className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Agregar Nueva Prueba
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tests.map((test) => {
                const assignedTracksNames = tracks
                  .filter((tr) => test.assignedTrackIds.includes(tr.id))
                  .map((tr) => tr.name);
                return (
                  <div
                    key={test.id}
                    className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-white text-base">
                          {test.name}
                        </h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                            test.status === 'abierta'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          }`}
                        >
                          {test.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 space-y-1">
                        <div>
                          Método:{' '}
                          <strong className="text-sky-300">
                            {test.scoringMethod === 'time_calculated'
                              ? 'Calculado por Tiempo'
                              : 'Puntaje Manual'}
                          </strong>
                        </div>
                        <div>
                          Puntaje Base Máx: <strong>{test.maxBaseScore} pts</strong>
                        </div>
                        <div>
                          Aporte Máximo al Total:{' '}
                          <strong className="text-emerald-400">
                            {formatScore(test.maxContribution)} pts
                          </strong>
                        </div>
                        <div>
                          Tiempo Límite:{' '}
                          <strong>{(test.timeLimitMs / 1000).toFixed(0)} seg</strong>
                        </div>
                        <div>
                          Intentos Oficiales: <strong>{test.officialAttemptsCount}</strong> (
                          {test.attemptSelectionRule})
                        </div>
                        <div>
                          Pistas asignadas:{' '}
                          <span className="text-amber-300">
                            {assignedTracksNames.join(', ') || 'Ninguna'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTest({ ...test });
                          setTestExtraReason('');
                        }}
                        className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar Parámetros de Prueba
                      </button>

                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={closeOpenReasonByTest[test.id] || ''}
                          onChange={(e) =>
                            setCloseOpenReasonByTest((prev) => ({
                              ...prev,
                              [test.id]: e.target.value,
                            }))
                          }
                          placeholder="Motivo cierre/reapertura..."
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleTestOpenClose(test)}
                          className={`px-3 py-1.5 rounded-lg font-extrabold text-xs flex items-center gap-1 cursor-pointer ${
                            test.status === 'abierta'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-emerald-500 text-slate-950'
                          }`}
                        >
                          {test.status === 'abierta' ? (
                            <>
                              <Lock className="w-3.5 h-3.5" /> Cerrar
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5" /> Reabrir
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal/Drawer to edit a Test */}
            {editingTest && (
              <form
                onSubmit={handleSaveTest}
                className="p-5 rounded-2xl bg-slate-950 border-2 border-sky-500 space-y-4 mt-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-white">
                    Configurar Prueba: {editingTest.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingTest(null)}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                {publishedResultsCount > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-500 text-amber-200 text-xs space-y-2">
                    <div className="font-bold">
                      Modificación Extraordinaria con Resultados Publicados:
                    </div>
                    <input
                      type="text"
                      required
                      value={testExtraReason}
                      onChange={(e) => setTestExtraReason(e.target.value)}
                      placeholder="Ingrese motivo obligatorio para versionar configuración y recalcular..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-amber-400 text-white text-xs"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Nombre de la Prueba
                    </label>
                    <input
                      type="text"
                      required
                      value={editingTest.name}
                      onChange={(e) =>
                        setEditingTest({ ...editingTest, name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Método de Puntuación
                    </label>
                    <select
                      value={editingTest.scoringMethod}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          scoringMethod: e.target.value as EvaluationTest['scoringMethod'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm"
                    >
                      <option value="manual">Método A: Puntaje Manual</option>
                      <option value="time_calculated">
                        Método B: Calculado por Tiempo
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Puntaje Base Máximo
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={editingTest.maxBaseScore}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          maxBaseScore: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Aporte Máximo al Total General
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editingTest.maxContribution}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          maxContribution: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Tiempo Límite (Segundos)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={Math.round(editingTest.timeLimitMs / 1000)}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          timeLimitMs: Math.round(Number(e.target.value) * 1000),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Regla Selección Intento
                    </label>
                    <select
                      value={editingTest.attemptSelectionRule}
                      onChange={(e) =>
                        setEditingTest({
                          ...editingTest,
                          attemptSelectionRule: e.target
                            .value as EvaluationTest['attemptSelectionRule'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm"
                    >
                      <option value="best_score">Mejor Aporte</option>
                      <option value="latest_valid">Último Intento Válido</option>
                      <option value="first_official">Primer Intento Oficial</option>
                    </select>
                  </div>
                </div>

                {/* Assign Tracks (Many-to-Many) */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Pistas Físicas en las que se realiza esta prueba:
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {tracks.map((tr) => {
                      const checked = editingTest.assignedTrackIds.includes(tr.id);
                      return (
                        <label
                          key={tr.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...editingTest.assignedTrackIds, tr.id]
                                : editingTest.assignedTrackIds.filter(
                                    (id) => id !== tr.id
                                  );
                              setEditingTest({
                                ...editingTest,
                                assignedTrackIds: next,
                              });
                            }}
                          />
                          {tr.name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTest(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer"
                  >
                    Guardar Prueba y Recalcular
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Physical Tracks Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  Lugares Físicos (Pistas Simultáneas)
                </h2>
                <p className="text-xs text-slate-400">
                  Una pista es un lugar físico y una prueba es una modalidad de evaluación. Puede
                  asignar una prueba a una o varias pistas libremente.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingTrack({
                    id: `track_${Date.now()}`,
                    eventId: activeEvent.id,
                    name: `Pista ${tracks.length + 1}`,
                    status: 'operativa',
                    assignedTestIds: tests.map((t) => t.id),
                    currentParticipantId: null,
                    currentTestId: tests[0]?.id || null,
                    order: tracks.length + 1,
                  })
                }
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs cursor-pointer"
              >
                + Añadir Pista Física
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tracks.map((tr) => (
                <div
                  key={tr.id}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="font-extrabold text-white text-sm">{tr.name}</div>
                    <div className="text-xs text-slate-400 uppercase mt-0.5">
                      Estado: {tr.status}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tests
                        .filter((t) => tr.assignedTestIds.includes(t.id))
                        .map((t) => (
                          <span
                            key={t.id}
                            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-sky-300"
                          >
                            {t.name}
                          </span>
                        ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingTrack({ ...tr })}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    Configurar Pista
                  </button>
                </div>
              ))}
            </div>

            {editingTrack && (
              <form
                onSubmit={handleSaveTrack}
                className="p-5 rounded-2xl bg-slate-950 border-2 border-emerald-500 space-y-4"
              >
                <h3 className="text-sm font-extrabold text-white">
                  Editar Pista Física: {editingTrack.name}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Nombre de la Pista
                    </label>
                    <input
                      type="text"
                      required
                      value={editingTrack.name}
                      onChange={(e) =>
                        setEditingTrack({ ...editingTrack, name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Estado Operativo
                    </label>
                    <select
                      value={editingTrack.status}
                      onChange={(e) =>
                        setEditingTrack({
                          ...editingTrack,
                          status: e.target.value as Track['status'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm"
                    >
                      <option value="operativa">Operativa</option>
                      <option value="en_pausa">En Pausa</option>
                      <option value="cerrada">Cerrada</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Pruebas asignadas a esta pista:
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {tests.map((t) => {
                      const checked = editingTrack.assignedTestIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...editingTrack.assignedTestIds, t.id]
                                : editingTrack.assignedTestIds.filter(
                                    (id) => id !== t.id
                                  );
                              setEditingTrack({
                                ...editingTrack,
                                assignedTestIds: next,
                              });
                            }}
                          />
                          {t.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTrack(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer"
                  >
                    Guardar Pista
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: PARTICIPANTES, IMPORTADOR CSV CON VALIDACIÓN Y DQ GENERAL      */}
      {/* ===================================================================== */}
      {activeTab === 'participantes' && (
        <div className="space-y-6">
          {/* CSV Importer Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-sky-400" />
                  Importar Nómina de Participantes desde CSV
                </h2>
                <p className="text-xs text-slate-400">
                  Detecta registros duplicados exactos sin rechazar homónimos que compartan nombre
                  pero tengan distinta empresa o número de competidor.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/plantilla_participantes.csv"
                  download="plantilla_participantes.csv"
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-bold text-xs flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Descargar Plantilla CSV
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setCsvRawText(
                      `id,nombre_completo,empresa_equipo,numero_competidor,estado_acreditacion,observaciones_internas\nPIL-090,Matías Rojas,AeroAndes Racing,#190,habilitado,Homónimo válido con distinta empresa y número\nPIL-001,Matías Rojas,SkyTech Chile,#101,habilitado,Duplicado exacto de ID para probar bloqueo`
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs cursor-pointer"
                >
                  Cargar Ejemplo con Homónimo y Duplicado
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Subir archivo .CSV o pegar contenido:
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-sky-500 file:text-slate-950 hover:file:bg-sky-400 cursor-pointer"
                />
                <textarea
                  rows={5}
                  value={csvRawText}
                  onChange={(e) => setCsvRawText(e.target.value)}
                  placeholder="id,nombre_completo,empresa_equipo,numero_competidor,estado_acreditacion,observaciones_internas..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono"
                />
              </div>

              <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                {!csvPreview ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Suba un archivo CSV o pegue líneas a la izquierda para ver la vista previa y
                    validación antes de confirmar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 text-xs">
                      <span className="font-bold text-emerald-400">
                        ✓ Válidos para importar: {csvPreview.validCount}
                      </span>
                      <span className="font-bold text-amber-300">
                        ⚠ Homónimos distinguidos: {csvPreview.homonymCount}
                      </span>
                      <span className="font-bold text-rose-400">
                        ✕ Con errores/duplicados: {csvPreview.errorCount}
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {csvPreview.rows.map((r) => (
                        <div
                          key={r.rowNumber}
                          className={`p-2.5 rounded-lg border text-xs ${
                            !r.isValid
                              ? 'bg-rose-950/60 border-rose-700 text-rose-200'
                              : r.isHomonymWarning
                              ? 'bg-amber-950/60 border-amber-600 text-amber-100'
                              : 'bg-slate-900 border-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>
                              Fila {r.rowNumber}: {r.fullName || '(Sin nombre)'} ({r.id}) —{' '}
                              {r.companyOrTeam || 'Sin empresa'} • {r.competitorNumber || 'S/N'}
                            </span>
                            <span>{r.isValid ? 'VÁLIDO' : 'BLOQUEADO'}</span>
                          </div>
                          {r.errors.map((err, i) => (
                            <div key={i} className="text-rose-300 mt-0.5">
                              • Error: {err}
                            </div>
                          ))}
                          {r.warnings.map((w, i) => (
                            <div key={i} className="text-amber-300 mt-0.5">
                              • Aviso: {w}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCsvRawText('')}
                        className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        disabled={csvPreview.validCount === 0}
                        onClick={handleConfirmCsvImport}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs cursor-pointer"
                      >
                        Confirmar Importación ({csvPreview.validCount} válidos)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Roster Table & Manual Add/Edit + General DQ */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">
                Nómina Oficial del Evento ({participants.length} pilotos)
              </h2>
              <button
                type="button"
                onClick={() =>
                  setEditingParticipant({
                    isNew: true,
                    id: `PIL-${String(participants.length + 1).padStart(3, '0')}`,
                    fullName: '',
                    companyOrTeam: '',
                    competitorNumber: `#${100 + participants.length + 1}`,
                    accreditationStatus: 'pendiente',
                    internalNotes: '',
                  })
                }
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nuevo Participante
              </button>
            </div>

            {editingParticipant && (
              <form
                onSubmit={handleSaveParticipantModal}
                className="p-5 rounded-2xl bg-slate-950 border-2 border-sky-500 space-y-4"
              >
                <h3 className="text-sm font-extrabold text-white">
                  {editingParticipant.isNew
                    ? 'Registrar Nuevo Participante'
                    : `Editar Participante ${editingParticipant.id}`}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      ID Único
                    </label>
                    <input
                      type="text"
                      required
                      disabled={!editingParticipant.isNew}
                      value={editingParticipant.id}
                      onChange={(e) =>
                        setEditingParticipant({
                          ...editingParticipant,
                          id: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={editingParticipant.fullName}
                      onChange={(e) =>
                        setEditingParticipant({
                          ...editingParticipant,
                          fullName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Empresa o Equipo
                    </label>
                    <input
                      type="text"
                      value={editingParticipant.companyOrTeam}
                      onChange={(e) =>
                        setEditingParticipant({
                          ...editingParticipant,
                          companyOrTeam: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Número Competidor
                    </label>
                    <input
                      type="text"
                      value={editingParticipant.competitorNumber}
                      onChange={(e) =>
                        setEditingParticipant({
                          ...editingParticipant,
                          competitorNumber: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Estado Acreditación
                    </label>
                    <select
                      value={editingParticipant.accreditationStatus}
                      onChange={(e) =>
                        setEditingParticipant({
                          ...editingParticipant,
                          accreditationStatus: e.target
                            .value as Participant['accreditationStatus'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="habilitado">Habilitado</option>
                      <option value="rechazado">Rechazado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Observaciones Internas (Privadas)
                    </label>
                    <input
                      type="text"
                      value={editingParticipant.internalNotes}
                      onChange={(e) =>
                        setEditingParticipant({
                          ...editingParticipant,
                          internalNotes: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingParticipant(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer"
                  >
                    Guardar Piloto
                  </button>
                </div>
              </form>
            )}

            {/* DQ Modal */}
            {dqModalParticipant && (
              <div className="p-5 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-rose-100 space-y-3">
                <h3 className="text-base font-extrabold">
                  {dqModalParticipant.isDisqualified
                    ? `Levantar Descalificación General de ${dqModalParticipant.fullName}`
                    : `Aplicar Descalificación General (DQ) a ${dqModalParticipant.fullName}`}
                </h3>
                <p className="text-xs text-rose-200">
                  La descalificación general excluye al participante de los puestos premiables y lo
                  identifica como DQ en el ranking, conservando intactos todos sus resultados e
                  historial.
                </p>
                <input
                  type="text"
                  value={dqReasonInput}
                  onChange={(e) => setDqReasonInput(e.target.value)}
                  placeholder="Ingrese motivo obligatorio de la acción..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-rose-400 text-white text-xs"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDqModalParticipant(null);
                      setDqReasonInput('');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyOrLiftDQ}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Confirmar Acción DQ
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase">
                    <th className="py-2.5 px-3">ID / #</th>
                    <th className="py-2.5 px-3">Nombre Completo</th>
                    <th className="py-2.5 px-3">Empresa / Equipo</th>
                    <th className="py-2.5 px-3">Acreditación</th>
                    <th className="py-2.5 px-3">Notas Internas (Privado)</th>
                    <th className="py-2.5 px-3 text-right">Acciones Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {participants.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-950/60">
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-300">
                        {p.id} ({p.competitorNumber})
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        {p.fullName}
                        {p.isDisqualified && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold">
                            DQ GENERAL
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{p.companyOrTeam}</td>
                      <td className="py-2.5 px-3 uppercase font-bold">
                        <span
                          className={
                            p.accreditationStatus === 'habilitado'
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }
                        >
                          {p.accreditationStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
                        {p.internalNotes || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingParticipant({
                              isNew: false,
                              id: p.id,
                              fullName: p.fullName,
                              companyOrTeam: p.companyOrTeam,
                              competitorNumber: p.competitorNumber,
                              accreditationStatus: p.accreditationStatus,
                              internalNotes: p.internalNotes,
                            })
                          }
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDqModalParticipant(p);
                            setDqReasonInput('');
                          }}
                          className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                            p.isDisqualified
                              ? 'bg-emerald-950 border border-emerald-600 text-emerald-300'
                              : 'bg-rose-950 border border-rose-600 text-rose-300'
                          }`}
                        >
                          {p.isDisqualified ? 'Levantar DQ' : 'Aplicar DQ'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: RESULTADOS, ANULACIONES Y RESOLUCIÓN DE EMPATES PERSISTENTES   */}
      {/* ===================================================================== */}
      {activeTab === 'resultados_empates' && (
        <div className="space-y-6">
          {/* Live Competitor Ranking Table (Detailed vs Summary Mode) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  Ranking General de Competidores ({rankingData.rows.length} pilotos)
                </h2>
                <p className="text-xs text-slate-400">
                  Alterne entre la vista <strong>Detallada</strong> (desglose por cada pista) y la vista en <strong>Resumen</strong> (solo posición, nombre y puntos / tiempo total). Este cambio también se aplica en vivo a la Pantalla Pública 16:9.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-700 shrink-0">
                <button
                  type="button"
                  onClick={() => setEventRankingViewMode('detallado')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    (activeEvent.rankingViewMode || 'detallado') === 'detallado'
                      ? 'bg-sky-500 text-white shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Vista Detallada
                </button>
                <button
                  type="button"
                  onClick={() => setEventRankingViewMode('resumen')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    activeEvent.rankingViewMode === 'resumen'
                      ? 'bg-sky-500 text-white shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Vista en Resumen
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px] rounded-xl border border-slate-800">
              {activeEvent.rankingViewMode === 'resumen' ? (
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-xs font-extrabold">
                      <th className="py-3 px-4 w-24">Posición</th>
                      <th className="py-3 px-4">Competidor</th>
                      <th className="py-3 px-4 text-right text-amber-300">
                        Puntos / Tiempo Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {rankingData.rows.map((row) => {
                      let sumMs = 0;
                      let hasTime = false;
                      for (const t of tests) {
                        const c = row.testCells[t.id];
                        if (c && c.status === 'completado' && c.effectiveTimeMs !== null) {
                          sumMs += c.effectiveTimeMs;
                          hasTime = true;
                        }
                      }
                      return (
                        <tr key={row.participantId} className="hover:bg-slate-950/60">
                          <td className="py-2.5 px-4 font-black">
                            {row.isDisqualified ? (
                              <span className="px-2.5 py-0.5 rounded bg-rose-600 text-white text-xs">
                                DQ
                              </span>
                            ) : (
                              <span
                                className={`inline-flex w-8 h-7 rounded-lg items-center justify-center text-xs font-black ${
                                  row.position === 1
                                    ? 'bg-amber-400 text-slate-950'
                                    : row.position === 2
                                    ? 'bg-slate-300 text-slate-950'
                                    : row.position === 3
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-slate-800 text-white'
                                }`}
                              >
                                #{row.position}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="font-mono text-sky-400 font-bold mr-2">
                              {row.competitorNumber}
                            </span>
                            <span className="font-extrabold text-white">
                              {row.fullName}
                            </span>
                            <span className="text-xs text-slate-400 ml-2">
                              • {row.companyOrTeam}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            <span className="font-black text-amber-300 text-sm sm:text-base">
                              {formatScore(row.totalContribution)} pts
                            </span>
                            <span className="mx-2 text-slate-600">/</span>
                            <span className="font-bold text-sky-300">
                              {hasTime ? formatMsToTime(sumMs) : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-extrabold">
                      <th className="py-3 px-3 w-20">Pos</th>
                      <th className="py-3 px-3">Competidor</th>
                      {tests.map((t, idx) => (
                        <th key={t.id} className="py-3 px-3 text-right">
                          P{idx + 1}: {t.name}
                        </th>
                      ))}
                      <th className="py-3 px-4 text-right text-amber-300">
                        Total (Pts / Tiempo)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {rankingData.rows.map((row) => {
                      let sumMs = 0;
                      let hasTime = false;
                      for (const t of tests) {
                        const c = row.testCells[t.id];
                        if (c && c.status === 'completado' && c.effectiveTimeMs !== null) {
                          sumMs += c.effectiveTimeMs;
                          hasTime = true;
                        }
                      }
                      return (
                        <tr key={row.participantId} className="hover:bg-slate-950/60">
                          <td className="py-2.5 px-3 font-black">
                            {row.isDisqualified ? (
                              <span className="px-2 py-0.5 rounded bg-rose-600 text-white">
                                DQ
                              </span>
                            ) : (
                              <span
                                className={`inline-flex w-7 h-6 rounded items-center justify-center font-black ${
                                  row.position === 1
                                    ? 'bg-amber-400 text-slate-950'
                                    : row.position === 2
                                    ? 'bg-slate-300 text-slate-950'
                                    : row.position === 3
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-slate-800 text-white'
                                }`}
                              >
                                #{row.position}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white">
                              <span className="font-mono text-sky-400 mr-1.5">
                                {row.competitorNumber}
                              </span>
                              {row.fullName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {row.companyOrTeam}
                            </div>
                          </td>
                          {tests.map((t) => {
                            const cell = row.testCells[t.id];
                            return (
                              <td key={t.id} className="py-2.5 px-3 text-right font-mono">
                                {cell && cell.status === 'completado' ? (
                                  <div>
                                    <div className="font-extrabold text-white">
                                      {formatScore(cell.contribution)} pts
                                    </div>
                                    <div className="text-[11px] text-sky-300">
                                      {formatMsToTime(cell.effectiveTimeMs)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-500 uppercase font-bold">
                                    {cell?.status || 'Pend.'}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-4 text-right font-mono">
                            <div className="font-black text-amber-300 text-sm">
                              {formatScore(row.totalContribution)} pts
                            </div>
                            <div className="text-[11px] text-sky-300 font-bold">
                              {hasTime ? formatMsToTime(sumMs) : '—'}
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

          {/* Persistent Ties Resolution Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-extrabold text-white">
              Resolución de Empates Persistentes
            </h2>
            <p className="text-xs text-slate-400">
              Si dos o más pilotos empatan en puntaje total, Habilidades, Destreza y tiempo efectivo
              en Velocidad, el sistema muestra la misma posición y marca &ldquo;Desempate
              pendiente&rdquo; hasta que el Administrador registre una decisión fundada.
            </p>

            {persistentTieGroups.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                No existen empates persistentes en este momento.
              </div>
            ) : (
              <div className="space-y-4">
                {persistentTieGroups.map(([tieKey, groupRows]) => {
                  const existingRes = activeEvent.resolvedTies?.[tieKey];
                  const currentOrder =
                    tieOrderByGroup[tieKey] ||
                    groupRows.map((r) => r.participantId);

                  return (
                    <div
                      key={tieKey}
                      className="p-4 rounded-xl bg-slate-950 border border-amber-500/50 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase text-amber-300">
                          Grupo Empatado ({groupRows.length} pilotos — Total:{' '}
                          {formatScore(groupRows[0].totalContribution)} pts)
                        </span>
                        {existingRes && (
                          <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                            Resuelto: {existingRes.reason}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {currentOrder.map((pid, idx) => {
                          const row = groupRows.find((r) => r.participantId === pid);
                          if (!row) return null;
                          return (
                            <div
                              key={pid}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                            >
                              <span className="font-bold text-white">
                                Orden #{idx + 1}: {row.fullName} ({row.competitorNumber} —{' '}
                                {row.companyOrTeam})
                              </span>
                              <div className="flex gap-1">
                                {idx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...currentOrder];
                                      const tmp = next[idx - 1];
                                      next[idx - 1] = next[idx];
                                      next[idx] = tmp;
                                      setTieOrderByGroup((prev) => ({
                                        ...prev,
                                        [tieKey]: next,
                                      }));
                                    }}
                                    className="px-2 py-1 rounded bg-slate-800 text-sky-300 font-bold cursor-pointer"
                                  >
                                    ↑ Promover Puesto
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={tieReasonByGroup[tieKey] || ''}
                          onChange={(e) =>
                            setTieReasonByGroup((prev) => ({
                              ...prev,
                              [tieKey]: e.target.value,
                            }))
                          }
                          placeholder="Motivo oficial del desempate (ej. Vuelo de desempate supervisado por jurado)..."
                          className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await resolvePersistentTie({
                                tieGroupKey: tieKey,
                                orderedParticipantIds: currentOrder,
                                reason: tieReasonByGroup[tieKey] || '',
                              });
                              setBannerMsg({
                                type: 'success',
                                text: 'Desempate oficial registrado.',
                              });
                            } catch (err) {
                              setBannerMsg({
                                type: 'error',
                                text:
                                  err instanceof Error
                                    ? err.message
                                    : 'Error al resolver empate.',
                              });
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-xs cursor-pointer"
                        >
                          Aplicar Desempate
                        </button>
                        {existingRes && (
                          <button
                            type="button"
                            onClick={() =>
                              clearTieResolution(
                                tieKey,
                                'Reversión de desempate manual a empate compartido'
                              )
                            }
                            className="px-3 py-2 rounded-lg bg-slate-800 text-rose-300 font-bold text-xs cursor-pointer"
                          >
                            Restablecer Empate
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Results Table & Annulment Modal */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-extrabold text-white">
              Gestión de Resultados Oficiales, Correcciones y Anulaciones
            </h2>

            {annulModalResultId && (
              <div className="p-4 rounded-xl bg-rose-950/90 border-2 border-rose-500 text-rose-100 space-y-3">
                <div className="font-extrabold text-sm">
                  Anular Resultado Publicado (Recalcula automáticamente la prueba si era el mejor
                  tiempo)
                </div>
                <input
                  type="text"
                  value={annulReason}
                  onChange={(e) => setAnnulReason(e.target.value)}
                  placeholder="Ingrese motivo obligatorio de la anulación..."
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-rose-400 text-white text-xs"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnnulModalResultId(null);
                      setAnnulReason('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAnnul}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Confirmar Anulación Oficial
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase">
                    <th className="py-2.5 px-3">Piloto</th>
                    <th className="py-2.5 px-3">Prueba / Pista</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Tiempo Efectivo</th>
                    <th className="py-2.5 px-3">Puntaje Neto</th>
                    <th className="py-2.5 px-3">Aporte</th>
                    <th className="py-2.5 px-3">Versión / Autor</th>
                    <th className="py-2.5 px-3 text-right">Acciones Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {results.map((r) => {
                    const pilot = participants.find((p) => p.id === r.participantId);
                    const test = tests.find((t) => t.id === r.testId);
                    const track = tracks.find((tr) => tr.id === r.trackId);
                    return (
                      <tr key={r.id} className="hover:bg-slate-950/60">
                        <td className="py-2.5 px-3 font-bold text-white">
                          {pilot?.fullName || r.participantId}{' '}
                          <span className="text-sky-400 font-mono">
                            ({pilot?.competitorNumber})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {test?.name} • <span className="text-slate-400">{track?.name}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-extrabold uppercase ${
                              r.publicationStatus === 'anulado'
                                ? 'bg-rose-950 text-rose-300'
                                : r.publicationStatus === 'publicado'
                                ? 'bg-emerald-950 text-emerald-300'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {r.publicationStatus} ({r.participationStatus})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-200">
                          {formatMsToTime(r.effectiveTimeMs)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-200">
                          {formatScore(r.netScore)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-extrabold text-emerald-400">
                          {formatScore(r.contribution)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          v{r.version} (Intento #{r.attemptNumber}) • {r.updatedByName}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              onEditResultInForm({
                                participantId: r.participantId,
                                testId: r.testId,
                                trackId: r.trackId,
                              })
                            }
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold cursor-pointer"
                          >
                            Corregir / Repetir
                          </button>
                          {r.publicationStatus === 'publicado' && (
                            <button
                              type="button"
                              onClick={() => {
                                setAnnulModalResultId(r.id);
                                setAnnulReason('');
                              }}
                              className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-300 font-bold cursor-pointer"
                            >
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: GESTIÓN DE ACCESOS DEL STAFF                                   */}
      {/* ===================================================================== */}
      {activeTab === 'usuarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveUser}
            className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h2 className="text-lg font-extrabold text-white">
              Registrar o Editar Cuenta del Personal
            </h2>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Nombre del Operador
              </label>
              <input
                type="text"
                required
                value={userForm.displayName}
                onChange={(e) =>
                  setUserForm({ ...userForm, displayName: e.target.value })
                }
                placeholder="Ej: Camila Soto (Operador Pista 2)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={(e) =>
                  setUserForm({ ...userForm, email: e.target.value })
                }
                placeholder="operador@dronecomp.cl"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Perfil de Permisos
              </label>
              <select
                value={userForm.role}
                onChange={(e) =>
                  setUserForm({ ...userForm, role: e.target.value as UserRole })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
              >
                <option value="staff">
                  STAFF (Acredita y publica nuevos resultados; no modifica reglas ni sobrescribe)
                </option>
                <option value="admin">
                  ADMINISTRADOR (Control total, excepciones, anulaciones y configuración)
                </option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={userForm.active}
                onChange={(e) =>
                  setUserForm({ ...userForm, active: e.target.checked })
                }
              />
              Cuenta habilitada para operar
            </label>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs cursor-pointer"
            >
              {userForm.uid ? 'Actualizar Usuario' : 'Guardar Nuevo Usuario'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-extrabold text-white">
              Operadores y Administradores Autorizados
            </h2>
            <div className="space-y-2.5">
              {users.map((u) => (
                <div
                  key={u.uid}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-extrabold text-white text-sm flex items-center gap-2">
                      <span>{u.displayName}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          u.role === 'admin'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {u.role}
                      </span>
                      {!u.active && (
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px] font-bold">
                          INACTIVO
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {u.email} • UID: {u.uid}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setUserForm({
                        uid: u.uid,
                        email: u.email,
                        displayName: u.displayName,
                        role: u.role,
                        active: u.active,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 cursor-pointer"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: HISTORIAL DE AUDITORÍA INMUTABLE                               */}
      {/* ===================================================================== */}
      {activeTab === 'auditoria' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              Historial de Auditoría y Trazabilidad Completa
            </h2>
            <p className="text-xs text-slate-400">
              Registro inmutable de quién publicó, modificó o anuló cada resultado o regla, con
              fecha, rol, motivo y valores anteriores.
            </p>
          </div>

          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-extrabold uppercase">
                      {log.action}
                    </span>
                    <span className="font-bold text-white">
                      {log.actorName} ({log.actorRole.toUpperCase()})
                    </span>
                  </div>
                  <span className="text-slate-400 font-mono">
                    {new Date(log.timestamp).toLocaleString('es-CL')}
                  </span>
                </div>
                <div className="text-slate-200">
                  <strong>Motivo / Detalle:</strong> {log.reason}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Entidad: {log.entityType} ({log.entityId})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

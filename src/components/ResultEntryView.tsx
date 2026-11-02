import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Save,
  Send,
  RefreshCw,
  WifiOff,
  FileWarning,
  Calculator,
  User,
  Flag,
  MapPin,
} from 'lucide-react';
import {
  ConcurrencyConflictError,
  useCompetition,
} from '../context/CompetitionContext';
import {
  CompetitionResult,
  LocalDraft,
  ParticipationStatus,
} from '../types/domain';
import {
  calculateResultMetrics,
  formatMsToTime,
  formatScore,
  getBestEffectiveTimeMs,
  normalizeSearchText,
  parseTimeInputsToMs,
  splitMsToTimeInputs,
} from '../utils/scoring';
import {
  loadUserDraftsForEvent,
  removeUserDraft,
  saveUserDraft,
} from '../services/draftStorage';

interface ResultEntryViewProps {
  initialParticipantId?: string;
  initialTrackId?: string;
  initialTestId?: string;
}

export const ResultEntryView: React.FC<ResultEntryViewProps> = ({
  initialParticipantId,
  initialTrackId,
  initialTestId,
}) => {
  const {
    activeEvent,
    tracks,
    tests,
    participants,
    results,
    currentUser,
    isOnline,
    saveOrPublishResult,
  } = useCompetition();

  // Step 1 & 2 selections
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(
    initialParticipantId || participants.find((p) => p.accreditationStatus === 'habilitado')?.id || participants[0]?.id || ''
  );
  const [selectedTestId, setSelectedTestId] = useState<string>(
    initialTestId || tests[0]?.id || ''
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    initialTrackId || tracks[0]?.id || ''
  );

  // Step 3 form inputs (strings so empty values are never turned into 0 automatically!)
  const [participationStatus, setParticipationStatus] =
    useState<ParticipationStatus>('completado');
  const [rawScoreInput, setRawScoreInput] = useState<string>('');
  const [pointsPenaltyInput, setPointsPenaltyInput] = useState<string>('0');
  const [minutesInput, setMinutesInput] = useState<string>('');
  const [secondsInput, setSecondsInput] = useState<string>('');
  const [centisecondsInput, setCentisecondsInput] = useState<string>('');
  const [secondsPenaltyInput, setSecondsPenaltyInput] = useState<string>('0');
  const [observation, setObservation] = useState<string>('');

  // Admin exception & correction inputs
  const [adminExceptionReason, setAdminExceptionReason] = useState<string>('');
  const [adminCorrectionReason, setAdminCorrectionReason] = useState<string>('');
  const [isExtraordinaryRepeat, setIsExtraordinaryRepeat] = useState<boolean>(false);

  // Concurrency & Draft state
  const [baseServerVersion, setBaseServerVersion] = useState<number>(0);
  const [conflictModalResult, setConflictModalResult] =
    useState<CompetitionResult | null>(null);
  const [loadedFromLocalDraft, setLoadedFromLocalDraft] =
    useState<LocalDraft | null>(null);

  // Confirmation & submission lock (prevents double tap!)
  const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'published' | 'draft' | 'error';
    text: string;
  } | null>(null);

  const selectedParticipant = useMemo(
    () => participants.find((p) => p.id === selectedParticipantId) || null,
    [participants, selectedParticipantId]
  );

  const selectedTest = useMemo(
    () => tests.find((t) => t.id === selectedTestId) || null,
    [tests, selectedTestId]
  );

  const compatibleTracks = useMemo(() => {
    if (!selectedTest) return tracks;
    return tracks.filter((tr) => selectedTest.assignedTrackIds.includes(tr.id));
  }, [tracks, selectedTest]);

  // Ensure selectedTrackId is valid for selectedTest
  useEffect(() => {
    if (
      compatibleTracks.length > 0 &&
      !compatibleTracks.some((tr) => tr.id === selectedTrackId)
    ) {
      setSelectedTrackId(compatibleTracks[0].id);
    }
  }, [compatibleTracks, selectedTrackId]);

  const selectedTrack = useMemo(
    () => tracks.find((tr) => tr.id === selectedTrackId) || null,
    [tracks, selectedTrackId]
  );

  // Existing official/server result for (participantId, testId)
  const existingServerResult = useMemo(() => {
    if (!selectedParticipantId || !selectedTestId) return null;
    return (
      results.find(
        (r) =>
          r.participantId === selectedParticipantId &&
          r.testId === selectedTestId
      ) || null
    );
  }, [results, selectedParticipantId, selectedTestId]);

  // Load form values when switching (participantId, testId) or user
  useEffect(() => {
    if (!selectedParticipantId || !selectedTestId) return;
    setStatusMessage(null);
    setConflictModalResult(null);
    setAdminExceptionReason('');
    setAdminCorrectionReason('');
    setIsExtraordinaryRepeat(false);

    // 1. Check if current operator has a saved local draft for this (userUid, eventId, participantId, testId)
    const userDrafts = loadUserDraftsForEvent(currentUser?.uid, activeEvent.id);
    const slotKey = `${selectedParticipantId}__${selectedTestId}`;
    const localDraft = userDrafts[slotKey] || null;

    if (localDraft) {
      setLoadedFromLocalDraft(localDraft);
      setParticipationStatus(localDraft.participationStatus);
      setRawScoreInput(localDraft.rawScoreInput);
      setPointsPenaltyInput(localDraft.pointsPenaltyInput);
      setMinutesInput(localDraft.minutesInput);
      setSecondsInput(localDraft.secondsInput);
      setCentisecondsInput(localDraft.centisecondsInput);
      setSecondsPenaltyInput(localDraft.secondsPenaltyInput);
      setObservation(localDraft.observation);
      setBaseServerVersion(localDraft.baseServerVersion);
      if (localDraft.trackId) setSelectedTrackId(localDraft.trackId);
      return;
    }

    setLoadedFromLocalDraft(null);

    // 2. Otherwise populate from existing server result if present
    if (existingServerResult && existingServerResult.publicationStatus !== 'anulado') {
      setParticipationStatus(existingServerResult.participationStatus);
      setRawScoreInput(
        existingServerResult.rawScore !== null &&
          existingServerResult.rawScore !== undefined
          ? String(existingServerResult.rawScore)
          : ''
      );
      setPointsPenaltyInput(String(existingServerResult.pointsPenalty || 0));
      const splitTime = splitMsToTimeInputs(existingServerResult.registeredTimeMs);
      setMinutesInput(splitTime.minutes);
      setSecondsInput(splitTime.seconds);
      setCentisecondsInput(splitTime.centiseconds);
      setSecondsPenaltyInput(
        String(Math.round((existingServerResult.secondsPenaltyMs || 0) / 1000))
      );
      setObservation(existingServerResult.observation || '');
      setBaseServerVersion(existingServerResult.version);
      if (existingServerResult.trackId) {
        setSelectedTrackId(existingServerResult.trackId);
      }
    } else {
      // Clean blank form (do NOT prefill score or time with 0!)
      setParticipationStatus('completado');
      setRawScoreInput('');
      setPointsPenaltyInput('0');
      setMinutesInput('');
      setSecondsInput('');
      setCentisecondsInput('');
      setSecondsPenaltyInput('0');
      setObservation('');
      setBaseServerVersion(existingServerResult ? existingServerResult.version : 0);
    }
    // Intentionally trigger only when selection or operator changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParticipantId, selectedTestId, currentUser?.uid, activeEvent.id]);

  // Detect live concurrent modification by another operator while editing!
  const hasLiveVersionMismatch = Boolean(
    existingServerResult && existingServerResult.version > baseServerVersion
  );

  // Save local draft isolated by (userUid, eventId) automatically whenever operator edits
  const handlePersistLocalDraft = () => {
    if (!currentUser || !selectedParticipantId || !selectedTestId) return;
    const draft: LocalDraft = {
      key: `${currentUser.uid}__${activeEvent.id}__${selectedParticipantId}__${selectedTestId}`,
      userUid: currentUser.uid,
      eventId: activeEvent.id,
      participantId: selectedParticipantId,
      testId: selectedTestId,
      trackId: selectedTrackId,
      participationStatus,
      rawScoreInput,
      pointsPenaltyInput,
      minutesInput,
      secondsInput,
      centisecondsInput,
      secondsPenaltyInput,
      observation,
      baseServerVersion,
      savedAt: Date.now(),
    };
    saveUserDraft(draft);
    setLoadedFromLocalDraft(draft);
    setStatusMessage({
      type: 'draft',
      text: isOnline
        ? `Borrador local guardado para ${selectedParticipant?.fullName} (aislado para ${currentUser.displayName}).`
        : `MODO SIN CONEXIÓN: Borrador guardado localmente en su dispositivo. No se mostrará "Publicado" hasta reconectar y confirmar con el servidor.`,
    });
  };

  // Parse numeric inputs without turning empty fields into 0 automatically
  const parsedTime = useMemo(
    () => parseTimeInputsToMs(minutesInput, secondsInput, centisecondsInput),
    [minutesInput, secondsInput, centisecondsInput]
  );

  const parsedRawScore = useMemo(() => {
    if (rawScoreInput.trim() === '') return null;
    const n = Number(rawScoreInput.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }, [rawScoreInput]);

  const parsedPointsPenalty = useMemo(() => {
    if (pointsPenaltyInput.trim() === '') return 0;
    const n = Number(pointsPenaltyInput.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }, [pointsPenaltyInput]);

  const parsedSecondsPenaltyMs = useMemo(() => {
    if (secondsPenaltyInput.trim() === '') return 0;
    const n = Number(secondsPenaltyInput.replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 1000) : NaN;
  }, [secondsPenaltyInput]);

  // Live calculation preview
  const liveCalculation = useMemo(() => {
    if (!selectedTest) return null;
    const disqualifiedIds = new Set(
      participants.filter((p) => p.isDisqualified).map((p) => p.id)
    );
    const otherResults = results.filter(
      (r) =>
        r.testId === selectedTest.id &&
        r.participantId !== selectedParticipantId
    );
    const bestOtherMs = getBestEffectiveTimeMs(
      selectedTest.id,
      otherResults,
      disqualifiedIds
    );

    return calculateResultMetrics({
      test: selectedTest,
      participationStatus,
      rawScore: selectedTest.scoringMethod === 'manual' ? parsedRawScore : null,
      pointsPenalty: parsedPointsPenalty,
      registeredTimeMs: parsedTime.ms,
      secondsPenaltyMs: selectedTest.enableSecondsPenalty
        ? parsedSecondsPenaltyMs
        : 0,
      bestEffectiveTimeMsForTest: bestOtherMs,
      includeCandidateInBestTime:
        participationStatus === 'completado' &&
        !selectedParticipant?.isDisqualified,
    });
  }, [
    selectedTest,
    participants,
    results,
    selectedParticipantId,
    participationStatus,
    parsedRawScore,
    parsedPointsPenalty,
    parsedTime.ms,
    parsedSecondsPenaltyMs,
    selectedParticipant?.isDisqualified,
  ]);

  const filteredParticipants = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    if (!q) return participants;
    return participants.filter((p) => {
      const hay = `${p.normalizedName} ${normalizeSearchText(
        p.companyOrTeam
      )} ${normalizeSearchText(p.competitorNumber)} ${normalizeSearchText(p.id)}`;
      return hay.includes(q);
    });
  }, [participants, searchQuery]);

  // Execute server save/publish
  const executeSubmit = async (targetPublicationStatus: 'borrador' | 'publicado') => {
    if (isSubmitting || !selectedParticipant || !selectedTest || !selectedTrack) {
      return;
    }

    if (parsedTime.error) {
      setStatusMessage({ type: 'error', text: parsedTime.error });
      setShowPublishConfirmModal(false);
      return;
    }

    // If offline, automatically preserve local draft and refuse to show "Publicado"!
    if (!isOnline) {
      handlePersistLocalDraft();
      setShowPublishConfirmModal(false);
      setStatusMessage({
        type: 'error',
        text: 'Conexión interrumpida: sus datos se guardaron en el borrador local de su sesión. No se puede marcar como "Publicado" hasta recibir confirmación del servidor.',
      });
      return;
    }

    // If a version conflict was detected after reconnecting, require resolving conflict first!
    if (hasLiveVersionMismatch && existingServerResult) {
      setConflictModalResult(existingServerResult);
      setShowPublishConfirmModal(false);
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const saved = await saveOrPublishResult({
        participantId: selectedParticipant.id,
        testId: selectedTest.id,
        trackId: selectedTrack.id,
        participationStatus,
        targetPublicationStatus,
        rawScore: selectedTest.scoringMethod === 'manual' ? parsedRawScore : null,
        pointsPenalty: parsedPointsPenalty,
        registeredTimeMs: parsedTime.ms,
        secondsPenaltyMs: selectedTest.enableSecondsPenalty
          ? parsedSecondsPenaltyMs
          : 0,
        observation,
        expectedVersion: baseServerVersion,
        adminExceptionReason: adminExceptionReason.trim() || undefined,
        isExtraordinaryRepeat,
        adminCorrectionReason: adminCorrectionReason.trim() || undefined,
      });

      // Clear local draft upon confirmed server write
      removeUserDraft(
        currentUser?.uid,
        activeEvent.id,
        selectedParticipant.id,
        selectedTest.id
      );
      setLoadedFromLocalDraft(null);
      setBaseServerVersion(saved.version);
      setShowPublishConfirmModal(false);

      setStatusMessage({
        type: targetPublicationStatus === 'publicado' ? 'published' : 'draft',
        text:
          targetPublicationStatus === 'publicado'
            ? `✓ PUBLICADO CON CONFIRMACIÓN DEL SERVIDOR (v${saved.version}): Resultado oficial de ${
                selectedParticipant.fullName
              } en ${selectedTest.name} actualizado en el ranking.`
            : `Borrador sincronizado en el servidor (v${saved.version}) para ${selectedParticipant.fullName}.`,
      });
    } catch (err) {
      setShowPublishConfirmModal(false);
      if (err instanceof ConcurrencyConflictError) {
        setConflictModalResult(err.serverResult);
      } else {
        setStatusMessage({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Error al registrar el resultado.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resolve conflict by adopting server state or keeping local values on top of new server version
  const handleResolveConflictAdoptServer = () => {
    if (!conflictModalResult && !existingServerResult) return;
    const srv = conflictModalResult || existingServerResult!;
    removeUserDraft(
      currentUser?.uid,
      activeEvent.id,
      selectedParticipantId,
      selectedTestId
    );
    setLoadedFromLocalDraft(null);
    setParticipationStatus(srv.participationStatus);
    setRawScoreInput(srv.rawScore !== null ? String(srv.rawScore) : '');
    setPointsPenaltyInput(String(srv.pointsPenalty || 0));
    const split = splitMsToTimeInputs(srv.registeredTimeMs);
    setMinutesInput(split.minutes);
    setSecondsInput(split.seconds);
    setCentisecondsInput(split.centiseconds);
    setSecondsPenaltyInput(String(Math.round((srv.secondsPenaltyMs || 0) / 1000)));
    setObservation(srv.observation || '');
    setBaseServerVersion(srv.version);
    setConflictModalResult(null);
    setStatusMessage({
      type: 'draft',
      text: `Se cargaron los datos actuales del servidor (v${srv.version} por ${srv.updatedByName}).`,
    });
  };

  const handleResolveConflictKeepMyDraftOverNewVersion = () => {
    const srv = conflictModalResult || existingServerResult;
    if (!srv) return;
    setBaseServerVersion(srv.version);
    setConflictModalResult(null);
    setStatusMessage({
      type: 'draft',
      text: `Conflicto revisado: su formulario ahora apunta a la versión base v${srv.version}. Si el resultado ya fue publicado, solo un Administrador podrá sobrescribirlo con motivo.`,
    });
  };

  const isAlreadyPublishedOnServer =
    existingServerResult?.publicationStatus === 'publicado';
  const isStaffBlockedFromOverwriting =
    isAlreadyPublishedOnServer && currentUser?.role !== 'admin';

  return (
    <div className="space-y-5 pb-12">
      {/* Sticky Context Bar: Always displays Participant Name + Test + Track to prevent operator mistakes */}
      <div className="sticky top-16 z-30 bg-slate-900/95 backdrop-blur border-2 border-sky-500/50 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/40">
            <User className="w-4 h-4 text-sky-300" />
            <div>
              <div className="text-[10px] uppercase font-bold text-sky-300">
                Piloto Seleccionado
              </div>
              <div className="text-sm sm:text-base font-extrabold text-white">
                {selectedParticipant
                  ? `${selectedParticipant.fullName} (${selectedParticipant.competitorNumber})`
                  : 'Ninguno'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/40">
            <Flag className="w-4 h-4 text-amber-300" />
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-300">
                Prueba Activa ({selectedTest?.scoringMethod === 'time_calculated' ? 'Por Tiempo' : 'Manual'})
              </div>
              <div className="text-sm sm:text-base font-extrabold text-white">
                {selectedTest?.name || 'Ninguna'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Pista Física
              </div>
              <div className="text-sm font-bold text-slate-200">
                {selectedTrack?.name || '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {!isOnline && (
            <span className="px-3 py-1.5 rounded-xl bg-rose-950 border border-rose-600 text-rose-200 text-xs font-extrabold flex items-center gap-1.5 animate-pulse">
              <WifiOff className="w-4 h-4" /> SIN CONEXIÓN (Borrador Local)
            </span>
          )}
          {loadedFromLocalDraft && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
              Borrador local recuperado
            </span>
          )}
        </div>
      </div>

      {/* Live Concurrency Conflict Banner */}
      {(hasLiveVersionMismatch || conflictModalResult) && existingServerResult && (
        <div className="p-5 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-white shadow-2xl space-y-3">
          <div className="flex items-start gap-3">
            <FileWarning className="w-6 h-6 text-rose-300 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-extrabold text-rose-200">
                ¡Alerta de Concurrencia! Otro operador modificó este resultado
              </h3>
              <p className="text-xs sm:text-sm text-rose-100 mt-1">
                Mientras usted tenía abierto este formulario (versión base{' '}
                <strong>v{baseServerVersion}</strong>), el operador{' '}
                <strong>{existingServerResult.updatedByName}</strong> guardó la{' '}
                <strong>versión v{existingServerResult.version}</strong> con estado{' '}
                <strong className="uppercase">{existingServerResult.publicationStatus}</strong>{' '}
                (Aporte: {formatScore(existingServerResult.contribution)} pts). Debe resolver este
                conflicto antes de publicar un borrador desactualizado.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={handleResolveConflictAdoptServer}
              className="px-4 py-2.5 rounded-xl bg-white text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Cargar los datos del servidor (Recomendado)
            </button>
            <button
              type="button"
              onClick={handleResolveConflictKeepMyDraftOverNewVersion}
              className="px-4 py-2.5 rounded-xl bg-rose-800 hover:bg-rose-700 border border-rose-500 text-white font-bold text-xs cursor-pointer"
            >
              Conservar mis datos en pantalla y actualizar versión base a v{existingServerResult.version}
            </button>
          </div>
        </div>
      )}

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl border-2 text-sm font-bold flex items-center gap-3 ${
            statusMessage.type === 'published'
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
              : statusMessage.type === 'draft'
              ? 'bg-sky-950/90 border-sky-500 text-sky-200'
              : 'bg-rose-950/90 border-rose-500 text-rose-200'
          }`}
        >
          {statusMessage.type === 'published' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Step 1 (Participant) & Step 2 (Track & Test) */}
        <div className="lg:col-span-5 space-y-5">
          {/* STEP 1: Select Participant */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-300 text-xs font-extrabold uppercase">
                Paso 1 de 5
              </span>
              <span className="text-xs text-slate-400">Seleccionar Piloto</span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar piloto por nombre, empresa o #..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {filteredParticipants.map((p) => {
                const isSelected = p.id === selectedParticipantId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedParticipantId(p.id)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-950 border-sky-400 text-white'
                        : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <span className="text-sky-400 font-mono">{p.competitorNumber}</span>
                        <span>{p.fullName}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.companyOrTeam} • ID: {p.id}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        p.isDisqualified
                          ? 'bg-rose-950 text-rose-300 border border-rose-700'
                          : p.accreditationStatus === 'habilitado'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {p.isDisqualified
                        ? 'DQ'
                        : p.accreditationStatus === 'habilitado'
                        ? 'Habilitado'
                        : 'No Habilitado'}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedParticipant &&
              selectedParticipant.accreditationStatus !== 'habilitado' && (
                <div className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-200 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    Piloto NO Habilitado ({selectedParticipant.accreditationStatus.toUpperCase()})
                  </div>
                  <p>
                    Se impide publicar resultados de participantes no habilitados, salvo una
                    excepción autorizada por el Administrador con motivo registrado.
                  </p>
                  {currentUser?.role === 'admin' && (
                    <input
                      type="text"
                      value={adminExceptionReason}
                      onChange={(e) => setAdminExceptionReason(e.target.value)}
                      placeholder="Motivo de excepción administrativa (Obligatorio para publicar)..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-amber-500 text-white text-xs"
                    />
                  )}
                </div>
              )}
          </div>

          {/* STEP 2: Select Test & Track */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-300 text-xs font-extrabold uppercase">
                Paso 2 de 5
              </span>
              <span className="text-xs text-slate-400">Seleccionar Prueba y Pista</span>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-2">
                Modalidad de Evaluación (Prueba)
              </label>
              <div className="grid grid-cols-1 gap-2">
                {tests.map((test) => {
                  const resForTest = results.find(
                    (r) =>
                      r.participantId === selectedParticipantId &&
                      r.testId === test.id &&
                      r.publicationStatus === 'publicado'
                  );
                  const isSelected = test.id === selectedTestId;

                  return (
                    <button
                      key={test.id}
                      type="button"
                      onClick={() => setSelectedTestId(test.id)}
                      className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-sky-950 border-sky-400 text-white'
                          : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-sm flex items-center gap-2">
                          <span>{test.name}</span>
                          {test.status === 'cerrada' && (
                            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px]">
                              CERRADA
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Método:{' '}
                          {test.scoringMethod === 'time_calculated'
                            ? 'Calculado por tiempo'
                            : 'Puntaje manual'}{' '}
                          • Aporte máx: {formatScore(test.maxContribution)}%
                        </div>
                      </div>
                      {resForTest ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                          Ya Publicado ({formatScore(resForTest.contribution)})
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold">
                          Pendiente
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-2">
                Pista Física asignada a {selectedTest?.name}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {compatibleTracks.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => setSelectedTrackId(tr.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      tr.id === selectedTrackId
                        ? 'bg-emerald-950/70 border-emerald-400 text-white font-extrabold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold">{tr.name}</div>
                    <div className="text-[11px] text-slate-400 uppercase">{tr.status}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Step 3 (Values Entry), Step 4 (Calculation Preview), Step 5 (Publish) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Warning if an official published result already exists */}
          {isAlreadyPublishedOnServer && existingServerResult && (
            <div className="p-4 rounded-2xl bg-amber-950/80 border-2 border-amber-500/80 text-amber-100 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm">
                  <strong>Aviso de Resultado Oficial Existente:</strong> Ya existe un resultado
                  publicado (Intento #{existingServerResult.attemptNumber}, v
                  {existingServerResult.version}) para{' '}
                  <strong>{selectedParticipant?.fullName}</strong> en{' '}
                  <strong>{selectedTest?.name}</strong> registrado por{' '}
                  <em>{existingServerResult.updatedByName}</em>.
                </div>
              </div>

              {currentUser?.role !== 'admin' ? (
                <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-700 text-rose-200 text-xs font-bold">
                  Su perfil de Staff no permite sobrescribir resultados publicados. Para corregir o
                  registrar una repetición extraordinaria, cambie a o solicite autorización de un
                  Administrador.
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-amber-500/50 space-y-2.5">
                  <div className="text-xs font-bold text-amber-300 uppercase">
                    Autorización de Administrador (Conserva el intento anterior en el historial)
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!isExtraordinaryRepeat}
                        onChange={() => setIsExtraordinaryRepeat(false)}
                      />
                      <span>Corrección administrativa del intento actual</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={isExtraordinaryRepeat}
                        onChange={() => setIsExtraordinaryRepeat(true)}
                      />
                      <span>
                        Autorizar Repetición Extraordinaria (Nuevo Intento #
                        {existingServerResult.attemptNumber + 1})
                      </span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={adminCorrectionReason}
                    onChange={(e) => setAdminCorrectionReason(e.target.value)}
                    placeholder="Ingrese motivo obligatorio de la corrección o repetición extraordinaria..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-amber-500 text-white text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Score, Time, Penalties & Status */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-300 text-xs font-extrabold uppercase">
                Paso 3 de 5
              </span>
              <span className="text-xs text-slate-400">
                Ingresar Estado, {selectedTest?.scoringMethod === 'manual' ? 'Puntos, ' : ''}
                Tiempo y Penalizaciones
              </span>
            </div>

            {/* Participation Status Buttons */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-2">
                Estado de Participación en {selectedTest?.name}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(
                  [
                    { id: 'completado', label: 'Completado', color: 'emerald' },
                    { id: 'dnf', label: 'DNF (No Finalizó)', color: 'rose' },
                    { id: 'pendiente', label: 'Pendiente', color: 'amber' },
                    { id: 'dq', label: 'DQ en Prueba', color: 'rose' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setParticipationStatus(st.id)}
                    className={`py-3 px-3 rounded-xl border font-extrabold text-xs sm:text-sm transition cursor-pointer ${
                      participationStatus === st.id
                        ? st.id === 'completado'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : st.id === 'pendiente'
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-rose-600 text-white border-rose-400'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {participationStatus === 'completado' && selectedTest && (
              <div className="space-y-5">
                {/* Method A ONLY: Manual Raw Score */}
                {selectedTest.scoringMethod === 'manual' ? (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <label className="block text-xs font-extrabold uppercase text-sky-300 mb-1">
                      Puntaje Bruto del Juez (Máximo permitido: {selectedTest.maxBaseScore} pts)
                    </label>
                    <p className="text-xs text-slate-400 mb-2.5">
                      Ingrese el valor final entregado por los jueces para {selectedTest.name}.
                    </p>
                    <input
                      type="number"
                      min="0"
                      max={selectedTest.maxBaseScore}
                      step="0.01"
                      value={rawScoreInput}
                      onChange={(e) => setRawScoreInput(e.target.value)}
                      placeholder={`Ej: 88 (0 a ${selectedTest.maxBaseScore})`}
                      className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border-2 border-slate-700 focus:border-sky-500 text-white text-lg font-extrabold font-mono"
                    />
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-800/60 text-xs text-sky-200 flex items-center gap-2.5">
                    <Clock className="w-5 h-5 text-sky-400 shrink-0" />
                    <span>
                      <strong>Método Calculado por Tiempo ({selectedTest.name}):</strong> El
                      puntaje manual está deshabilitado porque el puntaje base se calcula
                      automáticamente en función del mejor tiempo efectivo válido de la prueba.
                    </span>
                  </div>
                )}

                {/* Time Input: Minutes, Seconds, Centiseconds */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-extrabold uppercase text-amber-300">
                      Tiempo Registrado (Límite: {(selectedTest.timeLimitMs / 1000).toFixed(0)}s =
                      05:00.00)
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMinutesInput('5');
                          setSecondsInput('00');
                          setCentisecondsInput('00');
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
                      >
                        Probar 300,00s exactos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMinutesInput('5');
                          setSecondsInput('01');
                          setCentisecondsInput('00');
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-rose-300 cursor-pointer"
                      >
                        Probar exceso 301,00s
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="block text-[11px] text-slate-400 font-bold mb-1">
                        Minutos (mm)
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={minutesInput}
                        onChange={(e) => setMinutesInput(e.target.value)}
                        placeholder="00"
                        className="w-full px-3 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-center text-lg font-extrabold font-mono"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400 font-bold mb-1">
                        Segundos (0-59)
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={secondsInput}
                        onChange={(e) => setSecondsInput(e.target.value)}
                        placeholder="00"
                        className="w-full px-3 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-center text-lg font-extrabold font-mono"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400 font-bold mb-1">
                        Centésimas (0-99)
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={centisecondsInput}
                        onChange={(e) => setCentisecondsInput(e.target.value)}
                        placeholder="00"
                        className="w-full px-3 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-center text-lg font-extrabold font-mono"
                      />
                    </div>
                  </div>

                  {parsedTime.ms !== null && (
                    <div className="mt-2 text-xs text-slate-400 font-mono flex items-center justify-between">
                      <span>
                        Tiempo registrado: <strong>{formatMsToTime(parsedTime.ms, true)}</strong>
                      </span>
                      <span>Almacenado exacto: {parsedTime.ms} ms</span>
                    </div>
                  )}

                  {/* Exceeds 300s limit warning & action */}
                  {liveCalculation?.exceedsTimeLimit && (
                    <div className="mt-3 p-3.5 rounded-xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs space-y-2.5">
                      <div className="font-extrabold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        ¡Tiempo registrado supera el límite de{' '}
                        {(selectedTest.timeLimitMs / 1000).toFixed(0)} segundos!
                      </div>
                      <p>
                        Al superar el límite de tiempo se impide publicar como completado. Debe
                        registrar como <strong>DNF</strong> o contar con una excepción
                        administrativa justificada.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setParticipationStatus('dnf')}
                          className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs cursor-pointer"
                        >
                          Cambiar estado a DNF ahora
                        </button>
                      </div>
                      {currentUser?.role === 'admin' && (
                        <input
                          type="text"
                          value={adminExceptionReason}
                          onChange={(e) => setAdminExceptionReason(e.target.value)}
                          placeholder="Excepción Admin: indique motivo justificado para permitir publicar sobre 300s..."
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-rose-400 text-white text-xs"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Penalties (Points Penalty & Seconds Penalty) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <label className="block text-xs font-bold uppercase text-rose-300 mb-1">
                      Penalización en Puntos Base (-Pts)
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Valor positivo a descontar del puntaje base antes de ponderar.
                    </p>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={pointsPenaltyInput}
                      onChange={(e) => setPointsPenaltyInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold font-mono"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[0, 2, 5, 10, 15].map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          onClick={() =>
                            setPointsPenaltyInput(
                              pts === 0
                                ? '0'
                                : String(
                                    (Number(pointsPenaltyInput.replace(',', '.')) || 0) + pts
                                  )
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-rose-300 border border-slate-700 cursor-pointer"
                        >
                          {pts === 0 ? 'Limpiar (0)' : `+${pts} pts`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedTest.enableSecondsPenalty && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                      <label className="block text-xs font-bold uppercase text-amber-300 mb-1">
                        Penalización en Segundos (+Seg)
                      </label>
                      <p className="text-[11px] text-slate-400 mb-2">
                        Segundos que se suman para el tiempo efectivo (después de evaluar límite).
                      </p>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={secondsPenaltyInput}
                        onChange={(e) => setSecondsPenaltyInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold font-mono"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[0, 2, 5, 10].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() =>
                              setSecondsPenaltyInput(
                                sec === 0
                                  ? '0'
                                  : String(
                                      (Number(secondsPenaltyInput.replace(',', '.')) || 0) + sec
                                    )
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 border border-slate-700 cursor-pointer"
                          >
                            {sec === 0 ? 'Limpiar (0s)' : `+${sec} seg`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Optional Observation */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                Observación de la Prueba (Opcional)
              </label>
              <input
                type="text"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Ej: Penalización de 2 puntos por roce en baliza 3..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
              />
            </div>
          </div>

          {/* STEP 4: Calculation Summary Card */}
          {selectedTest && liveCalculation && (
            <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-300 text-xs font-extrabold uppercase flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" />
                  Paso 4 de 5 • Resumen de Cálculo en Vivo
                </span>
                <span className="text-xs text-amber-300 font-semibold">
                  {selectedTest.status === 'abierta'
                    ? 'Puntaje Provisional (Prueba Abierta)'
                    : 'Prueba Cerrada'}
                </span>
              </div>

              {liveCalculation.validationErrors.length > 0 ? (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs space-y-1">
                  {liveCalculation.validationErrors.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                </div>
              ) : participationStatus === 'dnf' ? (
                <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-700 text-rose-200 text-sm font-bold flex items-center justify-between">
                  <span>Estado DNF (No Finalizó): Nunca se trata como tiempo 0s</span>
                  <span className="text-lg font-extrabold">Aporte: 0,00 pts (Muestra DNF)</span>
                </div>
              ) : participationStatus === 'pendiente' ? (
                <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-700 text-amber-200 text-sm font-bold flex items-center justify-between">
                  <span>Estado Pendiente: No equivale a 0 puntos</span>
                  <span className="text-lg font-extrabold">Muestra &ldquo;Pendiente&rdquo;</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[11px] uppercase text-slate-400 font-bold">
                      {selectedTest.scoringMethod === 'time_calculated'
                        ? 'Tiempo Efectivo'
                        : 'Tiempo Control'}
                    </div>
                    <div className="text-base font-extrabold text-white font-mono mt-1">
                      {formatMsToTime(liveCalculation.effectiveTimeMs)}
                    </div>
                    {selectedTest.scoringMethod === 'time_calculated' && (
                      <div className="text-[10px] text-sky-300 mt-0.5">
                        Mejor ref: {formatMsToTime(liveCalculation.referenceBestTimeMs)}
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[11px] uppercase text-slate-400 font-bold">
                      Puntaje Base
                    </div>
                    <div className="text-base font-extrabold text-white font-mono mt-1">
                      {formatScore(liveCalculation.calculatedBaseScore)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Máx: {selectedTest.maxBaseScore}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[11px] uppercase text-slate-400 font-bold">
                      Puntaje Neto
                    </div>
                    <div className="text-base font-extrabold text-sky-300 font-mono mt-1">
                      {formatScore(liveCalculation.netScore)}
                    </div>
                    <div className="text-[10px] text-rose-400 mt-0.5">
                      Desc.: -{formatScore(parsedPointsPenalty)} pts
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50">
                    <div className="text-[11px] uppercase text-emerald-300 font-extrabold">
                      Aporte al Ranking
                    </div>
                    <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
                      {formatScore(liveCalculation.contribution)}
                    </div>
                    <div className="text-[10px] text-emerald-300/80">
                      de {formatScore(selectedTest.maxContribution)} máx.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Save Draft or Publish Official Result */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={handlePersistLocalDraft}
              className="py-3.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Save className="w-4 h-4 text-sky-400" />
              Guardar Borrador Local
            </button>

            <button
              type="button"
              disabled={
                isSubmitting ||
                isStaffBlockedFromOverwriting ||
                Boolean(liveCalculation && liveCalculation.validationErrors.length > 0)
              }
              onClick={() => setShowPublishConfirmModal(true)}
              className="flex-1 py-4 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-base flex items-center justify-center gap-2 shadow-xl transition cursor-pointer"
            >
              <Send className="w-5 h-5" />
              {isSubmitting
                ? 'Confirmando con servidor...'
                : `Paso 5: Publicar Resultado de ${selectedParticipant?.fullName || 'Piloto'}`}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal with Pilot Name, Test, Track, and Calculated Score */}
      {showPublishConfirmModal && selectedParticipant && selectedTest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border-2 border-emerald-500 rounded-2xl p-6 shadow-2xl space-y-5">
            <h3 className="text-xl font-extrabold text-white">
              Confirmar Publicación Oficial en el Ranking
            </h3>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Piloto:</span>
                <span className="font-extrabold text-white">
                  {selectedParticipant.fullName} ({selectedParticipant.competitorNumber})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Empresa / Equipo:</span>
                <span className="font-semibold text-sky-300">
                  {selectedParticipant.companyOrTeam}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Prueba y Pista:</span>
                <span className="font-bold text-amber-300">
                  {selectedTest.name} — {selectedTrack?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Estado de Participación:</span>
                <span className="font-extrabold uppercase text-white">
                  {participationStatus}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800">
                <span className="text-slate-300 font-bold">Aporte Calculado:</span>
                <span className="text-lg font-extrabold text-emerald-400 font-mono">
                  {participationStatus === 'dnf'
                    ? 'DNF (0,00 pts)'
                    : `${formatScore(liveCalculation?.contribution)} pts`}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowPublishConfirmModal(false)}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm cursor-pointer"
              >
                Cancelar y Revisar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => executeSubmit('publicado')}
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                {isSubmitting ? 'Publicando...' : `Confirmar y Publicar a ${selectedParticipant.fullName}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

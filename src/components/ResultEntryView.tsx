import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Save,
  Send,
  RefreshCw,
  WifiOff,
  FileWarning,
  User,
  Flag,
  Zap,
  Sliders,
  Trophy,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Ban,
  Hourglass,
  Check,
  Building2,
  Hash,
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

  // 1. Participant & Unified Track/Test selection
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(
    initialParticipantId || participants[0]?.id || ''
  );
  const [selectedTestId, setSelectedTestId] = useState<string>(
    initialTestId || tests[0]?.id || ''
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    initialTrackId || tracks[0]?.id || ''
  );

  // 3. Time & Score inputs
  const [participationStatus, setParticipationStatus] =
    useState<ParticipationStatus>('completado');
  const [rawScoreInput, setRawScoreInput] = useState<string>('');
  const [pointsPenaltyInput, setPointsPenaltyInput] = useState<string>('0');
  const [minutesInput, setMinutesInput] = useState<string>('');
  const [secondsInput, setSecondsInput] = useState<string>('');
  const [centisecondsInput, setCentisecondsInput] = useState<string>('');
  const [secondsPenaltyInput, setSecondsPenaltyInput] = useState<string>('0');
  const [observation, setObservation] = useState<string>('');
  const [showAdvancedPenalties, setShowAdvancedPenalties] = useState<boolean>(false);

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

  // Confirmation & submission lock
  const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'published' | 'draft' | 'error';
    text: string;
  } | null>(null);

  // Sync props when navigating from Dashboard or Admin
  useEffect(() => {
    if (initialParticipantId) setSelectedParticipantId(initialParticipantId);
    if (initialTestId) setSelectedTestId(initialTestId);
    if (initialTrackId) setSelectedTrackId(initialTrackId);
  }, [initialParticipantId, initialTestId, initialTrackId]);

  const selectedParticipant = useMemo(
    () => participants.find((p) => p.id === selectedParticipantId) || null,
    [participants, selectedParticipantId]
  );

  const selectedTest = useMemo(
    () => tests.find((t) => t.id === selectedTestId) || null,
    [tests, selectedTestId]
  );

  // Automatically bind Track to the selected Test (Unified Pista / Prueba)
  useEffect(() => {
    if (!selectedTest) return;
    const compatible = tracks.filter((tr) =>
      selectedTest.assignedTrackIds.includes(tr.id)
    );
    if (
      compatible.length > 0 &&
      !compatible.some((tr) => tr.id === selectedTrackId)
    ) {
      setSelectedTrackId(compatible[0].id);
    } else if (compatible.length === 0 && tracks.length > 0 && !selectedTrackId) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [selectedTest, tracks, selectedTrackId]);

  const selectedTrack = useMemo(
    () => tracks.find((tr) => tr.id === selectedTrackId) || tracks[0] || null,
    [tracks, selectedTrackId]
  );

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
      if (
        (existingServerResult.pointsPenalty || 0) > 0 ||
        (existingServerResult.secondsPenaltyMs || 0) > 0 ||
        existingServerResult.observation
      ) {
        setShowAdvancedPenalties(true);
      } else {
        setShowAdvancedPenalties(false);
      }
    } else {
      setParticipationStatus('completado');
      setRawScoreInput('');
      setPointsPenaltyInput('0');
      setMinutesInput('');
      setSecondsInput('');
      setCentisecondsInput('');
      setSecondsPenaltyInput('0');
      setObservation('');
      setBaseServerVersion(existingServerResult ? existingServerResult.version : 0);
      setShowAdvancedPenalties(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParticipantId, selectedTestId, currentUser?.uid, activeEvent.id]);

  const hasLiveVersionMismatch = Boolean(
    existingServerResult && existingServerResult.version > baseServerVersion
  );

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
        ? `Borrador guardado para ${selectedParticipant?.fullName}`
        : `Guardado en modo offline`,
    });
  };

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

  const executeSubmit = async (targetPublicationStatus: 'borrador' | 'publicado') => {
    if (isSubmitting || !selectedParticipant || !selectedTest || !selectedTrack) {
      return;
    }

    if (parsedTime.error) {
      setStatusMessage({ type: 'error', text: parsedTime.error });
      setShowPublishConfirmModal(false);
      return;
    }

    if (!isOnline) {
      handlePersistLocalDraft();
      setShowPublishConfirmModal(false);
      setStatusMessage({
        type: 'error',
        text: 'Sin conexión: guardado en borrador local.',
      });
      return;
    }

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
            ? `Resultado publicado: ${selectedParticipant.fullName} • ${selectedTest.name}`
            : `Borrador guardado`,
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
      text: `Datos actualizados (v${srv.version})`,
    });
  };

  const handleResolveConflictKeepMyDraftOverNewVersion = () => {
    const srv = conflictModalResult || existingServerResult;
    if (!srv) return;
    setBaseServerVersion(srv.version);
    setConflictModalResult(null);
  };

  const isAlreadyPublishedOnServer =
    existingServerResult?.publicationStatus === 'publicado';
  const isStaffBlockedFromOverwriting =
    isAlreadyPublishedOnServer && currentUser?.role !== 'admin';

  const hasActivePenalties =
    parsedPointsPenalty > 0 || parsedSecondsPenaltyMs > 0 || observation.trim().length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      {/* Alerts & Status Notifications */}
      {!isOnline && (
        <div className="px-4 py-2.5 rounded-2xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-rose-400 animate-pulse" />
            Modo sin conexión — Los tiempos se guardan localmente
          </span>
          {loadedFromLocalDraft && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
              Borrador activo
            </span>
          )}
        </div>
      )}

      {(hasLiveVersionMismatch || conflictModalResult) && existingServerResult && (
        <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileWarning className="w-5 h-5 text-rose-300 shrink-0" />
            <div className="text-xs">
              <div className="font-extrabold text-rose-200">
                Actualizado por {existingServerResult.updatedByName} (v{existingServerResult.version})
              </div>
              <div className="text-rose-300">
                Aporte actual: {formatScore(existingServerResult.contribution)} pts
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResolveConflictAdoptServer}
              className="px-3 py-1.5 rounded-xl bg-white text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Cargar actual
            </button>
            <button
              type="button"
              onClick={handleResolveConflictKeepMyDraftOverNewVersion}
              className="px-3 py-1.5 rounded-xl bg-rose-800 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
            >
              Mantener el mío
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`px-4 py-3 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 transition ${
            statusMessage.type === 'published'
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
              : statusMessage.type === 'draft'
              ? 'bg-sky-950/80 border-sky-500/60 text-sky-200'
              : 'bg-rose-950/80 border-rose-500/60 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'published' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 1: BUSCADOR DE PARTICIPANTE                                    */}
      {/* =================================================================== */}
      <section className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-400 font-black text-xs flex items-center justify-center">
              1
            </span>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <User className="w-4 h-4 text-sky-400" />
              Participante
            </h2>
          </div>

          {selectedParticipant && (
            <span className="px-2.5 py-1 rounded-full bg-slate-800 text-sky-300 font-mono text-xs font-bold flex items-center gap-1.5">
              <Hash className="w-3 h-3" />
              {selectedParticipant.competitorNumber.replace('#', '')}
            </span>
          )}
        </div>

        {/* Search Input + Quick Results */}
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchDropdownOpen(true);
            }}
            placeholder="Buscar piloto por nombre, # número o equipo..."
            className="w-full pl-12 pr-10 py-3.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-sky-500 text-white text-sm sm:text-base font-medium focus:outline-none transition shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIsSearchDropdownOpen(false);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Selected Pilot Card or Filtered List */}
        {(isSearchDropdownOpen || searchQuery.trim().length > 0) ? (
          <div className="max-h-60 overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800 divide-y divide-slate-800/60">
            {filteredParticipants.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No se encontraron pilotos con &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredParticipants.map((p) => {
                const isSelected = p.id === selectedParticipantId;
                const completedCount = results.filter(
                  (r) =>
                    r.participantId === p.id &&
                    r.publicationStatus === 'publicado'
                ).length;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedParticipantId(p.id);
                      setSearchQuery('');
                      setIsSearchDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/15 text-white'
                        : 'hover:bg-slate-900 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-mono text-xs font-extrabold shrink-0 ${
                          isSelected
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-slate-800 text-sky-300'
                        }`}
                      >
                        {p.competitorNumber}
                      </span>
                      <div className="truncate">
                        <div className="font-bold text-sm truncate flex items-center gap-2">
                          <span>{p.fullName}</span>
                          {p.isDisqualified && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[10px] font-black">
                              DQ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{p.companyOrTeam}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
                        {completedCount}/{tests.length}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-sky-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          selectedParticipant && (
            <div
              onClick={() => setIsSearchDropdownOpen(true)}
              className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/60 via-slate-950 to-slate-950 border border-sky-500/40 flex items-center justify-between gap-4 cursor-pointer hover:border-sky-400 transition group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-sky-500 text-slate-950 font-black font-mono text-base flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/20">
                  {selectedParticipant.competitorNumber}
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-lg font-extrabold text-white truncate flex items-center gap-2">
                    <span>{selectedParticipant.fullName}</span>
                    {selectedParticipant.isDisqualified && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black">
                        DQ
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-sky-300/90 font-medium flex items-center gap-1.5 truncate">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{selectedParticipant.companyOrTeam}</span>
                  </div>
                </div>
              </div>

              <span className="px-3 py-1.5 rounded-xl bg-slate-900 group-hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 flex items-center gap-1.5 shrink-0">
                Cambiar
                <ChevronDown className="w-3.5 h-3.5" />
              </span>
            </div>
          )
        )}
      </section>

      {/* =================================================================== */}
      {/* STEP 2: SELECCIONAR PISTA / PRUEBA (UNIFICADO)                      */}
      {/* =================================================================== */}
      <section className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs flex items-center justify-center">
              2
            </span>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber-400" />
              Pista / Prueba
            </h2>
          </div>

          {selectedTrack && (
            <span className="text-xs text-slate-400 font-semibold">
              {selectedTrack.name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tests.map((test, idx) => {
            const resForTest = results.find(
              (r) =>
                r.participantId === selectedParticipantId &&
                r.testId === test.id &&
                r.publicationStatus === 'publicado'
            );
            const isSelected = test.id === selectedTestId;
            const isTimeMethod = test.scoringMethod === 'time_calculated';
            const trackForTest =
              tracks.find((tr) => test.assignedTrackIds.includes(tr.id)) ||
              tracks[idx] ||
              tracks[0];

            return (
              <button
                key={test.id}
                type="button"
                onClick={() => {
                  setSelectedTestId(test.id);
                  if (trackForTest) setSelectedTrackId(trackForTest.id);
                }}
                className={`p-4 rounded-2xl border-2 text-left transition flex flex-col justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? 'bg-sky-950/70 border-sky-400 text-white shadow-lg shadow-sky-500/10'
                    : 'bg-slate-950/70 hover:bg-slate-950 border-slate-800/90 text-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isTimeMethod ? (
                      <Zap className="w-5 h-5" />
                    ) : (
                      <Sliders className="w-5 h-5" />
                    )}
                  </div>

                  {resForTest ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-extrabold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {formatScore(resForTest.contribution)} pts
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[11px] font-semibold">
                      Pendiente
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                    Pista {idx + 1}
                  </div>
                  <div className="font-extrabold text-base text-white leading-snug">
                    {test.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>
                      {isTimeMethod ? 'Por Tiempo' : `Tiempo + Juez (${test.maxBaseScore}p)`}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* =================================================================== */}
      {/* STEP 3: INGRESO DE TIEMPO Y PUBLICACIÓN                             */}
      {/* =================================================================== */}
      <section className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        {/* Top Row: Step Header + Compact Status Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-xs flex items-center justify-center">
              3
            </span>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Tiempo en {selectedTest?.name}
            </h2>
          </div>

          {/* Compact Icon Status Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(
              [
                { id: 'completado', label: 'Válido', icon: CheckCircle2, activeCls: 'bg-emerald-500 text-slate-950' },
                { id: 'dnf', label: 'DNF', icon: Ban, activeCls: 'bg-rose-600 text-white' },
                { id: 'dq', label: 'DQ', icon: AlertTriangle, activeCls: 'bg-rose-600 text-white' },
                { id: 'pendiente', label: 'Pendiente', icon: Hourglass, activeCls: 'bg-amber-500 text-slate-950' },
              ] as const
            ).map((st) => {
              const Icon = st.icon;
              const active = participationStatus === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setParticipationStatus(st.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                    active
                      ? st.activeCls
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Existing Published Result Notice (Compact) */}
        {isAlreadyPublishedOnServer && existingServerResult && (
          <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/50 text-amber-100 text-xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
                Resultado ya publicado (Intento #{existingServerResult.attemptNumber})
              </span>
              {currentUser?.role !== 'admin' && (
                <span className="text-rose-300 font-bold">
                  Solo Admin puede modificar
                </span>
              )}
            </div>

            {currentUser?.role === 'admin' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="flex items-center gap-3 bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!isExtraordinaryRepeat}
                      onChange={() => setIsExtraordinaryRepeat(false)}
                    />
                    <span>Corregir actual</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={isExtraordinaryRepeat}
                      onChange={() => setIsExtraordinaryRepeat(true)}
                    />
                    <span>Nuevo intento (#{existingServerResult.attemptNumber + 1})</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={adminCorrectionReason}
                  onChange={(e) => setAdminCorrectionReason(e.target.value)}
                  placeholder="Motivo de corrección o repetición..."
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/60 text-white text-xs focus:outline-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Main Time Entry Box */}
        {participationStatus === 'completado' && selectedTest && (
          <div className="space-y-4">
            {/* Digital Stopwatch Input */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  Cronómetro Oficial (MM : SS . CC)
                </span>
                <span className="font-mono text-[11px]">
                  Máx: {(selectedTest.timeLimitMs / 1000).toFixed(0)}s
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-4 items-center">
                <div className="text-center">
                  <input
                    type="number"
                    min="0"
                    value={minutesInput}
                    onChange={(e) => setMinutesInput(e.target.value)}
                    placeholder="00"
                    className="w-full py-4 px-2 rounded-2xl bg-slate-900 border-2 border-slate-800 focus:border-sky-500 text-white text-center text-2xl sm:text-3xl font-black font-mono focus:outline-none transition"
                  />
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1.5">
                    Minutos
                  </span>
                </div>

                <div className="text-center">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={secondsInput}
                    onChange={(e) => setSecondsInput(e.target.value)}
                    placeholder="00"
                    className="w-full py-4 px-2 rounded-2xl bg-slate-900 border-2 border-slate-800 focus:border-sky-500 text-white text-center text-2xl sm:text-3xl font-black font-mono focus:outline-none transition"
                  />
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1.5">
                    Segundos
                  </span>
                </div>

                <div className="text-center">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={centisecondsInput}
                    onChange={(e) => setCentisecondsInput(e.target.value)}
                    placeholder="00"
                    className="w-full py-4 px-2 rounded-2xl bg-slate-900 border-2 border-slate-800 focus:border-sky-500 text-sky-300 text-center text-2xl sm:text-3xl font-black font-mono focus:outline-none transition"
                  />
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1.5">
                    Centésimas
                  </span>
                </div>
              </div>

              {/* Time Limit Exceeded Inline Action */}
              {liveCalculation?.exceedsTimeLimit && (
                <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    Supera el límite ({(selectedTest.timeLimitMs / 1000).toFixed(0)}s)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setParticipationStatus('dnf')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs cursor-pointer"
                    >
                      Marcar DNF
                    </button>
                    {currentUser?.role === 'admin' && (
                      <input
                        type="text"
                        value={adminExceptionReason}
                        onChange={(e) => setAdminExceptionReason(e.target.value)}
                        placeholder="Motivo excepción Admin..."
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-rose-400 text-white text-xs"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Judge Score (Only when the selected track/test uses manual scoring) */}
            {selectedTest.scoringMethod === 'manual' && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase text-white">
                      Puntaje de Juez (0 – {selectedTest.maxBaseScore} pts)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Evaluación técnica de {selectedTest.name}
                    </div>
                  </div>
                </div>

                <input
                  type="number"
                  min="0"
                  max={selectedTest.maxBaseScore}
                  step="0.01"
                  value={rawScoreInput}
                  onChange={(e) => setRawScoreInput(e.target.value)}
                  placeholder={`0 - ${selectedTest.maxBaseScore}`}
                  className="w-full sm:w-40 px-4 py-3 rounded-xl bg-slate-900 border-2 border-slate-700 focus:border-sky-500 text-white text-center text-xl font-black font-mono focus:outline-none"
                />
              </div>
            )}

            {/* Collapsible Penalties & Notes */}
            <div className="rounded-2xl bg-slate-950/60 border border-slate-800/80 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedPenalties((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>Penalizaciones y Observaciones (Opcional)</span>
                  {hasActivePenalties && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
                      Activo
                    </span>
                  )}
                </span>
                {showAdvancedPenalties ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showAdvancedPenalties && (
                <div className="p-4 pt-2 border-t border-slate-800/80 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedTest.enableSecondsPenalty && (
                      <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold uppercase text-amber-300">
                            + Segundos Penalización
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={secondsPenaltyInput}
                            onChange={(e) => setSecondsPenaltyInput(e.target.value)}
                            className="w-20 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white text-right font-mono text-xs font-bold"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
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
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-amber-300 cursor-pointer"
                            >
                              {sec === 0 ? '0s' : `+${sec}s`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase text-rose-300">
                          - Puntos Descuento
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={pointsPenaltyInput}
                          onChange={(e) => setPointsPenaltyInput(e.target.value)}
                          className="w-20 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white text-right font-mono text-xs font-bold"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[0, 2, 5, 10].map((pts) => (
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
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-rose-300 cursor-pointer"
                          >
                            {pts === 0 ? '0p' : `-${pts}p`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    placeholder="Nota u observación opcional..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compact Live Score & Time Summary Pill */}
        {selectedTest && liveCalculation && (
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Tiempo Efectivo
                </div>
                <div className="text-lg font-black text-white font-mono">
                  {participationStatus === 'completado'
                    ? formatMsToTime(liveCalculation.effectiveTimeMs)
                    : participationStatus.toUpperCase()}
                </div>
              </div>

              <div className="h-8 w-px bg-slate-800" />

              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Puntaje Neto
                </div>
                <div className="text-lg font-black text-sky-300 font-mono">
                  {formatScore(liveCalculation.netScore)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-emerald-950/50 border border-emerald-500/40 px-4 py-2 rounded-xl">
              <Trophy className="w-5 h-5 text-emerald-400" />
              <div className="text-right">
                <div className="text-[10px] uppercase font-extrabold text-emerald-300">
                  Aporte Ranking
                </div>
                <div className="text-xl font-black text-emerald-400 font-mono leading-tight">
                  {formatScore(liveCalculation.contribution)}{' '}
                  <span className="text-xs font-normal text-emerald-300/70">
                    / {formatScore(selectedTest.maxContribution)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handlePersistLocalDraft}
            title="Guardar borrador local"
            className="py-3.5 px-4 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Save className="w-4 h-4 text-sky-400" />
            <span>Borrador</span>
          </button>

          <button
            type="button"
            disabled={
              isSubmitting ||
              isStaffBlockedFromOverwriting ||
              Boolean(liveCalculation && liveCalculation.validationErrors.length > 0)
            }
            onClick={() => setShowPublishConfirmModal(true)}
            className="flex-1 py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/15 transition cursor-pointer"
          >
            <Send className="w-5 h-5" />
            {isSubmitting
              ? 'Publicando...'
              : `Publicar Resultado • ${selectedParticipant?.fullName.split(' ')[0] || 'Piloto'}`}
          </button>
        </div>
      </section>

      {/* Clean Confirmation Modal */}
      {showPublishConfirmModal && selectedParticipant && selectedTest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Confirmar Resultado
              </h3>
              <button
                type="button"
                onClick={() => setShowPublishConfirmModal(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Piloto</span>
                <span className="font-extrabold text-white">
                  {selectedParticipant.fullName} ({selectedParticipant.competitorNumber})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Pista / Prueba</span>
                <span className="font-bold text-sky-300">
                  {selectedTest.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Tiempo Efectivo</span>
                <span className="font-mono font-bold text-white">
                  {participationStatus === 'completado'
                    ? formatMsToTime(liveCalculation?.effectiveTimeMs)
                    : participationStatus.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2.5 border-t border-slate-800">
                <span className="text-slate-300 font-bold">Aporte al Ranking</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  {participationStatus === 'dnf'
                    ? 'DNF (0,00 pts)'
                    : `${formatScore(liveCalculation?.contribution)} pts`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowPublishConfirmModal(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => executeSubmit('publicado')}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSubmitting ? 'Publicando...' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

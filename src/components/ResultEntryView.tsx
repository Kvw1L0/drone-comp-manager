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
  Sliders,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Ban,
  Check,
  Zap,
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

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(
    initialParticipantId || participants[0]?.id || ''
  );
  const [selectedTestId, setSelectedTestId] = useState<string>(
    initialTestId || tests[0]?.id || ''
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    initialTrackId || tracks[0]?.id || ''
  );

  const [participationStatus, setParticipationStatus] =
    useState<ParticipationStatus>('completado');
  const [rawScoreInput, setRawScoreInput] = useState<string>('');
  const [pointsPenaltyInput, setPointsPenaltyInput] = useState<string>('0');
  const [minutesInput, setMinutesInput] = useState<string>('');
  const [secondsInput, setSecondsInput] = useState<string>('');
  const [centisecondsInput, setCentisecondsInput] = useState<string>('');
  const [secondsPenaltyInput, setSecondsPenaltyInput] = useState<string>('0');
  const [observation, setObservation] = useState<string>('');
  const [showPenalties, setShowPenalties] = useState<boolean>(false);

  const [adminExceptionReason, setAdminExceptionReason] = useState<string>('');
  const [adminCorrectionReason, setAdminCorrectionReason] = useState<string>('');
  const [isExtraordinaryRepeat, setIsExtraordinaryRepeat] = useState<boolean>(false);

  const [baseServerVersion, setBaseServerVersion] = useState<number>(0);
  const [conflictModalResult, setConflictModalResult] =
    useState<CompetitionResult | null>(null);
  const [loadedFromLocalDraft, setLoadedFromLocalDraft] =
    useState<LocalDraft | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'published' | 'draft' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (initialParticipantId) setSelectedParticipantId(initialParticipantId);
    if (initialTestId) setSelectedTestId(initialTestId);
    if (initialTrackId) setSelectedTrackId(initialTrackId);
  }, [initialParticipantId, initialTestId, initialTrackId]);

  const currentParticipantIndex = useMemo(
    () => participants.findIndex((p) => p.id === selectedParticipantId),
    [participants, selectedParticipantId]
  );

  const selectedParticipant = useMemo(
    () => participants[currentParticipantIndex] || participants[0] || null,
    [participants, currentParticipantIndex]
  );

  const selectedTest = useMemo(
    () => tests.find((t) => t.id === selectedTestId) || tests[0] || null,
    [tests, selectedTestId]
  );

  // Unified Pista/Prueba binding
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
      setShowPenalties(
        (existingServerResult.pointsPenalty || 0) > 0 ||
          (existingServerResult.secondsPenaltyMs || 0) > 0 ||
          Boolean(existingServerResult.observation)
      );
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
      setShowPenalties(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParticipantId, selectedTestId, currentUser?.uid, activeEvent.id]);

  const hasLiveVersionMismatch = Boolean(
    existingServerResult && existingServerResult.version > baseServerVersion
  );

  const handleClearInputs = () => {
    setParticipationStatus('completado');
    setMinutesInput('');
    setSecondsInput('');
    setCentisecondsInput('');
    setRawScoreInput('');
    setPointsPenaltyInput('0');
    setSecondsPenaltyInput('0');
    setObservation('');
  };

  const handleStepPilot = (delta: number) => {
    if (participants.length === 0) return;
    const nextIdx =
      (currentParticipantIndex + delta + participants.length) %
      participants.length;
    setSelectedParticipantId(participants[nextIdx].id);
    setIsSearchOpen(false);
  };

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
      text: isOnline ? 'Borrador guardado' : 'Guardado offline',
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
      return;
    }

    if (!isOnline) {
      handlePersistLocalDraft();
      setStatusMessage({
        type: 'error',
        text: 'Sin conexión: guardado en borrador local.',
      });
      return;
    }

    if (hasLiveVersionMismatch && existingServerResult) {
      setConflictModalResult(existingServerResult);
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

      setStatusMessage({
        type: targetPublicationStatus === 'publicado' ? 'published' : 'draft',
        text:
          targetPublicationStatus === 'publicado'
            ? `Publicado: ${selectedParticipant.competitorNumber} ${selectedParticipant.fullName.split(' ')[0]} • ${formatScore(saved.contribution)} pts`
            : 'Borrador guardado',
      });
    } catch (err) {
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
  };

  const isAlreadyPublishedOnServer =
    existingServerResult?.publicationStatus === 'publicado';
  const isStaffBlockedFromOverwriting =
    isAlreadyPublishedOnServer && currentUser?.role !== 'admin';

  const hasActivePenalties =
    parsedPointsPenalty > 0 ||
    parsedSecondsPenaltyMs > 0 ||
    observation.trim().length > 0;

  return (
    <div className="max-w-lg mx-auto space-y-3">
      {/* Status Toast */}
      {!isOnline && (
        <div className="px-3.5 py-2 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            Offline — Guardado local activo
          </span>
          {loadedFromLocalDraft && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
              Borrador
            </span>
          )}
        </div>
      )}

      {(hasLiveVersionMismatch || conflictModalResult) && existingServerResult && (
        <div className="p-3 rounded-xl bg-rose-950/95 border border-rose-500 text-white flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <FileWarning className="w-4 h-4 text-rose-300 shrink-0" />
            <span className="truncate font-bold">
              Actualizado por {existingServerResult.updatedByName} (v
              {existingServerResult.version})
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleResolveConflictAdoptServer}
              className="px-2.5 py-1 rounded-lg bg-white text-slate-950 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Cargar
            </button>
            <button
              type="button"
              onClick={() => {
                setBaseServerVersion(existingServerResult.version);
                setConflictModalResult(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-rose-800 text-white font-bold text-[11px] cursor-pointer"
            >
              Sobrescribir
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            statusMessage.type === 'published'
              ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
              : statusMessage.type === 'draft'
              ? 'bg-sky-950/90 border-sky-500/60 text-sky-200'
              : 'bg-rose-950/90 border-rose-500/60 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {statusMessage.type === 'published' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* SINGLE MOBILE-FIRST HUD CARD                                        */}
      {/* =================================================================== */}
      <div className="kv-hud-card rounded-3xl p-4 sm:p-5 space-y-4">
        {/* 1. PILOT SELECTOR BAR */}
        <div className="space-y-2">
          {!isSearchOpen && selectedParticipant ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleStepPilot(-1)}
                aria-label="Piloto anterior"
                className="p-3 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 active:scale-95 transition cursor-pointer shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="flex-1 min-w-0 p-2.5 px-3 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-sky-500/40 flex items-center justify-between gap-2 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2.5 py-1 rounded-xl bg-sky-500 text-white font-mono font-black text-xs shrink-0 shadow-sm shadow-sky-500/30">
                    {selectedParticipant.competitorNumber}
                  </span>
                  <div className="min-w-0">
                    <div className="font-extrabold text-sm sm:text-base text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{selectedParticipant.fullName}</span>
                      {selectedParticipant.isDisqualified && (
                        <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[9px] font-black">
                          DQ
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {selectedParticipant.companyOrTeam}
                    </div>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-sky-400 shrink-0">
                  <Search className="w-4 h-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleStepPilot(1)}
                aria-label="Siguiente piloto"
                className="p-3 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 active:scale-95 transition cursor-pointer shrink-0"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar piloto por nombre o #..."
                  className="w-full pl-10 pr-9 py-3 rounded-2xl bg-slate-950 border border-sky-500 text-white text-sm font-semibold focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800 divide-y divide-slate-800/70">
                {filteredParticipants.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Sin resultados para &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  filteredParticipants.map((p) => {
                    const isSelected = p.id === selectedParticipantId;
                    const doneCount = results.filter(
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
                          setIsSearchOpen(false);
                        }}
                        className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/20 text-white'
                            : 'hover:bg-slate-900 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded-lg font-mono text-xs font-black shrink-0 ${
                              isSelected
                                ? 'bg-sky-500 text-white'
                                : 'bg-slate-800 text-sky-300'
                            }`}
                          >
                            {p.competitorNumber}
                          </span>
                          <div className="truncate">
                            <div className="font-bold text-sm truncate">
                              {p.fullName}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {p.companyOrTeam}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono">
                            {doneCount}/{tests.length}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-sky-400" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. UNIFIED TRACK / TEST SEGMENTED TABS */}
        <div className="grid grid-cols-3 gap-2">
          {tests.map((test, idx) => {
            const resForTest = results.find(
              (r) =>
                r.participantId === selectedParticipantId &&
                r.testId === test.id &&
                r.publicationStatus === 'publicado'
            );
            const isSelected = test.id === selectedTestId;
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
                className={`p-2.5 rounded-2xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer active:scale-[0.98] ${
                  isSelected
                    ? 'bg-sky-500/20 border-sky-500 text-white shadow-md shadow-sky-500/15'
                    : 'bg-slate-950/90 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider ${
                      isSelected ? 'text-sky-300' : 'text-slate-400'
                    }`}
                  >
                    Pista {idx + 1}
                  </span>
                  {resForTest ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
                  )}
                </div>

                <div className="font-extrabold text-xs sm:text-sm text-white truncate">
                  {test.name}
                </div>

                <div className="text-[10px] font-mono truncate">
                  {resForTest ? (
                    <span className="text-emerald-400 font-bold">
                      {formatScore(resForTest.contribution)} pts
                    </span>
                  ) : (
                    <span className="text-slate-500">Pendiente</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 3. STATUS BAR & EXISTING RESULT NOTICE */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(
              [
                {
                  id: 'completado',
                  label: 'Válido',
                  icon: CheckCircle2,
                  activeCls: 'bg-emerald-500 text-slate-950',
                },
                {
                  id: 'dnf',
                  label: 'DNF',
                  icon: Ban,
                  activeCls: 'bg-rose-600 text-white',
                },
                {
                  id: 'dq',
                  label: 'DQ',
                  icon: AlertTriangle,
                  activeCls: 'bg-rose-600 text-white',
                },
              ] as const
            ).map((st) => {
              const Icon = st.icon;
              const active = participationStatus === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setParticipationStatus(st.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-extrabold text-xs flex items-center gap-1 transition cursor-pointer ${
                    active ? st.activeCls : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleClearInputs}
            title="Limpiar campos"
            className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpiar</span>
          </button>
        </div>

        {isAlreadyPublishedOnServer && existingServerResult && (
          <div className="p-3 rounded-2xl bg-amber-950/60 border border-amber-500/50 text-amber-100 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                Ya registrado (Intento #{existingServerResult.attemptNumber})
              </span>
              {currentUser?.role !== 'admin' && (
                <span className="text-rose-300 font-bold">Bloqueado (Solo Admin)</span>
              )}
            </div>

            {currentUser?.role === 'admin' && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-3 text-[11px]">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={!isExtraordinaryRepeat}
                      onChange={() => setIsExtraordinaryRepeat(false)}
                    />
                    <span>Corregir</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
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
                  placeholder="Motivo de corrección Admin..."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-500/60 text-white text-xs focus:outline-none"
                />
              </div>
            )}
          </div>
        )}

        {/* 4. STOPWATCH & SCORE INPUTS */}
        {participationStatus === 'completado' && selectedTest && (
          <div className="space-y-3">
            {/* Digital Time Inputs (Mobile Numpad Ready) */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  Tiempo (MM : SS . CC)
                </span>
                <span className="font-mono">
                  Límite {(selectedTest.timeLimitMs / 1000).toFixed(0)}s
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={minutesInput}
                    onChange={(e) => setMinutesInput(e.target.value)}
                    placeholder="00"
                    aria-label="Minutos"
                    className="w-full py-3 px-2 rounded-xl bg-slate-900 border-2 border-slate-800 focus:border-sky-500 text-white text-center text-2xl font-black font-mono focus:outline-none"
                  />
                  <span className="block text-center text-[10px] uppercase text-slate-500 font-bold mt-1">
                    Min
                  </span>
                </div>

                <div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="59"
                    value={secondsInput}
                    onChange={(e) => setSecondsInput(e.target.value)}
                    placeholder="00"
                    aria-label="Segundos"
                    className="w-full py-3 px-2 rounded-xl bg-slate-900 border-2 border-slate-800 focus:border-sky-500 text-white text-center text-2xl font-black font-mono focus:outline-none"
                  />
                  <span className="block text-center text-[10px] uppercase text-slate-500 font-bold mt-1">
                    Seg
                  </span>
                </div>

                <div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="99"
                    value={centisecondsInput}
                    onChange={(e) => setCentisecondsInput(e.target.value)}
                    placeholder="00"
                    aria-label="Centésimas"
                    className="w-full py-3 px-2 rounded-xl bg-slate-900 border-2 border-slate-800 focus:border-sky-500 text-sky-300 text-center text-2xl font-black font-mono focus:outline-none"
                  />
                  <span className="block text-center text-[10px] uppercase text-slate-500 font-bold mt-1">
                    Cent
                  </span>
                </div>
              </div>

              {liveCalculation?.exceedsTimeLimit && (
                <div className="p-2.5 rounded-xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    Excede {(selectedTest.timeLimitMs / 1000).toFixed(0)}s
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setParticipationStatus('dnf')}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-extrabold text-[11px] cursor-pointer"
                    >
                      Pasar a DNF
                    </button>
                    {currentUser?.role === 'admin' && (
                      <input
                        type="text"
                        value={adminExceptionReason}
                        onChange={(e) => setAdminExceptionReason(e.target.value)}
                        placeholder="Excepción Admin..."
                        className="w-32 px-2 py-1 rounded-lg bg-slate-950 border border-rose-400 text-white text-[11px]"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Judge Score (for Habilidades / Destreza) */}
            {selectedTest.scoringMethod === 'manual' && (
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-sky-400" />
                    Puntaje Juez (0–{selectedTest.maxBaseScore})
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={selectedTest.maxBaseScore}
                    step="0.5"
                    value={rawScoreInput}
                    onChange={(e) => setRawScoreInput(e.target.value)}
                    placeholder="100"
                    className="w-28 py-2 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 focus:border-sky-500 text-white text-center text-xl font-black font-mono focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {[100, 95, 90, 85, 80].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRawScoreInput(String(val))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition cursor-pointer ${
                        rawScoreInput === String(val)
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Compact Collapsible Penalties */}
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800/80 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPenalties((v) => !v)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>Penalización / Observación</span>
                  {hasActivePenalties && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                      Activa
                    </span>
                  )}
                </span>
                {showPenalties ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showPenalties && (
                <div className="p-3 pt-2 border-t border-slate-800 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    {selectedTest.enableSecondsPenalty && (
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold uppercase text-amber-300">
                            + Segundos
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={secondsPenaltyInput}
                            onChange={(e) => setSecondsPenaltyInput(e.target.value)}
                            className="w-14 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-white text-right font-mono text-xs font-bold"
                          />
                        </div>
                        <div className="flex gap-1">
                          {[0, 2, 5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() =>
                                setSecondsPenaltyInput(
                                  s === 0
                                    ? '0'
                                    : String(
                                        (Number(secondsPenaltyInput) || 0) + s
                                      )
                                )
                              }
                              className="flex-1 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-amber-300 cursor-pointer"
                            >
                              {s === 0 ? '0s' : `+${s}s`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase text-rose-300">
                          - Puntos
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={pointsPenaltyInput}
                          onChange={(e) => setPointsPenaltyInput(e.target.value)}
                          className="w-14 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-white text-right font-mono text-xs font-bold"
                        />
                      </div>
                      <div className="flex gap-1">
                        {[0, 2, 5].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() =>
                              setPointsPenaltyInput(
                                p === 0
                                  ? '0'
                                  : String((Number(pointsPenaltyInput) || 0) + p)
                              )
                            }
                            className="flex-1 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-rose-300 cursor-pointer"
                          >
                            {p === 0 ? '0p' : `-${p}p`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    placeholder="Observación opcional..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. 1-TAP PUBLISH ACTION BAR */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handlePersistLocalDraft}
            title="Guardar borrador"
            className="p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Save className="w-4 h-4 text-sky-400" />
          </button>

          <button
            type="button"
            disabled={
              isSubmitting ||
              isStaffBlockedFromOverwriting ||
              Boolean(liveCalculation && liveCalculation.validationErrors.length > 0)
            }
            onClick={() => executeSubmit('publicado')}
            className="flex-1 py-3.5 px-5 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm sm:text-base flex items-center justify-between gap-2 shadow-lg shadow-sky-500/25 transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Publicando...' : 'Publicar Tiempo'}</span>
            </span>

            {liveCalculation && (
              <span className="px-2.5 py-1 rounded-xl bg-black/35 font-mono text-xs sm:text-sm font-black flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                {participationStatus === 'completado'
                  ? `${formatScore(liveCalculation.contribution)} pts`
                  : `${participationStatus.toUpperCase()} (0 pts)`}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

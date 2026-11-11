import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  RefreshCw,
  WifiOff,
  FileWarning,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Ban,
  Pin,
  Play,
  Square,
  RotateCcw,
  Timer as TimerIcon,
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

type WizardStep = 'pilot' | 'track' | 'time';

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

  // Pinned Track ("Fijar mi Pista") - skips step 2 for dedicated track staff
  const [pinnedTrackId, setPinnedTrackId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('drone_comp_pinned_track') || null;
    } catch {
      return null;
    }
  });

  const handleTogglePinTrack = (trackId: string | null) => {
    setPinnedTrackId(trackId);
    try {
      if (trackId) {
        localStorage.setItem('drone_comp_pinned_track', trackId);
      } else {
        localStorage.removeItem('drone_comp_pinned_track');
      }
    } catch {}
  };

  // References for Auto-advance between Min, Seg and Cent
  const minutesRef = useRef<HTMLInputElement>(null);
  const secondsRef = useRef<HTMLInputElement>(null);
  const centisecondsRef = useRef<HTMLInputElement>(null);

  // Integrated Touch Stopwatch
  const [stopwatchRunning, setStopwatchRunning] = useState<boolean>(false);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState<number>(0);
  const stopwatchStartRef = useRef<number>(0);
  const stopwatchIntervalRef = useRef<number | null>(null);

  const handleStartStopwatch = () => {
    stopwatchStartRef.current = Date.now() - stopwatchElapsedMs;
    setStopwatchRunning(true);
  };

  const handleStopStopwatch = () => {
    setStopwatchRunning(false);
    if (stopwatchIntervalRef.current) {
      window.clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    const finalElapsed = Date.now() - stopwatchStartRef.current;
    setStopwatchElapsedMs(finalElapsed);
    const split = splitMsToTimeInputs(finalElapsed);
    setMinutesInput(split.minutes);
    setSecondsInput(split.seconds);
    setCentisecondsInput(split.centiseconds);
  };

  const handleResetStopwatch = () => {
    setStopwatchRunning(false);
    if (stopwatchIntervalRef.current) {
      window.clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    setStopwatchElapsedMs(0);
  };

  useEffect(() => {
    if (stopwatchRunning) {
      stopwatchIntervalRef.current = window.setInterval(() => {
        setStopwatchElapsedMs(Date.now() - stopwatchStartRef.current);
      }, 35);
    } else if (stopwatchIntervalRef.current) {
      window.clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    return () => {
      if (stopwatchIntervalRef.current) {
        window.clearInterval(stopwatchIntervalRef.current);
      }
    };
  }, [stopwatchRunning]);

  const handleSelectPilot = (pilotId: string) => {
    setSelectedParticipantId(pilotId);
    if (pinnedTrackId) {
      const matchTest = tests.find((t) => t.assignedTrackIds.includes(pinnedTrackId)) || tests[0];
      if (matchTest) setSelectedTestId(matchTest.id);
      setSelectedTrackId(pinnedTrackId);
      setStep('time');
    } else {
      setStep('track');
    }
  };

  const handleMinutesChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    setMinutesInput(digits);
    if (digits.length === 2) {
      secondsRef.current?.focus();
      secondsRef.current?.select();
    }
  };

  const handleSecondsChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    setSecondsInput(digits);
    if (digits.length === 2) {
      centisecondsRef.current?.focus();
      centisecondsRef.current?.select();
    }
  };

  const handleCentisecondsChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    setCentisecondsInput(digits);
  };

  const handleMinutesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      secondsRef.current?.focus();
      secondsRef.current?.select();
    }
  };

  const handleSecondsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !secondsInput) {
      e.preventDefault();
      minutesRef.current?.focus();
      minutesRef.current?.select();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      centisecondsRef.current?.focus();
      centisecondsRef.current?.select();
    }
  };

  const handleCentisecondsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !centisecondsInput) {
      e.preventDefault();
      secondsRef.current?.focus();
      secondsRef.current?.select();
    }
  };

  const [step, setStep] = useState<WizardStep>(
    initialParticipantId && initialTestId ? 'time' : 'pilot'
  );
  const [pilotFilter, setPilotFilter] = useState<'todos' | 'distribucion' | 'transmision'>('todos');
  const [searchQuery, setSearchQuery] = useState('');

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
    let list = participants;
    if (pilotFilter !== 'todos') {
      list = list.filter((p) => (p.teamDivision || 'distribucion') === pilotFilter);
    }
    const q = normalizeSearchText(searchQuery);
    if (!q) return list;
    return list.filter((p) => {
      const hay = `${p.normalizedName} ${normalizeSearchText(
        p.companyOrTeam
      )} ${normalizeSearchText(p.competitorNumber)} ${normalizeSearchText(p.id)}`;
      return hay.includes(q);
    });
  }, [participants, searchQuery, pilotFilter]);

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
      {/* 3-STEP MOBILE-FIRST WIZARD                                          */}
      {/* =================================================================== */}
      <div className="kv-hud-card rounded-3xl p-4 sm:p-5 space-y-4">
        {/* Step Indicator Bar */}
        <div className="flex items-center justify-between gap-1 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => setStep('pilot')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-center transition cursor-pointer ${
              step === 'pilot'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Piloto
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <button
            type="button"
            onClick={() => selectedParticipant && setStep('track')}
            disabled={!selectedParticipant}
            className={`flex-1 py-1.5 px-2 rounded-xl text-center transition cursor-pointer disabled:opacity-30 ${
              step === 'track'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Pista
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <button
            type="button"
            onClick={() => selectedParticipant && selectedTest && setStep('time')}
            disabled={!selectedParticipant || !selectedTest}
            className={`flex-1 py-1.5 px-2 rounded-xl text-center transition cursor-pointer disabled:opacity-30 ${
              step === 'time'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            3. Tiempo
          </button>
        </div>

        {/* ================================================================= */}
        {/* PASO 1: SELECCIONAR PILOTO                                        */}
        {/* ================================================================= */}
        {step === 'pilot' && (
          <div className="space-y-3">
            {/* Fijar Mi Pista Toggle */}
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-1.5 min-w-0">
                <Pin className={`w-3.5 h-3.5 shrink-0 ${pinnedTrackId ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
                <span className="text-[11px] font-bold text-slate-300 truncate">
                  {pinnedTrackId
                    ? `Fijada: ${tracks.find((t) => t.id === pinnedTrackId)?.name || 'Pista'}`
                    : 'Pista libre (Elige en cada vuelo)'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTogglePinTrack(null)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    !pinnedTrackId
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Todas
                </button>
                {tracks.slice(0, 5).map((tr, idx) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => handleTogglePinTrack(pinnedTrackId === tr.id ? null : tr.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                      pinnedTrackId === tr.id
                        ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    P{idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-sky-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o número (#101)..."
                className="w-full pl-10 pr-9 py-3 rounded-2xl bg-slate-950 border border-slate-700 focus:border-red-500 text-white text-sm font-semibold focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Team Filter Pills */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setPilotFilter('todos')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  pilotFilter === 'todos'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({participants.length})
              </button>
              <button
                type="button"
                onClick={() => setPilotFilter('distribucion')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  pilotFilter === 'distribucion'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⚡ Distribución
              </button>
              <button
                type="button"
                onClick={() => setPilotFilter('transmision')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  pilotFilter === 'transmision'
                    ? 'bg-cyan-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🗼 Transmisión
              </button>
            </div>

            {/* Pilot Cards List */}
            <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-0.5 rounded-2xl">
              {filteredParticipants.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-950 rounded-2xl border border-slate-800">
                  Sin pilotos encontrados para esta búsqueda.
                </div>
              ) : (
                filteredParticipants.map((p) => {
                  const doneCount = results.filter(
                    (r) =>
                      r.participantId === p.id &&
                      r.publicationStatus === 'publicado'
                  ).length;
                  const isSelected = p.id === selectedParticipantId;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPilot(p.id)}
                      className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition cursor-pointer active:scale-[0.99] ${
                        isSelected
                          ? 'bg-red-950/40 border-red-500/80 text-white shadow-md'
                          : 'bg-slate-950/90 border-slate-800/90 text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-12 h-10 rounded-xl bg-slate-900 border border-slate-700 font-mono font-black text-sm text-sky-400 flex items-center justify-center shrink-0">
                          {p.competitorNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{p.fullName}</span>
                            {p.isDisqualified && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[9px] font-black">
                                DQ
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                                p.teamDivision === 'transmision'
                                  ? 'bg-cyan-500/20 text-cyan-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {p.teamDivision === 'transmision' ? 'Transmisión' : 'Distribución'}
                            </span>
                            <span className="truncate">• {p.companyOrTeam}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-1 rounded-xl text-xs font-mono font-bold ${
                            doneCount === tests.length
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {doneCount}/{tests.length}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* PASO 2: SELECCIONAR PISTA / PRUEBA                                */}
        {/* ================================================================= */}
        {step === 'track' && selectedParticipant && (
          <div className="space-y-3">
            {/* Header with Selected Pilot Info */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="px-2 py-1 rounded-xl bg-red-600 text-white font-mono font-black text-xs shrink-0">
                  {selectedParticipant.competitorNumber}
                </span>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm text-white truncate">
                    {selectedParticipant.fullName}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {selectedParticipant.teamDivision === 'transmision' ? '🗼 Transmisión' : '⚡ Distribución'} • {selectedParticipant.companyOrTeam}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep('pilot')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer shrink-0"
              >
                Cambiar
              </button>
            </div>

            {/* 3 Big Track Cards */}
            <div className="space-y-2">
              {tests.map((test, idx) => {
                const resForTest = results.find(
                  (r) =>
                    r.participantId === selectedParticipant.id &&
                    r.testId === test.id &&
                    r.publicationStatus === 'publicado'
                );
                const trackForTest =
                  tracks.find((tr) => test.assignedTrackIds.includes(tr.id)) ||
                  tracks[idx] ||
                  tracks[0];
                const isDQ = resForTest?.participationStatus === 'dq';
                const isDone = resForTest?.participationStatus === 'completado';

                return (
                  <button
                    key={test.id}
                    type="button"
                    onClick={() => {
                      setSelectedTestId(test.id);
                      if (trackForTest) setSelectedTrackId(trackForTest.id);
                      setStep('time');
                    }}
                    className="w-full p-4 rounded-2xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-red-500/60 text-left flex items-center justify-between gap-3 transition cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex flex-col items-center justify-center font-black shrink-0">
                        <span className="text-[9px] uppercase text-slate-400 font-bold">PISTA</span>
                        <span className="text-base text-white">{idx + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-sm text-white truncate">
                          {test.name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          `Límite ${Math.round(test.timeLimitMs / 60000)} min (${Math.round(test.timeLimitMs / 1000)}s) • Máx ${formatScore(test.maxContribution)} pts`
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isDone ? (
                        <div>
                          <div className="text-xs font-mono font-black text-emerald-400">
                            {formatScore(resForTest.contribution)} pts
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Registrado
                          </span>
                        </div>
                      ) : isDQ ? (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-950 border border-rose-600 text-rose-300 text-xs font-black">
                          DQ PISTA (0 pts)
                        </span>
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black flex items-center gap-1 shadow">
                          Ingresar →
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* PASO 3: INGRESO DE TIEMPO & PUBLICAR                              */}
        {/* ================================================================= */}
        {step === 'time' && selectedParticipant && selectedTest && (
          <div className="space-y-3.5">
            {/* Header: Pilot + Track Bar */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-1 rounded-xl bg-red-600 text-white font-mono font-black text-xs shrink-0">
                  {selectedParticipant.competitorNumber}
                </span>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm text-white truncate">
                    {selectedParticipant.fullName}
                  </div>
                  <div className="text-[11px] text-red-400 font-bold truncate">
                    {selectedTest.name}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep('track')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer shrink-0"
              >
                Volver a Pistas
              </button>
            </div>

            {/* Status Pills: Válido | DNF | DQ Pista */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setParticipationStatus('completado')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
                  participationStatus === 'completado'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Válido
              </button>
              <button
                type="button"
                onClick={() => setParticipationStatus('dnf')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
                  participationStatus === 'dnf'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                DNF
              </button>
              <button
                type="button"
                onClick={() => setParticipationStatus('dq')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
                  participationStatus === 'dq'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                DQ Pista (0 pts)
              </button>
            </div>

            {/* Time / Score Input */}
            {participationStatus === 'completado' ? (
              <div className="space-y-3">
                {/* Touch Stopwatch & Large Digital Inputs */}
                {/* 1. Touch Stopwatch Widget */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <TimerIcon className="w-3.5 h-3.5 text-red-500" />
                      Cronómetro Táctil Integrado
                    </span>
                    {stopwatchElapsedMs > 0 && (
                      <span className="font-mono text-emerald-400 font-bold">
                        {formatMsToTime(stopwatchElapsedMs)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!stopwatchRunning ? (
                      <button
                        type="button"
                        onClick={handleStartStopwatch}
                        className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>{stopwatchElapsedMs > 0 ? 'Reanudar Vuelo' : 'Iniciar Vuelo'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStopStopwatch}
                        className="flex-1 py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-rose-600/50 animate-pulse transition cursor-pointer"
                      >
                        <Square className="w-5 h-5 fill-white" />
                        <span>Detener Vuelo ({formatMsToTime(stopwatchElapsedMs)})</span>
                      </button>
                    )}

                    {stopwatchElapsedMs > 0 && !stopwatchRunning && (
                      <button
                        type="button"
                        onClick={handleResetStopwatch}
                        title="Reiniciar cronómetro"
                        className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Three High-Visibility Fluor/Neon Digital Inputs (Min, Seg, Cent) */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-extrabold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-red-500" />
                      Tiempo Manual (Auto-avance)
                    </span>
                    <span className="font-mono text-slate-400">
                      Límite {(selectedTest.timeLimitMs / 1000).toFixed(0)}s
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <input
                        ref={minutesRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={minutesInput}
                        onChange={(e) => handleMinutesChange(e.target.value)}
                        onKeyDown={handleMinutesKeyDown}
                        placeholder="00"
                        aria-label="Minutos"
                        className="w-full py-3 px-1 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-center text-3xl font-black font-mono focus:outline-none transition-all duration-200 focus:border-[#00ffcc] focus:ring-4 focus:ring-[#00ffcc]/35 focus:shadow-[0_0_25px_rgba(0,255,204,0.6)] focus:scale-[1.03]"
                      />
                      <span className="block text-center text-[10px] uppercase text-slate-500 font-bold mt-1">
                        Min
                      </span>
                    </div>

                    <div>
                      <input
                        ref={secondsRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={secondsInput}
                        onChange={(e) => handleSecondsChange(e.target.value)}
                        onKeyDown={handleSecondsKeyDown}
                        placeholder="00"
                        aria-label="Segundos"
                        className="w-full py-3 px-1 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-center text-3xl font-black font-mono focus:outline-none transition-all duration-200 focus:border-[#00ffcc] focus:ring-4 focus:ring-[#00ffcc]/35 focus:shadow-[0_0_25px_rgba(0,255,204,0.6)] focus:scale-[1.03]"
                      />
                      <span className="block text-center text-[10px] uppercase text-slate-500 font-bold mt-1">
                        Seg
                      </span>
                    </div>

                    <div>
                      <input
                        ref={centisecondsRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={centisecondsInput}
                        onChange={(e) => handleCentisecondsChange(e.target.value)}
                        onKeyDown={handleCentisecondsKeyDown}
                        placeholder="00"
                        aria-label="Centésimas"
                        className="w-full py-3 px-1 rounded-xl bg-slate-900 border-2 border-slate-700 text-red-400 text-center text-3xl font-black font-mono focus:outline-none transition-all duration-200 focus:border-[#00ffcc] focus:ring-4 focus:ring-[#00ffcc]/35 focus:shadow-[0_0_25px_rgba(0,255,204,0.6)] focus:scale-[1.03]"
                      />
                      <span className="block text-center text-[10px] uppercase text-slate-500 font-bold mt-1">
                        Cent
                      </span>
                    </div>
                  </div>
                </div>

                {/* Compact Collapsible Penalties */}
                <div className="rounded-2xl bg-slate-950/80 border border-slate-800/80 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPenalties((v) => !v)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    <span>Penalizaciones u Observación</span>
                    {showPenalties ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showPenalties && (
                    <div className="p-3 pt-2 border-t border-slate-800 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {selectedTest.enableSecondsPenalty && (
                          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-amber-300">
                                + Segundos
                              </span>
                              <input
                                type="number"
                                min="0"
                                value={secondsPenaltyInput}
                                onChange={(e) => setSecondsPenaltyInput(e.target.value)}
                                className="w-12 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-white text-right font-mono text-xs"
                              />
                            </div>
                            <div className="flex gap-1">
                              {[0, 2, 5].map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setSecondsPenaltyInput(String(s))}
                                  className="flex-1 py-0.5 rounded bg-slate-800 text-[10px] text-amber-300 font-bold"
                                >
                                  {s === 0 ? '0s' : `+${s}s`}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-rose-300">
                              - Puntos
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={pointsPenaltyInput}
                              onChange={(e) => setPointsPenaltyInput(e.target.value)}
                              className="w-12 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-white text-right font-mono text-xs"
                            />
                          </div>
                          <div className="flex gap-1">
                            {[0, 2, 5].map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setPointsPenaltyInput(String(p))}
                                className="flex-1 py-0.5 rounded bg-slate-800 text-[10px] text-rose-300 font-bold"
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
            ) : (
              <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-center space-y-1">
                <div className="text-rose-200 font-black text-sm">
                  {participationStatus === 'dq'
                    ? 'Descalificación en esta pista (0,00 pts)'
                    : 'Prueba no completada (DNF - 0,00 pts)'}
                </div>
                <div className="text-[11px] text-rose-300/80">
                  El piloto conserva sus puntos en las demás pistas y continúa en el ranking.
                </div>
              </div>
            )}

            {/* Sanity Check Warning */}
            {participationStatus === 'completado' && parsedTime.ms !== null && parsedTime.ms > 0 && parsedTime.ms < 10000 && (
              <div className="p-3 rounded-2xl bg-amber-950/80 border border-amber-500/70 text-amber-200 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Tiempo muy bajo ({formatMsToTime(parsedTime.ms)}). Por favor verifica que los minutos y segundos sean correctos antes de publicar.
                </span>
              </div>
            )}
            {participationStatus === 'completado' && selectedTest.timeLimitMs && parsedTime.ms !== null && parsedTime.ms > selectedTest.timeLimitMs && (
              <div className="p-3 rounded-2xl bg-amber-950/80 border border-amber-500/70 text-amber-200 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  El tiempo ingresado supera el límite de la pista (Límite: {(selectedTest.timeLimitMs / 1000).toFixed(0)}s).
                </span>
              </div>
            )}

            {/* Big Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={
                  isSubmitting ||
                  isStaffBlockedFromOverwriting ||
                  Boolean(liveCalculation && liveCalculation.validationErrors.length > 0)
                }
                onClick={async () => {
                  await executeSubmit('publicado');
                  // Quick step to next track or prompt
                  setStep('track');
                }}
                className="w-full py-4 px-5 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.99] disabled:opacity-40 text-white font-black text-base flex items-center justify-between gap-2 shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  <span>{isSubmitting ? 'Guardando...' : 'Publicar Tiempo'}</span>
                </span>
                {liveCalculation && participationStatus === 'completado' && (
                  <span className="px-3 py-1 rounded-xl bg-black/40 font-mono text-sm font-black text-amber-300">
                    {formatScore(liveCalculation.contribution)} pts
                  </span>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('track')}
                  className="flex-1 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Volver a Pistas
                </button>
                <button
                  type="button"
                  onClick={() => setStep('pilot')}
                  className="flex-1 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Nuevo Piloto
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import {
  CompetitionEvent,
  CompetitionResult,
  EvaluationTest,
  Participant,
  ParticipationStatus,
  PublicParticipant,
  PublicResult,
  RankingRow,
  TestRankCell,
} from '../types/domain';

const FLOAT_EPSILON = 1e-7;

/**
 * Stabilizes IEEE-754 floating point arithmetic at 10 decimal places
 * so that representation noise (e.g. 33.330000000000005) never alters rankings,
 * while keeping full precision prior to UI rounding.
 */
export function stabilizeFloat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1e10) / 1e10;
}

/**
 * Compares two numbers with precision tolerance to prevent float drift from breaking ties.
 * Returns > 0 if a > b, < 0 if a < b, 0 if equal within FLOAT_EPSILON.
 */
export function compareFloats(a: number, b: number): number {
  const diff = a - b;
  if (Math.abs(diff) <= FLOAT_EPSILON) return 0;
  return diff;
}

/**
 * Formats a number to Spanish locale decimal representation (e.g. 33,33) only for presentation.
 */
export function formatScore(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Normalizes a string for case-insensitive and accent-insensitive search.
 */
export function normalizeSearchText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Parses minutes, seconds, and centiseconds string inputs into integer milliseconds.
 * Never converts empty values into zeros automatically.
 */
export function parseTimeInputsToMs(
  minutesStr: string,
  secondsStr: string,
  centisecondsStr: string
): { ms: number | null; error?: string } {
  const mTrim = minutesStr.trim();
  const sTrim = secondsStr.trim();
  const cTrim = centisecondsStr.trim();

  if (mTrim === '' && sTrim === '' && cTrim === '') {
    return { ms: null };
  }

  const minutes = mTrim === '' ? 0 : Number(mTrim);
  const seconds = sTrim === '' ? 0 : Number(sTrim);
  const centiseconds = cTrim === '' ? 0 : Number(cTrim);

  if (
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    !Number.isInteger(centiseconds)
  ) {
    return { ms: null, error: 'Minutos, segundos y centésimas deben ser números enteros.' };
  }

  if (minutes < 0 || seconds < 0 || centiseconds < 0) {
    return { ms: null, error: 'No se permiten valores de tiempo negativos.' };
  }

  if (mTrim !== '' && seconds >= 60) {
    return {
      ms: null,
      error: 'Cuando se ingresan minutos, los segundos deben estar entre 0 y 59.',
    };
  }

  if (centiseconds >= 100) {
    return { ms: null, error: 'Las centésimas deben estar entre 0 y 99.' };
  }

  const totalMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
  return { ms: totalMs };
}

/**
 * Splits integer milliseconds into minutes, seconds, and centiseconds strings for form editing.
 */
export function splitMsToTimeInputs(ms: number | null | undefined): {
  minutes: string;
  seconds: string;
  centiseconds: string;
} {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return { minutes: '', seconds: '', centiseconds: '' };
  }
  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((safeMs % 1000) / 10);

  return {
    minutes: String(minutes),
    seconds: String(seconds).padStart(2, '0'),
    centiseconds: String(centiseconds).padStart(2, '0'),
  };
}

/**
 * Formats integer milliseconds into legible MM:SS.cc string (e.g., 01:24.50).
 */
export function formatMsToTime(ms: number | null | undefined, includeSeconds = false): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return '—';
  }
  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((safeMs % 1000) / 10);

  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    centiseconds
  ).padStart(2, '0')}`;

  if (includeSeconds) {
    const secDecimal = (safeMs / 1000).toLocaleString('es-CL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatted} (${secDecimal}s)`;
  }
  return formatted;
}

/**
 * Determines the best (minimum) valid effective time in milliseconds for a given test.
 * Rules:
 * - Must be published ('publicado')
 * - Must be completed ('completado') — excludes 'anulado', 'dnf', 'dq', 'pendiente'
 * - Excludes participants who have general disqualification (isDisqualified)
 * - Registered time must be > 0 (rejects 0 or negative times)
 * - Points penalties do NOT alter the reference effective time.
 */
export function getBestEffectiveTimeMs(
  testId: string,
  results: Array<Pick<CompetitionResult | PublicResult, 'testId' | 'participantId' | 'publicationStatus' | 'participationStatus' | 'registeredTimeMs' | 'secondsPenaltyMs'>>,
  disqualifiedParticipantIds: Set<string> = new Set()
): number | null {
  let bestMs: number | null = null;

  for (const r of results) {
    if (r.testId !== testId) continue;
    if (r.publicationStatus !== 'publicado') continue;
    if (r.participationStatus !== 'completado') continue;
    if (disqualifiedParticipantIds.has(r.participantId)) continue;
    if (r.registeredTimeMs === null || r.registeredTimeMs === undefined || r.registeredTimeMs <= 0) {
      continue;
    }

    const penaltyMs = Math.max(0, r.secondsPenaltyMs || 0);
    const effectiveMs = r.registeredTimeMs + penaltyMs;
    if (effectiveMs <= 0) continue;

    if (bestMs === null || effectiveMs < bestMs) {
      bestMs = effectiveMs;
    }
  }

  return bestMs;
}

export interface ScoreCalculationInput {
  test: EvaluationTest;
  participationStatus: ParticipationStatus;
  rawScore: number | null;
  pointsPenalty: number;
  registeredTimeMs: number | null;
  secondsPenaltyMs: number;
  bestEffectiveTimeMsForTest: number | null; // Current best effective time among published valid results
  includeCandidateInBestTime?: boolean; // True when previewing/publishing a valid completed result
}

export interface ScoreCalculationOutput {
  effectiveTimeMs: number | null;
  referenceBestTimeMs: number | null;
  calculatedBaseScore: number | null;
  netScore: number | null;
  contribution: number | null;
  exceedsTimeLimit: boolean;
  validationErrors: string[];
}

/**
 * Validates and calculates scores according to Method A (manual) or Method B (time_calculated).
 */
export function calculateResultMetrics(input: ScoreCalculationInput): ScoreCalculationOutput {
  const {
    test,
    participationStatus,
    rawScore,
    pointsPenalty,
    registeredTimeMs,
    secondsPenaltyMs,
    bestEffectiveTimeMsForTest,
  } = input;

  const validationErrors: string[] = [];

  if (pointsPenalty < 0 || !Number.isFinite(pointsPenalty)) {
    validationErrors.push('La penalización en puntos debe ser un valor positivo o cero.');
  }

  if (secondsPenaltyMs < 0 || !Number.isFinite(secondsPenaltyMs)) {
    validationErrors.push('La penalización en segundos debe ser un valor positivo o cero.');
  }

  // Time limit is evaluated on registeredTimeMs BEFORE adding secondsPenaltyMs.
  // Exact equality (registeredTimeMs === test.timeLimitMs) is acceptable if completed.
  const exceedsTimeLimit =
    registeredTimeMs !== null &&
    test.timeLimitMs > 0 &&
    registeredTimeMs > test.timeLimitMs;

  // Handle Pending
  if (participationStatus === 'pendiente') {
    return {
      effectiveTimeMs: null,
      referenceBestTimeMs: bestEffectiveTimeMsForTest,
      calculatedBaseScore: null,
      netScore: null,
      contribution: null,
      exceedsTimeLimit: false,
      validationErrors,
    };
  }

  // Handle DNF or DQ in test: contributes 0, never treated as 0 seconds
  if (participationStatus === 'dnf' || participationStatus === 'dq') {
    const effTime =
      registeredTimeMs !== null && registeredTimeMs > 0
        ? registeredTimeMs + (test.enableSecondsPenalty ? secondsPenaltyMs : 0)
        : null;
    return {
      effectiveTimeMs: effTime,
      referenceBestTimeMs: bestEffectiveTimeMsForTest,
      calculatedBaseScore: 0,
      netScore: 0,
      contribution: 0,
      exceedsTimeLimit,
      validationErrors,
    };
  }

  // Participation status === 'completado'
  if (test.scoringMethod === 'manual') {
    // Method A: Manual score
    if (rawScore === null || rawScore === undefined || !Number.isFinite(rawScore)) {
      validationErrors.push('Debe ingresar un puntaje bruto válido para una prueba completada.');
    } else if (rawScore < 0) {
      validationErrors.push('El puntaje bruto no puede ser negativo.');
    } else if (rawScore > test.maxBaseScore) {
      const isUncapped =
        test.id === 'test_pista4' ||
        test.id === 'test_pista5' ||
        test.id.includes('pista4') ||
        test.id.includes('pista5');

      if (!isUncapped) {
        validationErrors.push(
          `El puntaje bruto (${rawScore}) no puede superar el puntaje base máximo configurado (${test.maxBaseScore}).`
        );
      }
    }

    if (registeredTimeMs !== null && registeredTimeMs <= 0) {
      validationErrors.push('El tiempo registrado debe ser mayor que cero segundos.');
    }

    const effectiveTimeMs =
      registeredTimeMs !== null && registeredTimeMs > 0
        ? registeredTimeMs + (test.enableSecondsPenalty ? secondsPenaltyMs : 0)
        : null;

    if (validationErrors.length > 0 || rawScore === null) {
      return {
        effectiveTimeMs,
        referenceBestTimeMs: null,
        calculatedBaseScore: null,
        netScore: null,
        contribution: null,
        exceedsTimeLimit,
        validationErrors,
      };
    }

    const calculatedBaseScore = stabilizeFloat(rawScore);
    const netScore = stabilizeFloat(Math.max(0, calculatedBaseScore - pointsPenalty));
    // Para pruebas de puntaje manual (Pistas 3, 4 y 5): los puntos pasan directo sin conversión proporcional
    const isDirectPass =
      test.maxBaseScore === test.maxContribution ||
      test.id === 'test_pista4' ||
      test.id === 'test_pista5' ||
      test.id === 'test_destreza' ||
      test.id.includes('destreza') ||
      test.id.includes('pista4') ||
      test.id.includes('pista5');

    const contribution = isDirectPass
      ? netScore
      : stabilizeFloat((netScore / test.maxBaseScore) * test.maxContribution);

    return {
      effectiveTimeMs,
      referenceBestTimeMs: null,
      calculatedBaseScore,
      netScore,
      contribution,
      exceedsTimeLimit,
      validationErrors,
    };
  } else {
    // Method B: Time-calculated score
    if (registeredTimeMs === null || registeredTimeMs === undefined || !Number.isFinite(registeredTimeMs)) {
      validationErrors.push('Debe ingresar el tiempo registrado para calcular el puntaje.');
    } else if (registeredTimeMs <= 0) {
      validationErrors.push('Se rechazan tiempos de cero o negativos.');
    }

    if (validationErrors.length > 0 || registeredTimeMs === null) {
      return {
        effectiveTimeMs: null,
        referenceBestTimeMs: bestEffectiveTimeMsForTest,
        calculatedBaseScore: null,
        netScore: null,
        contribution: null,
        exceedsTimeLimit,
        validationErrors,
      };
    }

    const appliedSecondsPenaltyMs = test.enableSecondsPenalty ? secondsPenaltyMs : 0;
    const effectiveTimeMs = registeredTimeMs + appliedSecondsPenaltyMs;

    if (effectiveTimeMs <= 0) {
      validationErrors.push('El tiempo efectivo debe ser mayor que cero.');
      return {
        effectiveTimeMs: null,
        referenceBestTimeMs: bestEffectiveTimeMsForTest,
        calculatedBaseScore: null,
        netScore: null,
        contribution: null,
        exceedsTimeLimit,
        validationErrors,
      };
    }

    // Score based on fixed track time limit (e.g. 5 minutes = 300,000 ms):
    // - 0 ms -> 100% of base score
    // - timeLimitMs -> exactly 0 points (reaching zero at the regulated limit)
    // - > timeLimitMs -> 0 points (time limit exceeded)
    const limitMs = test.timeLimitMs > 0 ? test.timeLimitMs : 300000;

    let calculatedBaseScore = 0;
    if (effectiveTimeMs < limitMs) {
      const remainingFraction = (limitMs - effectiveTimeMs) / limitMs;
      calculatedBaseScore = stabilizeFloat(test.maxBaseScore * remainingFraction);
    } else {
      calculatedBaseScore = 0;
    }

    const netScore = stabilizeFloat(Math.max(0, calculatedBaseScore - pointsPenalty));
    const contribution = stabilizeFloat((netScore / test.maxBaseScore) * test.maxContribution);

    return {
      effectiveTimeMs,
      referenceBestTimeMs: limitMs,
      calculatedBaseScore,
      netScore,
      contribution,
      exceedsTimeLimit,
      validationErrors,
    };
  }
}

/**
 * Recalculates all results for a given test so that any change in best effective time
 * (or test rule configuration) consistently updates all affected results.
 */
export function recalculateAllResultsForTest(
  test: EvaluationTest,
  allResultsForTest: CompetitionResult[],
  disqualifiedParticipantIds: Set<string> = new Set()
): {
  bestEffectiveTimeMs: number | null;
  updatedResults: CompetitionResult[];
} {
  const bestEffectiveTimeMs = getBestEffectiveTimeMs(
    test.id,
    allResultsForTest,
    disqualifiedParticipantIds
  );

  const updatedResults = allResultsForTest.map((r) => {
    if (r.publicationStatus === 'anulado') {
      return {
        ...r,
        calculatedBaseScore: 0,
        netScore: 0,
        contribution: 0,
      };
    }

    const calc = calculateResultMetrics({
      test,
      participationStatus: r.participationStatus,
      rawScore: r.rawScore,
      pointsPenalty: r.pointsPenalty,
      registeredTimeMs: r.registeredTimeMs,
      secondsPenaltyMs: r.secondsPenaltyMs,
      bestEffectiveTimeMsForTest: bestEffectiveTimeMs,
      includeCandidateInBestTime: false,
    });

    return {
      ...r,
      effectiveTimeMs: calc.effectiveTimeMs,
      calculatedBaseScore: calc.calculatedBaseScore,
      netScore: calc.netScore,
      contribution: calc.contribution,
    };
  });

  return { bestEffectiveTimeMs, updatedResults };
}

/**
 * Computes the complete competition ranking according to event rules, tie-breakers,
 * and special states (Pendiente, DNF, DQ, Provisional vs Final).
 */
export function computeEventRanking(params: {
  event: CompetitionEvent;
  tests: EvaluationTest[];
  participants: Array<Participant | PublicParticipant>;
  results: Array<CompetitionResult | PublicResult>;
}): {
  rows: RankingRow[];
  bestTimeByTestId: Record<string, number | null>;
  isRankingProvisional: boolean;
  hasUnresolvedTies: boolean;
} {
  const { event, tests, participants, results } = params;
  const sortedTests = [...tests].sort((a, b) => a.order - b.order);

  const disqualifiedIds = new Set<string>(
    participants.filter((p) => p.isDisqualified).map((p) => p.id)
  );

  // Only published results count for the ranking
  const publishedResults = results.filter((r) => r.publicationStatus === 'publicado');
  for (const r of publishedResults) {
    if (r.participationStatus === 'dq') {
      // Per-track DQ only zeroes this track; general DQ is controlled by p.isDisqualified
    }
  }

  // Compute reference best effective time for each test
  const bestTimeByTestId: Record<string, number | null> = {};
  for (const test of sortedTests) {
    bestTimeByTestId[test.id] =
      test.scoringMethod === 'time_calculated'
        ? getBestEffectiveTimeMs(test.id, publishedResults, disqualifiedIds)
        : null;
  }

  // Index published results by `${participantId}__${testId}`
  const resultMap = new Map<string, CompetitionResult | PublicResult>();
  for (const r of publishedResults) {
    resultMap.set(`${r.participantId}__${r.testId}`, r);
  }

  const isRankingProvisional =
    event.status !== 'finalizado' || sortedTests.some((t) => t.status === 'abierta');

  // Build rows for all participants
  const rawRows: RankingRow[] = participants.map((p) => {
    const testCells: Record<string, TestRankCell> = {};
    let totalContribution = 0;
    let completedTestsCount = 0;
    let hasPendingTests = false;
    let hasDNF = false;
    let hasTestDQ = false;

    for (const test of sortedTests) {
      const res = resultMap.get(`${p.id}__${test.id}`);

      if (!res || res.participationStatus === 'pendiente') {
        hasPendingTests = true;
        testCells[test.id] = {
          testId: test.id,
          status: 'pendiente',
          isPublished: false,
          contribution: null, // Pendiente is NOT 0 in display
          netScore: null,
          baseScore: null,
          effectiveTimeMs: null,
          registeredTimeMs: null,
          secondsPenaltyMs: 0,
          pointsPenalty: 0,
          isProvisional: test.status === 'abierta',
        };
        continue;
      }

      if (res.participationStatus === 'dnf') {
        hasDNF = true;
        completedTestsCount += 1;
        testCells[test.id] = {
          testId: test.id,
          status: 'dnf',
          isPublished: true,
          contribution: 0,
          netScore: 0,
          baseScore: 0,
          effectiveTimeMs: null, // Never treat DNF as 0 seconds
          registeredTimeMs: res.registeredTimeMs,
          secondsPenaltyMs: res.secondsPenaltyMs,
          pointsPenalty: res.pointsPenalty,
          isProvisional: test.status === 'abierta',
        };
        continue;
      }

      if (res.participationStatus === 'dq') {
        hasTestDQ = true;
        completedTestsCount += 1;
        testCells[test.id] = {
          testId: test.id,
          status: 'dq',
          isPublished: true,
          contribution: 0,
          netScore: 0,
          baseScore: 0,
          effectiveTimeMs: null,
          registeredTimeMs: res.registeredTimeMs,
          secondsPenaltyMs: res.secondsPenaltyMs,
          pointsPenalty: res.pointsPenalty,
          isProvisional: test.status === 'abierta',
        };
        continue;
      }

      // 'completado'
      completedTestsCount += 1;
      let contribution = res.contribution;
      let netScore = res.netScore;
      let baseScore = res.calculatedBaseScore;
      let effectiveTimeMs = res.effectiveTimeMs;

      // Always ensure time-calculated scores reflect the fixed time limit reference (e.g. 5 min = 300s -> 0 pts)
      if (test.scoringMethod === 'time_calculated') {
        const regMs = res.registeredTimeMs;
        const penMs = test.enableSecondsPenalty ? res.secondsPenaltyMs || 0 : 0;
        effectiveTimeMs = regMs !== null && regMs > 0 ? regMs + penMs : null;

        const limitMs = test.timeLimitMs > 0 ? test.timeLimitMs : 300000;

        if (effectiveTimeMs !== null && effectiveTimeMs > 0) {
          if (effectiveTimeMs < limitMs) {
            const fraction = (limitMs - effectiveTimeMs) / limitMs;
            baseScore = stabilizeFloat(test.maxBaseScore * fraction);
          } else {
            baseScore = 0;
          }
          netScore = stabilizeFloat(Math.max(0, (baseScore || 0) - (res.pointsPenalty || 0)));
          contribution = stabilizeFloat(((netScore || 0) / test.maxBaseScore) * test.maxContribution);
        } else {
          baseScore = null;
          netScore = null;
          contribution = null;
        }
      }

      if (contribution !== null && Number.isFinite(contribution)) {
        totalContribution = stabilizeFloat(totalContribution + contribution);
      }

      testCells[test.id] = {
        testId: test.id,
        status: 'completado',
        isPublished: true,
        contribution,
        netScore,
        baseScore,
        effectiveTimeMs,
        registeredTimeMs: res.registeredTimeMs,
        secondsPenaltyMs: res.secondsPenaltyMs || 0,
        pointsPenalty: res.pointsPenalty || 0,
        isProvisional: test.status === 'abierta',
      };
    }

    return {
      position: null,
      participantId: p.id,
      fullName: p.fullName,
      companyOrTeam: p.companyOrTeam,
      teamDivision: p.teamDivision || 'distribucion',
      competitorNumber: p.competitorNumber,
      isDisqualified: p.isDisqualified,
      disqualificationReason: 'disqualificationReason' in p ? p.disqualificationReason : undefined,
      accreditationStatus: p.accreditationStatus,
      testCells,
      totalContribution,
      completedTestsCount,
      totalTestsCount: sortedTests.length,
      hasPendingTests,
      hasDNF,
      hasTestDQ,
      hasPendingTie: false,
    };
  });

  // Helper to compare two non-DQ participants by tie-breaker rules ONLY (excluding name/id)
  const compareBySportRules = (a: RankingRow, b: RankingRow): number => {
    // 1. Primary: Total contribution descending
    const totalCmp = compareFloats(b.totalContribution, a.totalContribution);
    if (totalCmp !== 0) return totalCmp;

    // 2. Configured tie-breaker rules
    for (const rule of event.tieBreakerRules) {
      if (rule.type === 'total_score') {
        const cmp = compareFloats(b.totalContribution, a.totalContribution);
        if (cmp !== 0) return rule.direction === 'desc' ? cmp : -cmp;
      } else if (rule.type === 'test_contribution' && rule.testId) {
        const cellA = a.testCells[rule.testId];
        const cellB = b.testCells[rule.testId];
        const valA = cellA?.contribution ?? 0;
        const valB = cellB?.contribution ?? 0;
        const cmp = compareFloats(valB, valA);
        if (cmp !== 0) return rule.direction === 'desc' ? cmp : -cmp;
      } else if (rule.type === 'test_effective_time' && rule.testId) {
        const cellA = a.testCells[rule.testId];
        const cellB = b.testCells[rule.testId];
        const validA =
          cellA?.status === 'completado' &&
          cellA.effectiveTimeMs !== null &&
          cellA.effectiveTimeMs > 0;
        const validB =
          cellB?.status === 'completado' &&
          cellB.effectiveTimeMs !== null &&
          cellB.effectiveTimeMs > 0;

        // An absent time or DNF NEVER wins against a valid time
        if (validA && !validB) return -1;
        if (!validA && validB) return 1;
        if (validA && validB) {
          const timeDiff = (cellA.effectiveTimeMs as number) - (cellB.effectiveTimeMs as number);
          if (timeDiff !== 0) {
            return rule.direction === 'asc' ? timeDiff : -timeDiff;
          }
        }
      }
    }

    return 0; // Persistent tie by sporting criteria!
  };

  // Separate non-DQ and DQ participants
  const eligibleRows = rawRows.filter((r) => !r.isDisqualified);
  const dqRows = rawRows.filter((r) => r.isDisqualified);

  // First sort eligible rows by sporting criteria
  eligibleRows.sort((a, b) => {
    const cmp = compareBySportRules(a, b);
    if (cmp !== 0) return cmp;
    // Check if there is an explicit admin tie resolution covering both a and b
    for (const resolution of Object.values(event.resolvedTies || {})) {
      const idxA = resolution.orderedParticipantIds.indexOf(a.participantId);
      const idxB = resolution.orderedParticipantIds.indexOf(b.participantId);
      if (idxA !== -1 && idxB !== -1 && idxA !== idxB) {
        return idxA - idxB;
      }
    }
    return 0;
  });

  // Assign positions and detect persistent ties
  // Note: If two rows have compareBySportRules === 0 AND have activity (or even at 0 if completedTestsCount > 0)
  // and no explicit resolution separates them, they share the exact same position!
  let hasUnresolvedTies = false;

  let i = 0;
  while (i < eligibleRows.length) {
    let j = i + 1;
    while (
      j < eligibleRows.length &&
      compareBySportRules(eligibleRows[i], eligibleRows[j]) === 0
    ) {
      j++;
    }

    const groupSize = j - i;
    const sharedRankPosition = i + 1;

    if (groupSize === 1) {
      eligibleRows[i].position = sharedRankPosition;
      eligibleRows[i].hasPendingTie = false;
    } else {
      // Multiple rows tied on all sporting criteria
      const groupIds = eligibleRows
        .slice(i, j)
        .map((r) => r.participantId)
        .sort();
      const tieGroupKey = groupIds.join('__');
      const resolution = (event.resolvedTies || {})[tieGroupKey];

      if (
        resolution &&
        resolution.orderedParticipantIds.length === groupSize &&
        groupIds.every((id) => resolution.orderedParticipantIds.includes(id))
      ) {
        // Admin explicitly resolved this tie
        for (let k = i; k < j; k++) {
          eligibleRows[k].position = k + 1;
          eligibleRows[k].hasPendingTie = false;
          eligibleRows[k].tieGroupKey = tieGroupKey;
          eligibleRows[k].tieResolutionReason = resolution.reason;
        }
      } else {
        // Unresolved tie! Give all tied pilots the SAME position
        // Flag as "Desempate pendiente" if at least one of them has completed >= 1 test
        // (Pilots with 0 completed tests all sit tied at the bottom as "Sin resultados publicados" / mismo puesto)
        const anyHasCompletedTest = eligibleRows
          .slice(i, j)
          .some((r) => r.completedTestsCount > 0);

        if (anyHasCompletedTest) {
          hasUnresolvedTies = true;
        }

        for (let k = i; k < j; k++) {
          eligibleRows[k].position = sharedRankPosition;
          eligibleRows[k].hasPendingTie = anyHasCompletedTest;
          eligibleRows[k].tieGroupKey = anyHasCompletedTest ? tieGroupKey : undefined;
        }
      }
    }

    i = j;
  }

  // Sort DQ rows by totalContribution descending just for clean listing at the bottom, with position = null ("DQ")
  dqRows.sort((a, b) => compareBySportRules(a, b));

  return {
    rows: [...eligibleRows, ...dqRows],
    bestTimeByTestId,
    isRankingProvisional,
    hasUnresolvedTies,
  };
}


export function formatTeamDivisionLabel(division?: 'distribucion' | 'transmision'): string {
  return division === 'transmision' ? 'Transmisión' : 'Distribución';
}

/**
 * Maps an intra-team ordinal index (0-based) to the official podium award tier:
 * - Index 0 -> 1° Lugar (1 winner per team)
 * - Index 1, 2 -> 2° Lugar (2 winners per team)
 * - Index 3, 4, 5 -> 3° Lugar (3 winners per team)
 * - Index >= 6 -> null (regular position)
 */
export function getPodiumPlaceForTeamRankIndex(
  zeroBasedTeamIndex: number,
  isEligibleAndActive: boolean
): 1 | 2 | 3 | null {
  if (!isEligibleAndActive) return null;
  if (zeroBasedTeamIndex === 0) return 1;
  if (zeroBasedTeamIndex === 1 || zeroBasedTeamIndex === 2) return 2;
  if (zeroBasedTeamIndex >= 3 && zeroBasedTeamIndex <= 5) return 3;
  return null;
}

export function filterAndRankByDivision(
  rows: RankingRow[],
  divisionFilter: 'todos' | 'distribucion' | 'transmision'
): RankingRow[] {
  // First compute intra-division ranks & podiumPlace (1x 1st, 2x 2nd, 3x 3rd per team)
  const divCounters: Record<'distribucion' | 'transmision', number> = {
    distribucion: 0,
    transmision: 0,
  };

  const rowsWithTeamPodium = rows.map((r) => {
    if (r.isDisqualified) {
      return {
        ...r,
        divisionPosition: null,
        podiumPlace: null,
      };
    }
    const divKey = r.teamDivision || 'distribucion';
    const teamIdx = divCounters[divKey];
    divCounters[divKey] = teamIdx + 1;
    const isActive = r.completedTestsCount > 0;
    const podiumPlace = getPodiumPlaceForTeamRankIndex(teamIdx, isActive);

    return {
      ...r,
      divisionPosition: teamIdx + 1,
      podiumPlace,
    };
  });

  if (divisionFilter === 'todos') {
    return rowsWithTeamPodium;
  }

  // Keep each pilot's general tournament position intact in `position`,
  // while `divisionPosition` and `podiumPlace` hold their intra-group standing.
  return rowsWithTeamPodium.filter(
    (r) => (r.teamDivision || 'distribucion') === divisionFilter
  );
}


/**
 * Formats a competitor's full name to show only their First Name and First Surname.
 * Example: "Carlos Cristian Rigotti Basoalto" -> "Carlos Rigotti"
 * Example: "Diego Vera Pizarro" -> "Diego Vera"
 */
export function formatShortName(fullName?: string | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 4) {
    return parts[0] + ' ' + parts[2];
  } else if (parts.length === 3) {
    return parts[0] + ' ' + parts[1];
  }
  return fullName;
}

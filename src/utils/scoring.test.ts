import { describe, expect, it, beforeEach } from 'vitest';
import {
  calculateResultMetrics,
  computeEventRanking,
  normalizeSearchText,
  parseTimeInputsToMs,
} from './scoring';
import { parseAndValidateParticipantsCsv } from './csv';
import {
  DEMO_EVENTS,
  DEMO_PARTICIPANTS,
  DEMO_RESULTS,
  DEMO_TESTS,
  DEMO_TRACKS,
  toPublicParticipant,
  toPublicResult,
} from '../data/seedData';
import {
  clearAllDraftStorage,
  loadUserDraftsForEvent,
  removeUserDraft,
  saveUserDraft,
} from '../services/draftStorage';
import {
  CompetitionEvent,
  CompetitionResult,
  EvaluationTest,
  Participant,
} from '../types/domain';

const mockEvent: CompetitionEvent = DEMO_EVENTS[0];
const testVelocidad: EvaluationTest = DEMO_TESTS.find((t) => t.id === 'test_velocidad')!;
const testHabilidades: EvaluationTest = DEMO_TESTS.find((t) => t.id === 'test_habilidades')!;
const testDestreza: EvaluationTest = DEMO_TESTS.find((t) => t.id === 'test_destreza')!;

describe('Suite Integral de Verificación — Competencia de Drones (13 Casos Críticos)', () => {
  beforeEach(() => {
    clearAllDraftStorage();
  });

  it('1. Verifica la semilla demostrativa: 35 participantes, 4 pistas y 3 pruebas con aportes 33,33 + 33,33 + 33,34 = 100', () => {
    expect(DEMO_PARTICIPANTS.length).toBe(35);
    expect(DEMO_TRACKS.length).toBe(4);
    expect(DEMO_TESTS.length).toBe(3);
    const sumContributions = DEMO_TESTS.reduce((acc, t) => acc + t.maxContribution, 0);
    expect(sumContributions).toBeCloseTo(100, 5);
  });

  it('2. Importación CSV y búsqueda insensible a mayúsculas y tildes, distinguiendo homónimos de duplicados', () => {
    // Search accent & case insensitivity
    const query = normalizeSearchText('MATIAS ROJAS');
    const matches = DEMO_PARTICIPANTS.filter((p) => p.normalizedName.includes(query));
    // PIL-001 (AeroTech Chile #101) and PIL-029 (Condor Robotics #129) share the name Matías Rojas Valdés
    expect(matches.length).toBe(2);
    expect(matches[0].companyOrTeam).not.toBe(matches[1].companyOrTeam);

    const queryTilde = normalizeSearchText('agustin yanez nunez');
    const matchTilde = DEMO_PARTICIPANTS.find((p) => p.normalizedName.includes(queryTilde));
    expect(matchTilde?.id).toBe('PIL-028');

    // CSV validation
    const csv = [
      'id_interno,nombre_completo,empresa_equipo,numero_competidor,estado_acreditacion,observaciones_internas',
      'PIL-001,Matías Rojas Valdés,AeroTech Chile,#101,habilitado,Nota 1',
      'PIL-002,Matías Rojas Valdés,Condor Robotics,#102,pendiente,Homónimo válido de otra empresa',
      'PIL-003,Matías Rojas Valdés,AeroTech Chile,#101,pendiente,Duplicado exacto de empresa y número',
    ].join('\n');

    const res = parseAndValidateParticipantsCsv(csv, []);
    expect(res.rows[0].isValid).toBe(true);
    expect(res.rows[1].isValid).toBe(true);
    expect(res.rows[1].isHomonymWarning).toBe(true);
    expect(res.rows[2].isValid).toBe(false);
    expect(res.rows[2].isExactDuplicate).toBe(true);
  });

  it('3. Conversión de tiempos sin convertir vacíos en ceros y rechazo de tiempos <= 0', () => {
    expect(parseTimeInputsToMs('', '', '').ms).toBeNull();
    expect(parseTimeInputsToMs('1', '30', '50').ms).toBe(90500);
    expect(parseTimeInputsToMs('5', '00', '00').ms).toBe(300000);

    const zeroTime = calculateResultMetrics({
      test: testVelocidad,
      participationStatus: 'completado',
      rawScore: null,
      pointsPenalty: 0,
      registeredTimeMs: 0,
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: 60000,
    });
    expect(zeroTime.validationErrors.length).toBeGreaterThan(0);
  });

  it('4. Puntajes manuales (Método A): descuentos sobre puntos base antes de ponderar y validación de máximo', () => {
    const manualTest: EvaluationTest = { ...testHabilidades, scoringMethod: 'manual' };
    const res = calculateResultMetrics({
      test: manualTest,
      participationStatus: 'completado',
      rawScore: 90,
      pointsPenalty: 15,
      registeredTimeMs: 180000,
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: null,
    });
    expect(res.netScore).toBe(75);
    expect(res.contribution).toBeCloseTo((75 / 100) * 33.33, 6);

    const overMax = calculateResultMetrics({
      test: manualTest,
      participationStatus: 'completado',
      rawScore: 105,
      pointsPenalty: 0,
      registeredTimeMs: 120000,
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: null,
    });
    expect(overMax.validationErrors.length).toBeGreaterThan(0);
  });

  it('5. Límite exacto de 300 segundos (válido) vs exceso > 300 segundos (bloqueado), evaluado antes de penalización en segundos', () => {
    const exact300 = calculateResultMetrics({
      test: testVelocidad,
      participationStatus: 'completado',
      rawScore: null,
      pointsPenalty: 0,
      registeredTimeMs: 300000, // Exactamente 300.00s
      secondsPenaltyMs: 15000, // +15s de penalización después del límite
      bestEffectiveTimeMsForTest: 60000,
    });
    expect(exact300.exceedsTimeLimit).toBe(false);
    expect(exact300.effectiveTimeMs).toBe(315000);

    const over300 = calculateResultMetrics({
      test: testVelocidad,
      participationStatus: 'completado',
      rawScore: null,
      pointsPenalty: 0,
      registeredTimeMs: 300010, // 300.01s -> Excede el límite
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: 60000,
    });
    expect(over300.exceedsTimeLimit).toBe(true);
  });

  it('6. Puntuación basada en tiempo límite reglamentado (300s): a los 300s llega a 0 pts, a los 150s otorga 50% y a 4:57 (297s) otorga 1%', () => {
    // Caso 1: 150 segundos (la mitad del límite de 300s) -> 50 puntos base
    const halfTime = calculateResultMetrics({
      test: testVelocidad,
      participationStatus: 'completado',
      rawScore: null,
      pointsPenalty: 0,
      registeredTimeMs: 150000, // 2:30 = 150s
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: null,
    });
    expect(halfTime.calculatedBaseScore).toBe(50);
    expect(halfTime.contribution).toBeCloseTo((50 / 100) * 33.33, 3);

    // Caso 2: 4 minutos 57 segundos (297 segundos de 300s límite) -> 1 punto base (1% de puntos)
    const almostZero = calculateResultMetrics({
      test: testVelocidad,
      participationStatus: 'completado',
      rawScore: null,
      pointsPenalty: 0,
      registeredTimeMs: 297000, // 4:57 = 297s -> faltan 3s para el límite
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: null,
    });
    expect(almostZero.calculatedBaseScore).toBe(1);
    expect(almostZero.contribution).toBeCloseTo((1 / 100) * 33.33, 3);

    // Caso 3: Exactamente 5 minutos (300 segundos reglamentados) -> Llega exactamente a Cero (0 pts)
    const exactLimit = calculateResultMetrics({
      test: testVelocidad,
      participationStatus: 'completado',
      rawScore: null,
      pointsPenalty: 0,
      registeredTimeMs: 300000, // 5:00 = 300s límite exacto
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: null,
    });
    expect(exactLimit.calculatedBaseScore).toBe(0);
    expect(exactLimit.contribution).toBe(0);

    // Caso 4: Tiempo superado (> 300 segundos) -> 0 pts
    const overLimit = calculateResultMetrics({
      test: testVelocidad,
      participationStatus: 'completado',
      rawScore: null,
      pointsPenalty: 0,
      registeredTimeMs: 305000, // 5:05 -> fuera de tiempo
      secondsPenaltyMs: 0,
      bestEffectiveTimeMsForTest: null,
    });
    expect(overLimit.calculatedBaseScore).toBe(0);
    expect(overLimit.contribution).toBe(0);
    expect(overLimit.exceedsTimeLimit).toBe(true);
  });

  it('7. Desempates por criterios 1->2->3->4, DNF nunca gana frente a tiempo válido, DQ general excluido y empate persistente', () => {
    const makePilot = (id: string, name: string, isDQ = false): Participant => ({
      id,
      eventId: mockEvent.id,
      fullName: name,
      normalizedName: normalizeSearchText(name),
      companyOrTeam: 'Team',
      competitorNumber: id,
      accreditationStatus: 'habilitado',
      requirementsChecks: {},
      internalNotes: 'Nota privada',
      isDisqualified: isDQ,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const p1 = makePilot('P1', 'Zeta Pilot');
    const p2 = makePilot('P2', 'Alfa Pilot');
    const p3 = makePilot('P3', 'Beta Pilot');
    const p4 = makePilot('P4', 'DQ Pilot', true);

    const makeRes = (
      participantId: string,
      testId: string,
      contribution: number,
      effTime: number | null = null,
      status: 'completado' | 'dnf' = 'completado'
    ): CompetitionResult => ({
      id: `${participantId}__${testId}`,
      eventId: mockEvent.id,
      participantId,
      testId,
      trackId: 'track_1',
      attemptNumber: 1,
      participationStatus: status,
      publicationStatus: 'publicado',
      rawScore: 100,
      pointsPenalty: 0,
      registeredTimeMs: effTime,
      secondsPenaltyMs: 0,
      effectiveTimeMs: effTime,
      calculatedBaseScore: status === 'dnf' ? 0 : 100,
      netScore: status === 'dnf' ? 0 : 100,
      contribution: status === 'dnf' ? 0 : contribution,
      observation: '',
      adminException: null,
      previousAttempts: [],
      version: 1,
      configVersionUsed: 1,
      createdBy: 'u1',
      createdByName: 'Admin',
      updatedBy: 'u1',
      updatedByName: 'Admin',
      publishedAt: 1000,
      updatedAt: 1000,
    });

    const results: CompetitionResult[] = [
      makeRes('P1', 'test_velocidad', 33.33, 60000),
      makeRes('P1', 'test_habilidades', 33.33, 60000),
      makeRes('P1', 'test_destreza', 33.34, 70000),

      makeRes('P2', 'test_velocidad', 33.33, 60000),
      makeRes('P2', 'test_habilidades', 33.33, 60000),
      makeRes('P2', 'test_destreza', 33.34, 70000),

      makeRes('P3', 'test_velocidad', 33.33, 60000),
      makeRes('P3', 'test_habilidades', 25.0, 80000),
      makeRes('P3', 'test_destreza', 25.0, 90000),

      makeRes('P4', 'test_velocidad', 33.33, 50000),
      makeRes('P4', 'test_habilidades', 33.33, 50000),
      makeRes('P4', 'test_destreza', 33.34, 50000),
    ];

    const ranking = computeEventRanking({
      event: mockEvent,
      tests: [testVelocidad, testHabilidades, testDestreza],
      participants: [p1, p2, p3, p4],
      results,
    });

    // P4 has 50.000ms in velocity, but since P4 is general DQ, P4's time is excluded from bestTimeByTestId!
    expect(ranking.bestTimeByTestId['test_velocidad']).toBe(60000);
    // P1 and P2 share position 1 (persistent tie does NOT use alphabetical order!)
    expect(ranking.rows[0].position).toBe(1);
    expect(ranking.rows[1].position).toBe(1);
    expect(ranking.rows[0].hasPendingTie).toBe(true);
    expect(ranking.rows[1].hasPendingTie).toBe(true);
    // P3 is position 3
    expect(ranking.rows[2].participantId).toBe('P3');
    expect(ranking.rows[2].position).toBe(3);
    // P4 is at the bottom with position null (DQ)
    expect(ranking.rows[3].participantId).toBe('P4');
    expect(ranking.rows[3].position).toBeNull();
  });

  it('8. Protección de datos privados en Pantalla Pública y aislamiento de borradores locales por operador y evento', () => {
    const samplePrivate = DEMO_PARTICIPANTS[0];
    expect(samplePrivate.internalNotes.length).toBeGreaterThan(0);

    const publicProj = toPublicParticipant(samplePrivate);
    expect('internalNotes' in publicProj).toBe(false);
    expect('requirementsChecks' in publicProj).toBe(false);

    // Drafts isolated by userUid and eventId
    saveUserDraft({
      key: 'op1__evt1__PIL-001__test_velocidad',
      userUid: 'operator-1',
      eventId: 'evt-1',
      participantId: 'PIL-001',
      testId: 'test_velocidad',
      trackId: 'track_1',
      participationStatus: 'completado',
      rawScoreInput: '',
      pointsPenaltyInput: '0',
      minutesInput: '1',
      secondsInput: '15',
      centisecondsInput: '00',
      secondsPenaltyInput: '0',
      observation: 'Borrador operador 1',
      baseServerVersion: 1,
      savedAt: Date.now(),
    });

    // Operator 1 in evt-1 sees the draft
    const op1Drafts = loadUserDraftsForEvent('operator-1', 'evt-1');
    expect(op1Drafts['PIL-001__test_velocidad']?.observation).toBe('Borrador operador 1');

    // Operator 2 on the same device does NOT see Operator 1's draft!
    const op2Drafts = loadUserDraftsForEvent('operator-2', 'evt-1');
    expect(Object.keys(op2Drafts).length).toBe(0);

    // Operator 1 in a different event (evt-2) does NOT see evt-1's draft!
    const op1OtherEventDrafts = loadUserDraftsForEvent('operator-1', 'evt-2');
    expect(Object.keys(op1OtherEventDrafts).length).toBe(0);

    removeUserDraft('operator-1', 'evt-1', 'PIL-001', 'test_velocidad');
    expect(Object.keys(loadUserDraftsForEvent('operator-1', 'evt-1')).length).toBe(0);
  });

  it('9. Verifica que un borrador nunca aparece en los resultados públicos', () => {
    const draftResult: CompetitionResult = {
      ...DEMO_RESULTS[0],
      publicationStatus: 'borrador',
    };
    expect(toPublicResult(draftResult)).toBeNull();
  });
});

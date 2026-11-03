import {
  AuditLogEntry,
  CompetitionEvent,
  CompetitionResult,
  EvaluationTest,
  Participant,
  PublicParticipant,
  PublicResult,
  Track,
  UserProfile,
} from '../types/domain';
import { normalizeSearchText, recalculateAllResultsForTest } from '../utils/scoring';

export const DEMO_USERS: UserProfile[] = [
  {
    uid: 'demo-admin-1',
    email: 'admin@drones-demo.cl',
    displayName: 'Carlos Mendoza (Director General - Admin)',
    role: 'admin',
    active: true,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    uid: 'demo-staff-1',
    email: 'operador1@drones-demo.cl',
    displayName: 'Andrea Silva (Operador Pista 1)',
    role: 'staff',
    active: true,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    uid: 'demo-staff-2',
    email: 'operador2@drones-demo.cl',
    displayName: 'Javier Morales (Operador Pista 2)',
    role: 'staff',
    active: true,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    uid: 'demo-staff-3',
    email: 'operador3@drones-demo.cl',
    displayName: 'Francisca Pino (Operador Pista 3)',
    role: 'staff',
    active: true,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    uid: 'demo-staff-4',
    email: 'operador4@drones-demo.cl',
    displayName: 'Rodrigo Vega (Operador Pista 4)',
    role: 'staff',
    active: true,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
];

export const INITIAL_EVENT_ID = 'evt-nacional-2026';
export const SECOND_EVENT_ID = 'evt-austral-2026';

export const DEMO_EVENTS: CompetitionEvent[] = [
  {
    id: INITIAL_EVENT_ID,
    name: 'Copa Nacional de Drones Profesionales 2026 (DEMO)',
    date: '2026-11-15',
    logoUrl: '',
    primaryColor: '#e60012',
    secondaryColor: '#ff2a2a',
    status: 'en_curso',
    configVersion: 1,
    accreditationRequirements: [
      {
        id: 'licencia_vigente',
        label: 'Licencia vigente verificada por el staff',
        required: true,
      },
      {
        id: 'pertenencia_institucional',
        label: 'Pertenencia institucional verificada',
        required: true,
      },
      {
        id: 'asistencia_briefing',
        label: 'Asistencia al briefing',
        required: true,
      },
      {
        id: 'inspeccion_tecnica',
        label: 'Inspección técnica aprobada',
        required: true,
      },
    ],
    tieBreakerRules: [
      {
        id: 'tb-1',
        type: 'total_score',
        direction: 'desc',
        label: '1. Mayor puntaje total',
      },
      {
        id: 'tb-2',
        type: 'test_contribution',
        testId: 'test_habilidades',
        direction: 'desc',
        label: '2. Mayor aporte en Habilidades y Obstáculos',
      },
      {
        id: 'tb-3',
        type: 'test_contribution',
        testId: 'test_destreza',
        direction: 'desc',
        label: '3. Mayor aporte en Destreza',
      },
      {
        id: 'tb-4',
        type: 'test_effective_time',
        testId: 'test_velocidad',
        direction: 'asc',
        label: '4. Menor tiempo efectivo válido en Velocidad',
      },
    ],
    resolvedTies: {},
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    id: SECOND_EVENT_ID,
    name: 'Desafío Austral RPAS 2026 (En Preparación)',
    date: '2026-12-10',
    logoUrl: '',
    primaryColor: '#059669',
    secondaryColor: '#6366f1',
    status: 'preparacion',
    configVersion: 1,
    accreditationRequirements: [
      {
        id: 'licencia_vigente',
        label: 'Licencia vigente verificada por el staff',
        required: true,
      },
      {
        id: 'pertenencia_institucional',
        label: 'Pertenencia institucional verificada',
        required: true,
      },
      {
        id: 'asistencia_briefing',
        label: 'Asistencia al briefing',
        required: true,
      },
      {
        id: 'inspeccion_tecnica',
        label: 'Inspección técnica aprobada',
        required: true,
      },
    ],
    tieBreakerRules: [
      { id: 'tb-1', type: 'total_score', direction: 'desc', label: '1. Mayor puntaje total' },
    ],
    resolvedTies: {},
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
];

export const DEMO_TRACKS: Track[] = [
  {
    id: 'track_1',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 1 - Sector Norte',
    status: 'operativa',
    assignedTestIds: ['test_velocidad', 'test_habilidades'],
    currentParticipantId: 'PIL-015',
    currentTestId: 'test_velocidad',
    order: 1,
  },
  {
    id: 'track_2',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 2 - Sector Sur',
    status: 'operativa',
    assignedTestIds: ['test_velocidad', 'test_destreza'],
    currentParticipantId: 'PIL-016',
    currentTestId: 'test_destreza',
    order: 2,
  },
  {
    id: 'track_3',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 3 - Hangar Técnico',
    status: 'operativa',
    assignedTestIds: ['test_habilidades', 'test_destreza'],
    currentParticipantId: 'PIL-017',
    currentTestId: 'test_habilidades',
    order: 3,
  },
  {
    id: 'track_4',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 4 - Arena Central',
    status: 'en_pausa',
    assignedTestIds: ['test_velocidad', 'test_habilidades', 'test_destreza'],
    currentParticipantId: null,
    currentTestId: null,
    order: 4,
  },
];

export const DEMO_TESTS: EvaluationTest[] = [
  {
    id: 'test_velocidad',
    eventId: INITIAL_EVENT_ID,
    name: 'Velocidad',
    scoringMethod: 'time_calculated',
    maxBaseScore: 100,
    maxContribution: 33.33,
    timeLimitMs: 300000, // 300 segundos
    enableSecondsPenalty: true,
    officialAttemptsCount: 1,
    attemptSelectionRule: 'best_score',
    assignedTrackIds: ['track_1', 'track_2', 'track_4'],
    status: 'abierta',
    order: 1,
  },
  {
    id: 'test_habilidades',
    eventId: INITIAL_EVENT_ID,
    name: 'Habilidades y Obstáculos',
    scoringMethod: 'manual',
    maxBaseScore: 100,
    maxContribution: 33.33,
    timeLimitMs: 300000, // 300 segundos
    enableSecondsPenalty: true,
    officialAttemptsCount: 1,
    attemptSelectionRule: 'best_score',
    assignedTrackIds: ['track_1', 'track_3', 'track_4'],
    status: 'abierta',
    order: 2,
  },
  {
    id: 'test_destreza',
    eventId: INITIAL_EVENT_ID,
    name: 'Destreza',
    scoringMethod: 'manual',
    maxBaseScore: 100,
    maxContribution: 33.34,
    timeLimitMs: 300000, // 300 segundos
    enableSecondsPenalty: true,
    officialAttemptsCount: 1,
    attemptSelectionRule: 'best_score',
    assignedTrackIds: ['track_2', 'track_3', 'track_4'],
    status: 'abierta',
    order: 3,
  },
];

const RAW_PILOTS: Array<{
  id: string;
  name: string;
  company: string;
  number: string;
  accredited: boolean;
  notes: string;
  isDQ?: boolean;
  dqReason?: string;
}> = [
  { id: 'PIL-001', name: 'Matías Rojas Valdés', company: 'AeroTech Chile', number: '#101', accredited: true, notes: 'Verificado canal VTX R1. Homónimo de PIL-029.' },
  { id: 'PIL-002', name: 'Camila Soto Morales', company: 'DroneWorks Sur', number: '#102', accredited: true, notes: 'Equipo principal 5 pulgadas inspeccionado.' },
  { id: 'PIL-003', name: 'Sebastián Muñoz Herrera', company: 'SkyVortex Racing', number: '#103', accredited: true, notes: 'Seguro RC al día.' },
  { id: 'PIL-004', name: 'Valentina Contreras Díaz', company: 'Andes FPV Team', number: '#104', accredited: true, notes: 'Desempate técnico demostrable con PIL-005.' },
  { id: 'PIL-005', name: 'Nicolás Fuentes Bravo', company: 'Patagonia Drones', number: '#105', accredited: true, notes: 'Empata puntaje total con PIL-004, define Habilidades.' },
  { id: 'PIL-006', name: 'Francisca Lagos Pizarro', company: 'AeroVision Industrial', number: '#106', accredited: true, notes: 'Inspección aprobada sin observaciones.' },
  { id: 'PIL-007', name: 'Diego Alarcón Tapia', company: 'CobreAir Ingeniería', number: '#107', accredited: true, notes: 'Dron de respaldo registrado.' },
  { id: 'PIL-008', name: 'Ignacio Vera Santander', company: 'Vuelo Austral', number: '#108', accredited: true, notes: 'Empate persistente total con PIL-009.' },
  { id: 'PIL-009', name: 'Tomás Castillo Núñez', company: 'Horizonte RPAS', number: '#109', accredited: true, notes: 'Empate persistente total con PIL-008.' },
  { id: 'PIL-010', name: 'Daniela Espinoza Riquelme', company: 'Cumbre Robotics', number: '#110', accredited: true, notes: 'Operadora certificada DGAC.' },
  { id: 'PIL-011', name: 'Felipe Garrido Poblete', company: 'AeroTech Chile', number: '#111', accredited: true, notes: 'Sin observaciones internas.' },
  { id: 'PIL-012', name: 'Catalina Reyes Bustos', company: 'Altitud Cero', number: '#112', accredited: true, notes: 'Registró tiempo exacto en límite 300,00s en Habilidades.' },
  { id: 'PIL-013', name: 'Cristóbal Parra Vergara', company: 'DroneWorks Sur', number: '#113', accredited: true, notes: 'Batería LiPo 6S verificada.' },
  { id: 'PIL-014', name: 'Fernanda Molina Cortés', company: 'SkyVortex Racing', number: '#114', accredited: true, notes: 'Tuvo DNF en prueba de Velocidad por pérdida de hélice.' },
  { id: 'PIL-015', name: 'Benjamín Navarro Toledo', company: 'Andes FPV Team', number: '#115', accredited: true, notes: 'En pista actualmente.' },
  { id: 'PIL-016', name: 'Antonia Cáceres Godoy', company: 'Condor Robotics', number: '#116', accredited: true, notes: 'En pista 2 actualmente.' },
  { id: 'PIL-017', name: 'Gabriel Sepúlveda Leiva', company: 'Patagonia Drones', number: '#117', accredited: true, notes: 'En pista 3 actualmente.' },
  { id: 'PIL-018', name: 'Martina Salazar Flores', company: 'AeroVision Industrial', number: '#118', accredited: true, notes: 'Falta completar Destreza.' },
  { id: 'PIL-019', name: 'Lucas Valenzuela Carrasco', company: 'CobreAir Ingeniería', number: '#119', accredited: true, notes: 'Completadas 2 de 3 pruebas.' },
  { id: 'PIL-020', name: 'Isidora Palma Araneda', company: 'Vuelo Austral', number: '#120', accredited: true, notes: 'Completadas 2 de 3 pruebas.' },
  { id: 'PIL-021', name: 'Maximiliano Ortiz Medina', company: 'Horizonte RPAS', number: '#121', accredited: true, notes: 'Completada 1 de 3 pruebas.' },
  { id: 'PIL-022', name: 'Sofía Figueroa Farías', company: 'Cumbre Robotics', number: '#122', accredited: true, notes: 'Completada 1 de 3 pruebas.' },
  { id: 'PIL-023', name: 'Joaquín Aguilera Sanhueza', company: 'Altitud Cero', number: '#123', accredited: true, notes: 'Completada 1 de 3 pruebas.' },
  { id: 'PIL-024', name: 'Florencia Miranda Quiroz', company: 'AeroTech Chile', number: '#124', accredited: true, notes: 'Completada 1 de 3 pruebas.' },
  {
    id: 'PIL-025',
    name: 'Esteban Bustamante León',
    company: 'NitroFPV Racing',
    number: '#125',
    accredited: true,
    notes: 'Descalificado general por exceder potencia de transmisión permitida.',
    isDQ: true,
    dqReason: 'Exceso de potencia VTX > 600mW durante revisión técnica posterior en manga oficial',
  },
  { id: 'PIL-026', name: 'Constanza Gallardo Peña', company: 'DroneWorks Sur', number: '#126', accredited: true, notes: 'Habilitada, esperando llamado a pista.' },
  { id: 'PIL-027', name: 'Vicente Saavedra Román', company: 'SkyVortex Racing', number: '#127', accredited: true, notes: 'Habilitado, esperando llamado a pista.' },
  { id: 'PIL-028', name: 'agustín yáñez núñez', company: 'Andes FPV Team', number: '#128', accredited: true, notes: 'Nombre con tildes para verificar búsqueda insensible a acentos/mayúsculas.' },
  { id: 'PIL-029', name: 'Matías Rojas Valdés', company: 'Condor Robotics', number: '#129', accredited: true, notes: 'Homónimo de PIL-001 (distinta empresa Condor Robotics y número #129).' },
  { id: 'PIL-030', name: 'Paula Henríquez Díaz', company: 'Patagonia Drones', number: '#130', accredited: false, notes: 'Pendiente firma de asistencia al briefing de seguridad.' },
  { id: 'PIL-031', name: 'Roberto Araya Cisternas', company: 'AeroVision Industrial', number: '#131', accredited: false, notes: 'Pendiente inspección técnica de failsafe.' },
  { id: 'PIL-032', name: 'Lorena Carvajal Tapia', company: 'CobreAir Ingeniería', number: '#132', accredited: false, notes: 'Pendiente presentar credencial institucional.' },
  { id: 'PIL-033', name: 'Mauricio Olivares Jorquera', company: 'Vuelo Austral', number: '#133', accredited: false, notes: 'Por acreditar en mesa de entrada.' },
  { id: 'PIL-034', name: 'Macarena Donoso Vera', company: 'Horizonte RPAS', number: '#134', accredited: false, notes: 'Por acreditar en mesa de entrada.' },
  { id: 'PIL-035', name: 'Héctor Zambrano Cuevas', company: 'Cumbre Robotics', number: '#135', accredited: false, notes: 'Por acreditar en mesa de entrada.' },
];

export const DEMO_PARTICIPANTS: Participant[] = RAW_PILOTS.map((raw) => ({
  id: raw.id,
  eventId: INITIAL_EVENT_ID,
  fullName: raw.name === 'agustín yáñez núñez' ? 'Agustín Yáñez Núñez' : raw.name,
  normalizedName: normalizeSearchText(raw.name),
  companyOrTeam: raw.company,
  competitorNumber: raw.number,
  accreditationStatus: 'habilitado',
  requirementsChecks: {
    licencia_vigente: raw.accredited,
    pertenencia_institucional: raw.accredited,
    asistencia_briefing: raw.accredited,
    inspeccion_tecnica: raw.accredited,
  },
  internalNotes: raw.notes,
  isDisqualified: Boolean(raw.isDQ),
  disqualificationReason: raw.dqReason,
  disqualifiedBy: raw.isDQ ? 'demo-admin-1' : undefined,
  disqualifiedByName: raw.isDQ ? 'Carlos Mendoza (Admin)' : undefined,
  disqualifiedAt: raw.isDQ ? 1730003600000 : undefined,
  createdAt: 1730000000000,
  updatedAt: 1730000000000,
}));

function buildInitialResults(): CompetitionResult[] {
  const results: CompetitionResult[] = [];
  const addRes = (params: {
    participantId: string;
    testId: 'test_velocidad' | 'test_habilidades' | 'test_destreza';
    trackId: string;
    status?: 'completado' | 'dnf' | 'dq';
    rawScore?: number | null;
    pointsPenalty?: number;
    registeredTimeMs?: number | null;
    secondsPenaltyMs?: number;
    observation?: string;
  }) => {
    const test = DEMO_TESTS.find((t) => t.id === params.testId)!;
    const status = params.status || 'completado';
    const rawScore = params.rawScore ?? (test.scoringMethod === 'manual' ? 85 : null);
    const pointsPenalty = params.pointsPenalty ?? 0;
    const registeredTimeMs = params.registeredTimeMs ?? 90000;
    const secondsPenaltyMs = params.secondsPenaltyMs ?? 0;
    const effectiveTimeMs =
      status === 'completado' && registeredTimeMs !== null
        ? registeredTimeMs + secondsPenaltyMs
        : null;

    let calculatedBaseScore: number | null = 0;
    let netScore: number | null = 0;
    let contribution: number | null = 0;

    if (status === 'completado' && test.scoringMethod === 'manual' && rawScore !== null) {
      calculatedBaseScore = rawScore;
      netScore = Math.max(0, rawScore - pointsPenalty);
      contribution = Number(((netScore / test.maxBaseScore) * test.maxContribution).toFixed(10));
    }

    results.push({
      id: `${params.participantId}__${params.testId}`,
      eventId: INITIAL_EVENT_ID,
      participantId: params.participantId,
      testId: params.testId,
      trackId: params.trackId,
      attemptNumber: 1,
      participationStatus: status,
      publicationStatus: 'publicado',
      rawScore: test.scoringMethod === 'manual' ? rawScore : null,
      pointsPenalty,
      registeredTimeMs,
      secondsPenaltyMs,
      effectiveTimeMs,
      calculatedBaseScore,
      netScore,
      contribution,
      observation: params.observation || '',
      adminException: null,
      previousAttempts: [],
      version: 1,
      configVersionUsed: 1,
      createdBy: 'demo-staff-1',
      createdByName: 'Andrea Silva (Staff)',
      updatedBy: 'demo-staff-1',
      updatedByName: 'Andrea Silva (Staff)',
      publishedAt: 1730002000000 + results.length * 60000,
      updatedAt: 1730002000000 + results.length * 60000,
    });
  };

  // 1st place candidate: PIL-001 (Best velocity time: 60.00s = 60000ms)
  addRes({ participantId: 'PIL-001', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 60000, secondsPenaltyMs: 0, pointsPenalty: 0, observation: 'Mejor tiempo oficial de referencia (01:00.00)' });
  addRes({ participantId: 'PIL-001', testId: 'test_habilidades', trackId: 'track_3', rawScore: 96, pointsPenalty: 0, registeredTimeMs: 145000 });
  addRes({ participantId: 'PIL-001', testId: 'test_destreza', trackId: 'track_2', rawScore: 94, pointsPenalty: 2, registeredTimeMs: 160000 });

  // 2nd place candidate: PIL-002
  addRes({ participantId: 'PIL-002', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 64000, secondsPenaltyMs: 2000, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-002', testId: 'test_habilidades', trackId: 'track_3', rawScore: 92, pointsPenalty: 0, registeredTimeMs: 152000 });
  addRes({ participantId: 'PIL-002', testId: 'test_destreza', trackId: 'track_2', rawScore: 91, pointsPenalty: 0, registeredTimeMs: 170000 });

  // 3rd place candidate: PIL-003
  addRes({ participantId: 'PIL-003', testId: 'test_velocidad', trackId: 'track_2', registeredTimeMs: 68000, secondsPenaltyMs: 0, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-003', testId: 'test_habilidades', trackId: 'track_1', rawScore: 90, pointsPenalty: 2, registeredTimeMs: 165000 });
  addRes({ participantId: 'PIL-003', testId: 'test_destreza', trackId: 'track_3', rawScore: 89, pointsPenalty: 0, registeredTimeMs: 175000 });

  // Tie-breaker demo: PIL-004 and PIL-005 have identical velocity time (75000ms -> 80 pts)
  // PIL-004 has Habilidades=85, Destreza=75
  // PIL-005 has Habilidades=80, Destreza=80 -> PIL-004 wins tie-breaker #2 (Habilidades) when totals match!
  addRes({ participantId: 'PIL-004', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 75000, secondsPenaltyMs: 0, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-004', testId: 'test_habilidades', trackId: 'track_3', rawScore: 85, pointsPenalty: 0, registeredTimeMs: 180000 });
  addRes({ participantId: 'PIL-004', testId: 'test_destreza', trackId: 'track_2', rawScore: 75, pointsPenalty: 0, registeredTimeMs: 185000 });

  addRes({ participantId: 'PIL-005', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 75000, secondsPenaltyMs: 0, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-005', testId: 'test_habilidades', trackId: 'track_3', rawScore: 80, pointsPenalty: 0, registeredTimeMs: 182000 });
  addRes({ participantId: 'PIL-005', testId: 'test_destreza', trackId: 'track_2', rawScore: 80, pointsPenalty: 0, registeredTimeMs: 181000 });

  // PIL-006 & PIL-007
  addRes({ participantId: 'PIL-006', testId: 'test_velocidad', trackId: 'track_2', registeredTimeMs: 78000, secondsPenaltyMs: 2000, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-006', testId: 'test_habilidades', trackId: 'track_1', rawScore: 84, pointsPenalty: 4, registeredTimeMs: 190000 });
  addRes({ participantId: 'PIL-006', testId: 'test_destreza', trackId: 'track_3', rawScore: 82, pointsPenalty: 0, registeredTimeMs: 195000 });

  addRes({ participantId: 'PIL-007', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 82000, secondsPenaltyMs: 0, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-007', testId: 'test_habilidades', trackId: 'track_3', rawScore: 79, pointsPenalty: 0, registeredTimeMs: 200000 });
  addRes({ participantId: 'PIL-007', testId: 'test_destreza', trackId: 'track_2', rawScore: 81, pointsPenalty: 3, registeredTimeMs: 205000 });

  // Persistent Tie Demo: PIL-008 and PIL-009 have IDENTICAL scores and IDENTICAL velocity effective time (80,000ms)
  addRes({ participantId: 'PIL-008', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 80000, secondsPenaltyMs: 0, pointsPenalty: 0, observation: 'Empate exacto con PIL-009 en los 4 criterios' });
  addRes({ participantId: 'PIL-008', testId: 'test_habilidades', trackId: 'track_3', rawScore: 78, pointsPenalty: 0, registeredTimeMs: 190000 });
  addRes({ participantId: 'PIL-008', testId: 'test_destreza', trackId: 'track_2', rawScore: 76, pointsPenalty: 0, registeredTimeMs: 195000 });

  addRes({ participantId: 'PIL-009', testId: 'test_velocidad', trackId: 'track_2', registeredTimeMs: 80000, secondsPenaltyMs: 0, pointsPenalty: 0, observation: 'Empate exacto con PIL-008 en los 4 criterios' });
  addRes({ participantId: 'PIL-009', testId: 'test_habilidades', trackId: 'track_1', rawScore: 78, pointsPenalty: 0, registeredTimeMs: 192000 });
  addRes({ participantId: 'PIL-009', testId: 'test_destreza', trackId: 'track_3', rawScore: 76, pointsPenalty: 0, registeredTimeMs: 198000 });

  // PIL-010, PIL-011
  addRes({ participantId: 'PIL-010', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 85000, secondsPenaltyMs: 5000, pointsPenalty: 5 });
  addRes({ participantId: 'PIL-010', testId: 'test_habilidades', trackId: 'track_3', rawScore: 77, pointsPenalty: 2, registeredTimeMs: 210000 });
  addRes({ participantId: 'PIL-010', testId: 'test_destreza', trackId: 'track_2', rawScore: 74, pointsPenalty: 0, registeredTimeMs: 215000 });

  addRes({ participantId: 'PIL-011', testId: 'test_velocidad', trackId: 'track_2', registeredTimeMs: 92000, secondsPenaltyMs: 0, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-011', testId: 'test_habilidades', trackId: 'track_1', rawScore: 75, pointsPenalty: 5, registeredTimeMs: 220000 });
  addRes({ participantId: 'PIL-011', testId: 'test_destreza', trackId: 'track_3', rawScore: 72, pointsPenalty: 0, registeredTimeMs: 225000 });

  // PIL-012: Exact 300.00s (300000ms) time limit case!
  addRes({ participantId: 'PIL-012', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 96000, secondsPenaltyMs: 0, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-012', testId: 'test_habilidades', trackId: 'track_3', rawScore: 74, pointsPenalty: 0, registeredTimeMs: 300000, observation: 'Tiempo exacto en el límite de 300,00s (05:00.00) válido como completado' });
  addRes({ participantId: 'PIL-012', testId: 'test_destreza', trackId: 'track_2', rawScore: 70, pointsPenalty: 0, registeredTimeMs: 230000 });

  // PIL-013
  addRes({ participantId: 'PIL-013', testId: 'test_velocidad', trackId: 'track_2', registeredTimeMs: 100000, secondsPenaltyMs: 0, pointsPenalty: 0 });
  addRes({ participantId: 'PIL-013', testId: 'test_habilidades', trackId: 'track_1', rawScore: 70, pointsPenalty: 0, registeredTimeMs: 240000 });
  addRes({ participantId: 'PIL-013', testId: 'test_destreza', trackId: 'track_3', rawScore: 68, pointsPenalty: 0, registeredTimeMs: 245000 });

  // PIL-014: Has a DNF in Velocidad, completed Habilidades and Destreza
  addRes({ participantId: 'PIL-014', testId: 'test_velocidad', trackId: 'track_1', status: 'dnf', registeredTimeMs: null, observation: 'DNF por caída en puerta 4; aporta 0 puntos y nunca se trata como tiempo 0s' });
  addRes({ participantId: 'PIL-014', testId: 'test_habilidades', trackId: 'track_3', rawScore: 82, pointsPenalty: 0, registeredTimeMs: 185000 });
  addRes({ participantId: 'PIL-014', testId: 'test_destreza', trackId: 'track_2', rawScore: 79, pointsPenalty: 0, registeredTimeMs: 195000 });

  // PIL-015 to PIL-020: Partial completion (2 of 3 tests completed, 1 Pending!)
  for (let idx = 15; idx <= 20; idx++) {
    const pid = `PIL-0${idx}`;
    addRes({
      participantId: pid,
      testId: 'test_velocidad',
      trackId: 'track_1',
      registeredTimeMs: 88000 + (idx - 15) * 4500,
      secondsPenaltyMs: idx % 2 === 0 ? 3000 : 0,
      pointsPenalty: 0,
    });
    addRes({
      participantId: pid,
      testId: 'test_habilidades',
      trackId: 'track_3',
      rawScore: 81 - (idx - 15) * 2,
      pointsPenalty: idx % 3 === 0 ? 3 : 0,
      registeredTimeMs: 195000,
    });
    // Destreza remains Pendiente!
  }

  // PIL-021 to PIL-024: Partial completion (1 of 3 tests completed, 2 Pending!)
  for (let idx = 21; idx <= 24; idx++) {
    const pid = `PIL-0${idx}`;
    addRes({
      participantId: pid,
      testId: 'test_velocidad',
      trackId: 'track_2',
      registeredTimeMs: 105000 + (idx - 21) * 6000,
      secondsPenaltyMs: 0,
      pointsPenalty: 0,
    });
  }

  // PIL-025: General DQ participant whose historical results are preserved
  addRes({ participantId: 'PIL-025', testId: 'test_velocidad', trackId: 'track_1', registeredTimeMs: 58000, secondsPenaltyMs: 0, pointsPenalty: 0, observation: 'Tiempo excluido de referencia por DQ general' });
  addRes({ participantId: 'PIL-025', testId: 'test_habilidades', trackId: 'track_3', rawScore: 88, pointsPenalty: 0, registeredTimeMs: 160000 });

  // Recalculate velocity results cleanly
  const disqualifiedIds = new Set(
    DEMO_PARTICIPANTS.filter((p) => p.isDisqualified).map((p) => p.id)
  );
  const velTest = DEMO_TESTS.find((t) => t.id === 'test_velocidad')!;
  const velResults = results.filter((r) => r.testId === 'test_velocidad');
  const otherResults = results.filter((r) => r.testId !== 'test_velocidad');
  const { updatedResults } = recalculateAllResultsForTest(velTest, velResults, disqualifiedIds);

  return [...updatedResults, ...otherResults];
}

export const DEMO_RESULTS: CompetitionResult[] = buildInitialResults();

export function toPublicParticipant(p: Participant): PublicParticipant {
  return {
    id: p.id,
    eventId: p.eventId,
    fullName: p.fullName,
    companyOrTeam: p.companyOrTeam,
    competitorNumber: p.competitorNumber,
    accreditationStatus: p.accreditationStatus,
    isDisqualified: p.isDisqualified,
  };
}

export function toPublicResult(r: CompetitionResult): PublicResult | null {
  if (r.publicationStatus === 'borrador') return null;
  return {
    id: r.id,
    eventId: r.eventId,
    participantId: r.participantId,
    testId: r.testId,
    trackId: r.trackId,
    attemptNumber: r.attemptNumber,
    participationStatus: r.participationStatus,
    publicationStatus: r.publicationStatus,
    effectiveTimeMs: r.effectiveTimeMs,
    registeredTimeMs: r.registeredTimeMs,
    secondsPenaltyMs: r.secondsPenaltyMs,
    pointsPenalty: r.pointsPenalty,
    calculatedBaseScore: r.calculatedBaseScore,
    netScore: r.netScore,
    contribution: r.contribution,
    updatedAt: r.updatedAt,
  };
}

export const DEMO_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log-init-1',
    eventId: INITIAL_EVENT_ID,
    entityType: 'event',
    entityId: INITIAL_EVENT_ID,
    action: 'Configuración inicial del evento y apertura de 4 pistas simultáneas',
    actorUid: 'demo-admin-1',
    actorName: 'Carlos Mendoza (Director General - Admin)',
    actorRole: 'admin',
    reason: 'Inicio oficial de competencia demostrativa con 35 pilotos',
    previousValue: { status: 'preparacion' },
    newValue: { status: 'en_curso', configVersion: 1 },
    timestamp: 1730001000000,
  },
  {
    id: 'log-dq-25',
    eventId: INITIAL_EVENT_ID,
    entityType: 'participant',
    entityId: 'PIL-025',
    action: 'Descalificación General (DQ) aplicada a Esteban Bustamante León (#125)',
    actorUid: 'demo-admin-1',
    actorName: 'Carlos Mendoza (Director General - Admin)',
    actorRole: 'admin',
    reason: 'Exceso de potencia VTX > 600mW durante revisión técnica posterior en manga oficial',
    previousValue: { isDisqualified: false },
    newValue: { isDisqualified: true },
    timestamp: 1730003600000,
  },
];

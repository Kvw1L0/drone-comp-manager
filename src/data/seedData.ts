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
import { normalizeSearchText } from '../utils/scoring';

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
    currentParticipantId: null,
    currentTestId: null,
    order: 1,
  },
  {
    id: 'track_2',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 2 - Sector Sur',
    status: 'operativa',
    assignedTestIds: ['test_velocidad', 'test_destreza'],
    currentParticipantId: null,
    currentTestId: null,
    order: 2,
  },
  {
    id: 'track_3',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 3 - Hangar Técnico',
    status: 'operativa',
    assignedTestIds: ['test_habilidades', 'test_destreza'],
    currentParticipantId: null,
    currentTestId: null,
    order: 3,
  },
  {
    id: 'track_4',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 4 - Arena Central',
    status: 'operativa',
    assignedTestIds: ['test_velocidad', 'test_habilidades', 'test_destreza', 'test_pista4'],
    currentParticipantId: null,
    currentTestId: 'test_pista4',
    order: 4,
  },
  {
    id: 'track_5',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 5 - Circuito Extendido',
    status: 'operativa',
    assignedTestIds: ['test_pista5'],
    currentParticipantId: null,
    currentTestId: 'test_pista5',
    order: 5,
  },
];

export const DEMO_TESTS: EvaluationTest[] = [
  {
    id: 'test_velocidad',
    eventId: INITIAL_EVENT_ID,
    name: 'Velocidad',
    scoringMethod: 'time_calculated',
    maxBaseScore: 100,
    maxContribution: 20,
    timeLimitMs: 300000, // 5 minutos (300 segundos)
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
    scoringMethod: 'time_calculated',
    maxBaseScore: 100,
    maxContribution: 20,
    timeLimitMs: 300000, // 5 minutos (300 segundos)
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
    scoringMethod: 'time_calculated',
    maxBaseScore: 100,
    maxContribution: 20,
    timeLimitMs: 300000, // 5 minutos (300 segundos)
    enableSecondsPenalty: true,
    officialAttemptsCount: 1,
    attemptSelectionRule: 'best_score',
    assignedTrackIds: ['track_2', 'track_3', 'track_4'],
    status: 'abierta',
    order: 3,
  },
  {
    id: 'test_pista4',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 4',
    scoringMethod: 'manual',
    maxBaseScore: 100,
    maxContribution: 20,
    timeLimitMs: 600000,
    enableSecondsPenalty: false,
    officialAttemptsCount: 1,
    attemptSelectionRule: 'best_score',
    assignedTrackIds: ['track_4'],
    status: 'abierta',
    order: 4,
  },
  {
    id: 'test_pista5',
    eventId: INITIAL_EVENT_ID,
    name: 'Pista 5',
    scoringMethod: 'manual',
    maxBaseScore: 100,
    maxContribution: 20,
    timeLimitMs: 600000,
    enableSecondsPenalty: false,
    officialAttemptsCount: 1,
    attemptSelectionRule: 'best_score',
    assignedTrackIds: ['track_5'],
    status: 'abierta',
    order: 5,
  },
];

const RAW_PILOTS: Array<{
  id: string;
  name: string;
  company: string;
  number: string;
  division: 'distribucion' | 'transmision';
  accredited: boolean;
  notes: string;
}> = [
  // DISTRIBUCION / Dx (Pilotos 1 al 17)
  { id: 'PIL-01', name: 'Bryam Eladio Alvarez Stevenson', company: 'Chilquinta DX', number: '#01', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #01' },
  { id: 'PIL-02', name: 'Emiliano Heriberto Pasten Navarrete', company: 'Chilquinta DX', number: '#02', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #02' },
  { id: 'PIL-03', name: 'Erick Patricio Tapia Romo', company: 'Chilquinta DX', number: '#03', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #03' },
  { id: 'PIL-04', name: 'Felipe Giovanni Gutierrez Peñaloza', company: 'Chilquinta DX', number: '#04', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #04' },
  { id: 'PIL-05', name: 'Gerardo Antonio Salgado Montecinos', company: 'Chilquinta DX', number: '#05', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #05' },
  { id: 'PIL-06', name: 'Gilberto Jelvez Sanchez', company: 'Chilquinta DX', number: '#06', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #06' },
  { id: 'PIL-07', name: 'Miguel Solis Perez', company: 'Chilquinta DX', number: '#07', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #07' },
  { id: 'PIL-08', name: 'Oscar Andres Guerrero Ojeda', company: 'Chilquinta DX', number: '#08', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #08' },
  { id: 'PIL-09', name: 'Rafael Edgardo Allendes Rojas', company: 'Chilquinta DX', number: '#09', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #09' },
  { id: 'PIL-10', name: 'Sabino Cruz Labra', company: 'Chilquinta DX', number: '#10', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #10' },
  { id: 'PIL-11', name: 'Adolfo Andres Flores Quezada', company: 'Luz Linares', number: '#11', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #11' },
  { id: 'PIL-12', name: 'Alejandro Ernesto Moraga Leiva', company: 'Luz Linares', number: '#12', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #12' },
  { id: 'PIL-13', name: 'José Anibal Vivanco Sayes', company: 'Luz Parral', number: '#13', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #13' },
  { id: 'PIL-14', name: 'Matias Nicolas Contreras Araya', company: 'Luz Parral', number: '#14', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #14' },
  { id: 'PIL-15', name: 'Daniel Alejandro Tapia Tapia', company: 'Litoral', number: '#15', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #15' },
  { id: 'PIL-16', name: 'Roberto Eduardo Gonzalez Albornoz', company: 'Litoral', number: '#16', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #16' },
  { id: 'PIL-17', name: 'Claudio Antonio Fuentes Figueroa', company: 'Litoral', number: '#17', division: 'distribucion', accredited: true, notes: 'Piloto oficial Dx #17' },

  // TRANSMISION / Tx (Pilotos 18 al 31)
  { id: 'PIL-18', name: 'Carlos Cristian Rigotti Basoalto', company: 'Tecnored', number: '#18', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #18' },
  { id: 'PIL-19', name: 'Claudio Andres Henríquez Campo', company: 'Tecnored', number: '#19', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #19' },
  { id: 'PIL-20', name: 'David Sergio Chávez Olmos', company: 'Tecnored', number: '#20', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #20' },
  { id: 'PIL-21', name: 'Diego Vera Pizarro', company: 'Chilquinta Tx', number: '#21', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #21' },
  { id: 'PIL-22', name: 'Crischnna Belén Navarro Valdivia', company: 'Chilquinta Tx', number: '#22', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #22' },
  { id: 'PIL-23', name: 'Guillermo Ernesto Robledo Olivares', company: 'Chilquinta Tx', number: '#23', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #23' },
  { id: 'PIL-24', name: 'Aarón Nuñez Gilberto', company: 'Chilquinta Tx', number: '#24', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #24' },
  { id: 'PIL-25', name: 'Cristian Murillo Flores', company: 'Chilquinta Tx', number: '#25', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #25' },
  { id: 'PIL-26', name: 'Germán Serrano Astudillo', company: 'Chilquinta Tx', number: '#26', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #26' },
  { id: 'PIL-27', name: 'Nicolas Arenas Yáñez', company: 'Chilquinta Tx', number: '#27', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #27' },
  { id: 'PIL-28', name: 'Gabriel Marcelo Gallardo Miranda', company: 'Tecnored', number: '#28', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #28' },
  { id: 'PIL-29', name: 'Hugo Ignacio Soto Angulo', company: 'Tecnored', number: '#29', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #29' },
  { id: 'PIL-30', name: 'Rodrigo Alejandro Pizarro Ibarra', company: 'Tecnored', number: '#30', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #30' },
  { id: 'PIL-31', name: 'Saulo Alejandro Carray Medina', company: 'Tecnored', number: '#31', division: 'transmision', accredited: true, notes: 'Piloto oficial Tx #31' },
];

export const DEMO_PARTICIPANTS: Participant[] = RAW_PILOTS.map((raw) => ({
  id: raw.id,
  eventId: INITIAL_EVENT_ID,
  fullName: raw.name,
  normalizedName: normalizeSearchText(raw.name),
  companyOrTeam: raw.company,
  teamDivision: raw.division,
  competitorNumber: raw.number,
  accreditationStatus: raw.accredited ? 'habilitado' : 'pendiente',
  requirementsChecks: {
    licencia_vigente: raw.accredited,
    pertenencia_institucional: raw.accredited,
    asistencia_briefing: raw.accredited,
    inspeccion_tecnica: raw.accredited,
  },
  internalNotes: raw.notes,
  isDisqualified: false,
  disqualificationReason: undefined,
  disqualifiedBy: undefined,
  disqualifiedByName: undefined,
  disqualifiedAt: undefined,
  createdAt: 1730000000000,
  updatedAt: 1730000000000,
}));

export const DEMO_RESULTS: CompetitionResult[] = [];

export function toPublicParticipant(p: Participant): PublicParticipant {
  return {
    id: p.id,
    eventId: p.eventId,
    fullName: p.fullName,
    companyOrTeam: p.companyOrTeam,
    teamDivision: p.teamDivision || 'distribucion',
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

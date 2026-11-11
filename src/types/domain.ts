export type UserRole = 'admin' | 'staff';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type EventStatus = 'preparacion' | 'en_curso' | 'finalizado';
export type RankingViewMode = 'detallado' | 'resumen';
export type TeamDivision = 'distribucion' | 'transmision';
export type RankingTeamFilter = 'todos' | 'distribucion' | 'transmision';

export interface RankingVisibleColumns {
  showCompetitorNumber: boolean;
  showFullName: boolean;
  showTeamDivision: boolean;
  showCompany: boolean;
  showTracksBreakdown: boolean;
  showTotalTime: boolean;
  showPoints: boolean;
}

export const DEFAULT_RANKING_COLUMNS: RankingVisibleColumns = {
  showCompetitorNumber: true,
  showFullName: true,
  showTeamDivision: true,
  showCompany: true,
  showTracksBreakdown: false,
  showTotalTime: true,
  showPoints: true,
};

export interface AccreditationRequirement {
  id: string;
  label: string;
  required: boolean;
}

export type TieBreakerType = 'total_score' | 'test_contribution' | 'test_effective_time';

export interface TieBreakerRule {
  id: string;
  type: TieBreakerType;
  testId?: string;
  direction: 'desc' | 'asc';
  label: string;
}

export interface TieResolution {
  tieGroupKey: string;
  participantIds: string[];
  orderedParticipantIds: string[];
  reason: string;
  resolvedBy: string;
  resolvedByName: string;
  resolvedAt: number;
}

export interface CompetitionEvent {
  id: string;
  name: string;
  date: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  status: EventStatus;
  rankingViewMode?: RankingViewMode;
  rankingTeamFilter?: RankingTeamFilter;
  rankingVisibleColumns?: RankingVisibleColumns;
  configVersion: number;
  accreditationRequirements: AccreditationRequirement[];
  tieBreakerRules: TieBreakerRule[];
  resolvedTies: Record<string, TieResolution>;
  createdAt: number;
  updatedAt: number;
}

export type TrackStatus = 'operativa' | 'en_pausa' | 'cerrada';

export interface Track {
  id: string;
  eventId: string;
  name: string;
  status: TrackStatus;
  assignedTestIds: string[];
  currentParticipantId?: string | null;
  currentTestId?: string | null;
  order: number;
}

export type ScoringMethod = 'manual' | 'time_calculated';
export type AttemptSelectionRule = 'best_score' | 'latest_valid' | 'first_official';
export type TestStatus = 'abierta' | 'cerrada';

export interface EvaluationTest {
  id: string;
  eventId: string;
  name: string;
  scoringMethod: ScoringMethod;
  maxBaseScore: number;
  maxContribution: number;
  timeLimitMs: number; // e.g. 300000 for 300 seconds
  enableSecondsPenalty: boolean;
  officialAttemptsCount: number;
  attemptSelectionRule: AttemptSelectionRule;
  assignedTrackIds: string[];
  status: TestStatus;
  order: number;
}

export type AccreditationStatus = 'pendiente' | 'habilitado' | 'rechazado';

export interface Participant {
  id: string; // Identificador interno único (ej. PIL-001)
  eventId: string;
  fullName: string;
  normalizedName: string;
  companyOrTeam: string;
  teamDivision?: TeamDivision;
  competitorNumber: string;
  accreditationStatus: AccreditationStatus;
  requirementsChecks: Record<string, boolean>;
  internalNotes: string; // Privado, nunca en pantalla pública
  isDisqualified: boolean; // DQ general del evento
  disqualificationReason?: string;
  disqualifiedBy?: string;
  disqualifiedByName?: string;
  disqualifiedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PublicParticipant {
  id: string;
  eventId: string;
  fullName: string;
  companyOrTeam: string;
  teamDivision?: TeamDivision;
  competitorNumber: string;
  accreditationStatus: AccreditationStatus;
  isDisqualified: boolean;
}

export type ParticipationStatus = 'pendiente' | 'completado' | 'dnf' | 'dq';
export type PublicationStatus = 'borrador' | 'publicado' | 'anulado';

export type AdminExceptionType =
  | 'unaccredited_participant'
  | 'time_limit_exceeded'
  | 'extraordinary_repeat'
  | 'admin_correction'
  | 'rule_change_recalculation';

export interface AdminException {
  authorized: boolean;
  type: AdminExceptionType;
  reason: string;
  authorizedBy: string;
  authorizedByName: string;
  authorizedAt: number;
}

export interface AttemptSnapshot {
  attemptNumber: number;
  trackId: string;
  participationStatus: ParticipationStatus;
  publicationStatus: PublicationStatus;
  rawScore: number | null;
  pointsPenalty: number;
  registeredTimeMs: number | null;
  secondsPenaltyMs: number;
  effectiveTimeMs: number | null;
  calculatedBaseScore: number | null;
  netScore: number | null;
  contribution: number | null;
  observation: string;
  adminException: AdminException | null;
  createdBy: string;
  createdByName: string;
  publishedAt: number | null;
  archivedAt: number;
  archivedReason: string;
}

export interface CompetitionResult {
  id: string; // Deterministic: `${participantId}__${testId}`
  eventId: string;
  participantId: string;
  testId: string;
  trackId: string;
  attemptNumber: number;
  participationStatus: ParticipationStatus;
  publicationStatus: PublicationStatus;
  rawScore: number | null;
  pointsPenalty: number;
  registeredTimeMs: number | null; // integer ms
  secondsPenaltyMs: number; // integer ms
  effectiveTimeMs: number | null; // integer ms
  calculatedBaseScore: number | null;
  netScore: number | null;
  contribution: number | null;
  observation: string;
  adminException: AdminException | null;
  previousAttempts: AttemptSnapshot[];
  version: number; // Optimistic concurrency control
  configVersionUsed: number;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  publishedAt: number | null;
  updatedAt: number;
}

export interface PublicResult {
  id: string;
  eventId: string;
  participantId: string;
  testId: string;
  trackId: string;
  attemptNumber: number;
  participationStatus: ParticipationStatus;
  publicationStatus: 'publicado' | 'anulado';
  effectiveTimeMs: number | null;
  registeredTimeMs: number | null;
  secondsPenaltyMs: number;
  pointsPenalty: number;
  calculatedBaseScore: number | null;
  netScore: number | null;
  contribution: number | null;
  updatedAt: number;
}

export type AuditEntityType =
  | 'result'
  | 'participant'
  | 'event'
  | 'test'
  | 'track'
  | 'user'
  | 'tie_break';

export interface AuditLogEntry {
  id: string;
  eventId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  reason: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: number;
}

export interface LocalDraft {
  key: string; // `${userUid}__${eventId}__${participantId}__${testId}`
  userUid: string;
  eventId: string;
  participantId: string;
  testId: string;
  trackId: string;
  participationStatus: ParticipationStatus;
  rawScoreInput: string;
  pointsPenaltyInput: string;
  minutesInput: string;
  secondsInput: string;
  centisecondsInput: string;
  secondsPenaltyInput: string;
  observation: string;
  baseServerVersion: number; // Version on server when draft editing started
  savedAt: number;
}

export interface TestRankCell {
  testId: string;
  status: ParticipationStatus;
  isPublished: boolean;
  contribution: number | null; // null if pendiente
  netScore: number | null;
  baseScore: number | null;
  effectiveTimeMs: number | null;
  registeredTimeMs: number | null;
  secondsPenaltyMs: number;
  pointsPenalty: number;
  isProvisional: boolean;
}

export interface RankingRow {
  position: number | null; // null if general DQ
  participantId: string;
  fullName: string;
  companyOrTeam: string;
  teamDivision?: TeamDivision;
  competitorNumber: string;
  isDisqualified: boolean;
  disqualificationReason?: string;
  accreditationStatus: AccreditationStatus;
  testCells: Record<string, TestRankCell>;
  totalContribution: number;
  completedTestsCount: number;
  totalTestsCount: number;
  hasPendingTests: boolean;
  hasDNF: boolean;
  hasTestDQ: boolean;
  hasPendingTie: boolean;
  tieGroupKey?: string;
  tieResolutionReason?: string;
}

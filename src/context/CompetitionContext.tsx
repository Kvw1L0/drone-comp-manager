import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AccreditationRequirement,
  AccreditationStatus,
  AdminException,
  AttemptSnapshot,
  AuditLogEntry,
  CompetitionEvent,
  CompetitionResult,
  EvaluationTest,
  Participant,
  ParticipationStatus,
  PublicParticipant,
  PublicResult,
  RankingViewMode,
  RankingTeamFilter,
  TieBreakerRule,
  Track,
  TrackStatus,
  UserProfile,
  UserRole,
} from '../types/domain';
import {
  DEMO_AUDIT_LOGS,
  DEMO_EVENTS,
  DEMO_PARTICIPANTS,
  DEMO_RESULTS,
  DEMO_TESTS,
  DEMO_TRACKS,
  DEMO_USERS,
  INITIAL_EVENT_ID,
  toPublicParticipant,
  toPublicResult,
} from '../data/seedData';
import {
  calculateResultMetrics,
  getBestEffectiveTimeMs,
  normalizeSearchText,
  recalculateAllResultsForTest,
} from '../utils/scoring';
import { getFirebaseInstances, FirebaseEnvironmentStatus } from '../services/firebase';

const LOCAL_DB_STORAGE_KEY = 'drone_comp_manager_local_db_v5';
const BROADCAST_CHANNEL_NAME = 'drone_comp_realtime_sync_v1';

interface LocalDatabaseState {
  users: UserProfile[];
  events: CompetitionEvent[];
  tracks: Track[];
  tests: EvaluationTest[];
  participants: Participant[];
  results: CompetitionResult[];
  auditLogs: AuditLogEntry[];
  lastUpdatedAt: number;
}

function getInitialLocalDb(): LocalDatabaseState {
  try {
    const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDatabaseState;
      if (parsed && Array.isArray(parsed.events) && parsed.events.length > 0) {
        // Auto-migrate all tests to pure time_calculated if any manual remains
        let hasManual = false;
        if (Array.isArray(parsed.tests)) {
          parsed.tests = parsed.tests.map((t) => {
            if (t.scoringMethod === 'manual') {
              hasManual = true;
              return { ...t, scoringMethod: 'time_calculated' };
            }
            return t;
          });
        }
        if (hasManual && Array.isArray(parsed.results)) {
          const disqualifiedIds = new Set(
            (parsed.participants || []).filter((p) => p.isDisqualified).map((p) => p.id)
          );
          let allUpdated = parsed.results;
          for (const test of parsed.tests) {
            const testResults = allUpdated.filter((r) => r.testId === test.id);
            const remainingResults = allUpdated.filter((r) => r.testId !== test.id);
            const { updatedResults } = recalculateAllResultsForTest(test, testResults, disqualifiedIds);
            allUpdated = [...remainingResults, ...updatedResults];
          }
          parsed.results = allUpdated;
          parsed.lastUpdatedAt = Date.now();
          try {
            localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(parsed));
          } catch {}
        }
        return parsed;
      }
    }
  } catch {
    // Fallback to seed data
  }
  const initial: LocalDatabaseState = {
    users: DEMO_USERS,
    events: DEMO_EVENTS,
    tracks: DEMO_TRACKS,
    tests: DEMO_TESTS,
    participants: DEMO_PARTICIPANTS,
    results: DEMO_RESULTS,
    auditLogs: DEMO_AUDIT_LOGS,
    lastUpdatedAt: 1730006000000,
  };
  try {
    localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(initial));
  } catch {
    // ignore
  }
  return initial;
}

export class ConcurrencyConflictError extends Error {
  public serverResult: CompetitionResult;
  constructor(message: string, serverResult: CompetitionResult) {
    super(message);
    this.name = 'ConcurrencyConflictError';
    this.serverResult = serverResult;
  }
}

export interface SaveResultPayload {
  participantId: string;
  testId: string;
  trackId: string;
  participationStatus: ParticipationStatus;
  targetPublicationStatus: 'borrador' | 'publicado';
  rawScore: number | null;
  pointsPenalty: number;
  registeredTimeMs: number | null;
  secondsPenaltyMs: number;
  observation: string;
  expectedVersion: number; // 0 if new, or existing result.version
  adminExceptionReason?: string;
  isExtraordinaryRepeat?: boolean;
  adminCorrectionReason?: string;
}

interface CompetitionContextValue {
  // Environment & Connectivity
  envStatus: FirebaseEnvironmentStatus;
  isDemoMode: boolean;
  isOnline: boolean;
  simulatedOffline: boolean;
  setSimulatedOffline: (offline: boolean) => void;
  lastSyncTimestamp: number;

  // Auth & Profile
  currentUser: UserProfile | null;
  isPublicScreenMode: boolean;
  setIsPublicScreenMode: (val: boolean) => void;
  loginWithDemoProfile: (uid: string) => void;
  loginWithFirebaseEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;

  // Active Event & Scoped Collections
  events: CompetitionEvent[];
  activeEventId: string;
  activeEvent: CompetitionEvent;
  setActiveEventId: (id: string) => void;
  tracks: Track[];
  tests: EvaluationTest[];

  // Staff/Admin Private Data (Empty when in Public Screen Mode!)
  participants: Participant[];
  results: CompetitionResult[];
  auditLogs: AuditLogEntry[];
  users: UserProfile[];

  // Public-Safe Projections (Used by Giant Public Screen)
  publicParticipants: PublicParticipant[];
  publicResults: PublicResult[];

  // Operational Mutations
  updateAccreditation: (params: {
    participantId: string;
    requirementsChecks: Record<string, boolean>;
    accreditationStatus: AccreditationStatus;
    internalNotes: string;
  }) => Promise<void>;

  updateTrackLiveState: (params: {
    trackId: string;
    status: TrackStatus;
    currentParticipantId: string | null;
    currentTestId: string | null;
  }) => Promise<void>;

  saveOrPublishResult: (payload: SaveResultPayload) => Promise<CompetitionResult>;

  annulPublishedResult: (params: {
    resultId: string;
    reason: string;
    expectedVersion: number;
  }) => Promise<void>;

  // Admin Mutations
  createEvent: (params: {
    name: string;
    date: string;
    primaryColor: string;
    secondaryColor: string;
    logoUrl: string;
  }) => Promise<string>;

  updateEventDetails: (params: {
    eventId: string;
    name: string;
    date: string;
    primaryColor: string;
    secondaryColor: string;
    logoUrl: string;
    status: CompetitionEvent['status'];
    accreditationRequirements: AccreditationRequirement[];
    tieBreakerRules: TieBreakerRule[];
    extraordinaryReason?: string;
  }) => Promise<void>;

  saveTestConfig: (params: {
    test: EvaluationTest;
    extraordinaryReason?: string;
  }) => Promise<void>;

  toggleTestStatus: (params: {
    testId: string;
    status: 'abierta' | 'cerrada';
    reason: string;
  }) => Promise<void>;

  saveTrackConfig: (track: Track) => Promise<void>;

  saveParticipantAdmin: (params: {
    participant: Omit<Participant, 'normalizedName' | 'createdAt' | 'updatedAt'>;
    isNew: boolean;
  }) => Promise<void>;

  importParticipantsBatch: (newParticipants: Participant[]) => Promise<void>;

  setParticipantGeneralDQ: (params: {
    participantId: string;
    isDisqualified: boolean;
    reason: string;
  }) => Promise<void>;

  resolvePersistentTie: (params: {
    tieGroupKey: string;
    orderedParticipantIds: string[];
    reason: string;
  }) => Promise<void>;

  clearTieResolution: (tieGroupKey: string, reason: string) => Promise<void>;

  saveStaffUser: (params: {
    uid?: string;
    email: string;
    displayName: string;
    role: UserRole;
    active: boolean;
  }) => Promise<void>;

  resetDemoDatabase: () => void;
  setEventRankingViewMode: (mode: RankingViewMode) => Promise<void>;
  setEventRankingTeamFilter: (filter: RankingTeamFilter) => Promise<void>;
  toggleTrackResultDQ: (params: { participantId: string; testId: string; trackId?: string }) => Promise<void>;
}

const CompetitionContext = createContext<CompetitionContextValue | null>(null);

export const CompetitionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { auth, db, envStatus } = useMemo(() => getFirebaseInstances(), []);
  const isDemoMode = !envStatus.isConfigured;

  // Connectivity state
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);
  const isOnline = browserOnline && !simulatedOffline;

  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number>(Date.now());

  // Local DB state for Demo mode / Cache
  const [localDb, setLocalDb] = useState<LocalDatabaseState>(() => getInitialLocalDb());
  const [activeEventId, setActiveEventId] = useState<string>(INITIAL_EVENT_ID);

  // Auth & Public Screen Mode
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const savedUid = sessionStorage.getItem('drone_comp_active_user_uid');
      if (savedUid) {
        const found = getInitialLocalDb().users.find((u) => u.uid === savedUid && u.active);
        if (found) return found;
      }
    } catch {
      // ignore
    }
    return DEMO_USERS[0]; // Default to Admin in demo for immediate exploration, switchable with 1 click
  });

  const [isPublicScreenMode, setIsPublicScreenMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('pantalla') === 'publica';
    }
    return false;
  });

  const broadcastRef = useRef<BroadcastChannel | null>(null);

  // Listen to browser online/offline events
  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Multi-tab real-time synchronization for Demo mode
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastRef.current = channel;
      channel.onmessage = (ev) => {
        if (!isOnline) return; // Do not process incoming network messages while offline!
        if (ev.data && ev.data.type === 'DB_UPDATED') {
          try {
            const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as LocalDatabaseState;
              setLocalDb(parsed);
              setLastSyncTimestamp(Date.now());
            }
          } catch {
            // ignore
          }
        }
      };
      return () => {
        channel.close();
      };
    }
  }, [isOnline]);

  // Also sync from storage events across windows when reconnecting
  useEffect(() => {
    if (isOnline && isDemoMode) {
      try {
        const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as LocalDatabaseState;
          setLocalDb(parsed);
          setLastSyncTimestamp(Date.now());
        }
      } catch {
        // ignore
      }
    }
  }, [isOnline, isDemoMode]);

  // Real-time Cloud Sync via Vercel Blob API (/api/state) across all devices
  useEffect(() => {
    if (!isOnline || !isDemoMode) return;
    let isCancelled = false;

    const pullRemoteState = async () => {
      try {
        const res = await fetch(`/api/state?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const remote = data?.state as LocalDatabaseState | null;
        if (isCancelled) return;

        if (remote && Array.isArray(remote.events) && remote.events.length > 0) {
          setLocalDb((prev) => {
            if ((remote.lastUpdatedAt || 0) > (prev.lastUpdatedAt || 0)) {
              try {
                localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(remote));
              } catch {
                // ignore
              }
              setLastSyncTimestamp(Date.now());
              return remote;
            }
            return prev;
          });
        } else {
          // Seed cloud store with initial local state if empty
          try {
            const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
            const current = raw ? JSON.parse(raw) : getInitialLocalDb();
            await fetch('/api/state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ state: current }),
            });
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore network errors in local dev
      }
    };

    // Adaptive polling: 3s when screen is visible/focused, 12s when screen is off/hidden
    let timerId: number | null = null;

    const scheduleNextPull = () => {
      if (isCancelled) return;
      const delay = document.hidden ? 12000 : 3000;
      timerId = window.setTimeout(async () => {
        await pullRemoteState();
        scheduleNextPull();
      }, delay);
    };

    const handleVisibilityOrFocus = () => {
      if (!document.hidden && !isCancelled) {
        if (timerId) window.clearTimeout(timerId);
        pullRemoteState();
        scheduleNextPull();
      }
    };

    pullRemoteState();
    scheduleNextPull();

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      isCancelled = true;
      if (timerId) window.clearTimeout(timerId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isOnline, isDemoMode]);

  // Real Firebase listeners when Firebase is configured
  useEffect(() => {
    if (isDemoMode || !db || !auth) return;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setCurrentUser(null);
        return;
      }
      const userSnap = await getDoc(doc(db, 'users', fbUser.uid));
      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        if (data.active) {
          setCurrentUser(data);
        } else {
          setCurrentUser(null);
        }
      }
    });

    const unsubEvents = onSnapshot(collection(db, 'events'), (snap) => {
      const evts: CompetitionEvent[] = [];
      snap.forEach((d) => evts.push(d.data() as CompetitionEvent));
      if (evts.length > 0) {
        setLocalDb((prev) => ({ ...prev, events: evts }));
        setLastSyncTimestamp(Date.now());
      }
    });

    return () => {
      unsubAuth();
      unsubEvents();
    };
  }, [isDemoMode, db, auth]);

  // Real Firestore subcollection listeners for activeEventId when Firebase is configured
  useEffect(() => {
    if (isDemoMode || !db || !activeEventId) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(collection(db, 'events', activeEventId, 'tracks'), (snap) => {
        const list: Track[] = [];
        snap.forEach((d) => list.push(d.data() as Track));
        setLocalDb((prev) => ({
          ...prev,
          tracks: [...prev.tracks.filter((t) => t.eventId !== activeEventId), ...list],
        }));
        setLastSyncTimestamp(Date.now());
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'events', activeEventId, 'tests'), (snap) => {
        const list: EvaluationTest[] = [];
        snap.forEach((d) => list.push(d.data() as EvaluationTest));
        setLocalDb((prev) => ({
          ...prev,
          tests: [...prev.tests.filter((t) => t.eventId !== activeEventId), ...list],
        }));
        setLastSyncTimestamp(Date.now());
      })
    );

    if (currentUser && !isPublicScreenMode) {
      unsubs.push(
        onSnapshot(collection(db, 'events', activeEventId, 'participants'), (snap) => {
          const list: Participant[] = [];
          snap.forEach((d) => list.push(d.data() as Participant));
          setLocalDb((prev) => ({
            ...prev,
            participants: [
              ...prev.participants.filter((p) => p.eventId !== activeEventId),
              ...list,
            ],
          }));
          setLastSyncTimestamp(Date.now());
        })
      );

      unsubs.push(
        onSnapshot(collection(db, 'events', activeEventId, 'results'), (snap) => {
          const list: CompetitionResult[] = [];
          snap.forEach((d) => list.push(d.data() as CompetitionResult));
          setLocalDb((prev) => ({
            ...prev,
            results: [...prev.results.filter((r) => r.eventId !== activeEventId), ...list],
          }));
          setLastSyncTimestamp(Date.now());
        })
      );

      unsubs.push(
        onSnapshot(collection(db, 'events', activeEventId, 'audit_logs'), (snap) => {
          const list: AuditLogEntry[] = [];
          snap.forEach((d) => list.push(d.data() as AuditLogEntry));
          setLocalDb((prev) => ({
            ...prev,
            auditLogs: [
              ...prev.auditLogs.filter((l) => l.eventId !== activeEventId),
              ...list,
            ],
          }));
        })
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isDemoMode, db, activeEventId, currentUser, isPublicScreenMode]);

  // Helper to commit atomic updates to Local DB (simulating Firestore runTransaction across tabs)
  const runAtomicDbTransaction = useCallback(
    async <T,>(mutator: (draftDb: LocalDatabaseState) => T): Promise<T> => {
      if (!isOnline) {
        throw new Error(
          'Sin conexión con el servidor. Sus cambios siguen guardados en el borrador local, pero no pueden publicarse hasta restablecer la conexión.'
        );
      }

      // Always read latest snapshot from localStorage before applying transaction to detect cross-tab writes!
      let latestState: LocalDatabaseState = localDb;
      try {
        const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
        if (raw) {
          latestState = JSON.parse(raw) as LocalDatabaseState;
        }
      } catch {
        // fallback
      }

      const cloned: LocalDatabaseState = JSON.parse(JSON.stringify(latestState));
      const outcome = mutator(cloned);
      cloned.lastUpdatedAt = Math.max(Date.now(), (latestState.lastUpdatedAt || 0) + 1);

      try {
        localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(cloned));
      } catch {
        // ignore quota errors
      }
      setLocalDb(cloned);
      setLastSyncTimestamp(cloned.lastUpdatedAt);
      if (isDemoMode) {
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: cloned }),
        }).catch(() => {});
      }

      if (broadcastRef.current) {
        broadcastRef.current.postMessage({
          type: 'DB_UPDATED',
          timestamp: cloned.lastUpdatedAt,
        });
      }

      return outcome;
    },
    [isOnline, localDb]
  );

  // Permission Guard Helpers
  const requireStaffOrAdmin = useCallback((): UserProfile => {
    if (isPublicScreenMode || !currentUser || !currentUser.active) {
      throw new Error('Acceso denegado: debe iniciar sesión como personal autorizado (Staff o Administrador).');
    }
    return currentUser;
  }, [currentUser, isPublicScreenMode]);

  const requireAdmin = useCallback((): UserProfile => {
    const u = requireStaffOrAdmin();
    if (u.role !== 'admin') {
      throw new Error('Permiso denegado: esta acción está restringida exclusivamente al perfil Administrador.');
    }
    return u;
  }, [requireStaffOrAdmin]);

  // Auth Actions
  const loginWithDemoProfile = useCallback(
    (uid: string) => {
      const found = localDb.users.find((u) => u.uid === uid);
      if (!found) {
        throw new Error('Usuario no encontrado.');
      }
      if (!found.active) {
        throw new Error('Esta cuenta de usuario se encuentra desactivada por el Administrador.');
      }
      setCurrentUser(found);
      setIsPublicScreenMode(false);
      try {
        sessionStorage.setItem('drone_comp_active_user_uid', found.uid);
      } catch {
        // ignore
      }
    },
    [localDb.users]
  );

  const loginWithFirebaseEmail = useCallback(
    async (email: string, pass: string) => {
      if (!auth) {
        throw new Error('Firebase Auth no está configurado en las variables de entorno.');
      }
      await signInWithEmailAndPassword(auth, email, pass);
      setIsPublicScreenMode(false);
    },
    [auth]
  );

  const logout = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth);
    }
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('drone_comp_active_user_uid');
    } catch {
      // ignore
    }
  }, [auth]);

  // Scoped Data
  const activeEvent = useMemo(() => {
    return (
      localDb.events.find((e) => e.id === activeEventId) ||
      localDb.events[0] ||
      DEMO_EVENTS[0]
    );
  }, [localDb.events, activeEventId]);

  const tracks = useMemo(() => {
    return localDb.tracks
      .filter((t) => t.eventId === activeEvent.id)
      .sort((a, b) => a.order - b.order);
  }, [localDb.tracks, activeEvent.id]);

  const tests = useMemo(() => {
    return localDb.tests
      .filter((t) => t.eventId === activeEvent.id)
      .sort((a, b) => a.order - b.order);
  }, [localDb.tests, activeEvent.id]);

  // Strictly protect private collections when in Public Screen mode or logged out
  const isAuthorizedStaff = Boolean(currentUser && currentUser.active && !isPublicScreenMode);

  const participants = useMemo(() => {
    if (!isAuthorizedStaff) return [];
    return localDb.participants.filter((p) => p.eventId === activeEvent.id);
  }, [localDb.participants, activeEvent.id, isAuthorizedStaff]);

  const results = useMemo(() => {
    if (!isAuthorizedStaff) return [];
    return localDb.results.filter((r) => r.eventId === activeEvent.id);
  }, [localDb.results, activeEvent.id, isAuthorizedStaff]);

  const auditLogs = useMemo(() => {
    if (!isAuthorizedStaff) return [];
    return localDb.auditLogs
      .filter((l) => l.eventId === activeEvent.id)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [localDb.auditLogs, activeEvent.id, isAuthorizedStaff]);

  // Public-Safe Projections (Never expose internalNotes, requirementsChecks, or drafts)
  const publicParticipants = useMemo(() => {
    return localDb.participants
      .filter((p) => p.eventId === activeEvent.id)
      .map(toPublicParticipant);
  }, [localDb.participants, activeEvent.id]);

  const publicResults = useMemo(() => {
    return localDb.results
      .filter((r) => r.eventId === activeEvent.id && r.publicationStatus === 'publicado')
      .map(toPublicResult)
      .filter((r): r is PublicResult => r !== null);
  }, [localDb.results, activeEvent.id]);

  // 1. Update Accreditation
  const updateAccreditation = useCallback(
    async (params: {
      participantId: string;
      requirementsChecks: Record<string, boolean>;
      accreditationStatus: AccreditationStatus;
      internalNotes: string;
    }) => {
      const actor = requireStaffOrAdmin();

      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.participants.findIndex(
          (p) => p.id === params.participantId && p.eventId === activeEvent.id
        );
        if (idx === -1) throw new Error('Participante no encontrado.');

        const prev = { ...dbState.participants[idx] };

        // Validate that required checks are met if setting to 'habilitado'
        if (params.accreditationStatus === 'habilitado') {
          const missingReqs = activeEvent.accreditationRequirements.filter(
            (req) => req.required && !params.requirementsChecks[req.id]
          );
          if (missingReqs.length > 0) {
            throw new Error(
              `No se puede habilitar al participante: faltan requisitos obligatorios (${missingReqs
                .map((r) => r.label)
                .join(', ')}).`
            );
          }
        }

        const updated: Participant = {
          ...prev,
          requirementsChecks: params.requirementsChecks,
          accreditationStatus: params.accreditationStatus,
          internalNotes: params.internalNotes,
          updatedAt: Date.now(),
        };

        dbState.participants[idx] = updated;

        if (Boolean(0) && 'isDisqualified' in params) {
          dbState.results = dbState.results.map((r) => {
            if (
              r.eventId === activeEvent.id &&
              r.participantId === params.participantId &&
              r.participationStatus === 'dq'
            ) {
              return {
                ...r,
                participationStatus: 'dnf',
                updatedAt: Date.now(),
              };
            }
            return r;
          });
        }
        dbState.auditLogs.push({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          eventId: activeEvent.id,
          entityType: 'participant',
          entityId: updated.id,
          action: `Actualización de acreditación de ${updated.fullName} (${updated.competitorNumber}) a "${updated.accreditationStatus.toUpperCase()}"`,
          actorUid: actor.uid,
          actorName: actor.displayName,
          actorRole: actor.role,
          reason: 'Validación manual de requisitos de acreditación',
          previousValue: {
            accreditationStatus: prev.accreditationStatus,
            requirementsChecks: prev.requirementsChecks,
          },
          newValue: {
            accreditationStatus: updated.accreditationStatus,
            requirementsChecks: updated.requirementsChecks,
          },
          timestamp: Date.now(),
        });
      });

      if (!isDemoMode && db) {
        const pRef = doc(db, 'events', activeEvent.id, 'participants', params.participantId);
        const pubRef = doc(
          db,
          'events',
          activeEvent.id,
          'public_participants',
          params.participantId
        );
        const batch = writeBatch(db);
        batch.update(pRef, {
          requirementsChecks: params.requirementsChecks,
          accreditationStatus: params.accreditationStatus,
          internalNotes: params.internalNotes,
          updatedAt: Date.now(),
        });
        batch.set(
          pubRef,
          {
            accreditationStatus: params.accreditationStatus,
          },
          { merge: true }
        );
        await batch.commit();
      }
    },
    [requireStaffOrAdmin, runAtomicDbTransaction, activeEvent, isDemoMode, db]
  );

  // 2. Update Track Live State
  const updateTrackLiveState = useCallback(
    async (params: {
      trackId: string;
      status: TrackStatus;
      currentParticipantId: string | null;
      currentTestId: string | null;
    }) => {
      requireStaffOrAdmin();
      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.tracks.findIndex(
          (t) => t.id === params.trackId && t.eventId === activeEvent.id
        );
        if (idx === -1) throw new Error('Pista no encontrada.');
        dbState.tracks[idx] = {
          ...dbState.tracks[idx],
          status: params.status,
          currentParticipantId: params.currentParticipantId,
          currentTestId: params.currentTestId,
        };
      });

      if (!isDemoMode && db) {
        await setDoc(
          doc(db, 'events', activeEvent.id, 'tracks', params.trackId),
          {
            status: params.status,
            currentParticipantId: params.currentParticipantId,
            currentTestId: params.currentTestId,
          },
          { merge: true }
        );
      }
    },
    [requireStaffOrAdmin, runAtomicDbTransaction, activeEvent.id, isDemoMode, db]
  );

  // 3. Save or Publish Result (Core transactional engine with concurrency & recalculation)
  const saveOrPublishResult = useCallback(
    async (payload: SaveResultPayload): Promise<CompetitionResult> => {
      const actor = requireStaffOrAdmin();

      const savedResult = await runAtomicDbTransaction((dbState) => {
        const evt = dbState.events.find((e) => e.id === activeEvent.id);
        if (!evt) throw new Error('Evento no encontrado.');
        if (evt.status === 'finalizado' && actor.role !== 'admin') {
          throw new Error('El evento está finalizado. Solo un Administrador puede realizar modificaciones.');
        }

        const test = dbState.tests.find(
          (t) => t.id === payload.testId && t.eventId === activeEvent.id
        );
        if (!test) throw new Error('Prueba no encontrada.');
        if (test.status === 'cerrada' && actor.role !== 'admin') {
          throw new Error(
            `La prueba "${test.name}" se encuentra cerrada. Solicite su reapertura a un Administrador.`
          );
        }

        const track = dbState.tracks.find(
          (tr) => tr.id === payload.trackId && tr.eventId === activeEvent.id
        );
        if (!track) throw new Error('Pista no encontrada.');
        if (!test.assignedTrackIds.includes(track.id)) {
          throw new Error(
            `La prueba "${test.name}" no está asignada a la pista "${track.name}".`
          );
        }

        const participant = dbState.participants.find(
          (p) => p.id === payload.participantId && p.eventId === activeEvent.id
        );
        if (!participant) throw new Error('Participante no encontrado.');

        const resultId = `${payload.participantId}__${payload.testId}`;
        const existingIdx = dbState.results.findIndex(
          (r) => r.id === resultId && r.eventId === activeEvent.id
        );
        const existingResult = existingIdx !== -1 ? dbState.results[existingIdx] : null;

        // OPTIMISTIC CONCURRENCY CHECK:
        const currentServerVersion = existingResult ? existingResult.version : 0;
        if (currentServerVersion !== payload.expectedVersion && existingResult && actor.role !== 'admin') {
          throw new ConcurrencyConflictError(
            `¡Conflicto de concurrencia detectado! Otro operador (${existingResult.updatedByName}) modificó o publicó este resultado mientras usted lo editaba (Versión actual: v${existingResult.version}, su versión base: v${payload.expectedVersion}). Revise el estado actual antes de continuar.`,
            existingResult
          );
        }

        // PERMISSION & DUPLICATE OFFICIAL RESULT PROTECTION:
        if (existingResult && existingResult.publicationStatus === 'publicado') {
          if (actor.role !== 'admin') {
            throw new Error(
              `Ya existe un resultado oficial publicado para ${participant.fullName} en ${test.name}. El perfil Staff no puede sobrescribir resultados publicados. Solicite una corrección o repetición extraordinaria a un Administrador.`
            );
          }
          if (
            !payload.isExtraordinaryRepeat &&
            actor.role !== 'admin' && !payload.adminCorrectionReason?.trim()
          ) {
            throw new Error(
              'Para corregir o repetir un resultado ya publicado, el Administrador debe indicar el motivo obligatorio.'
            );
          }
        }

        // UNACCREDITED PARTICIPANT CHECK:
        let adminException: AdminException | null = null;
        if (
          Boolean(0) &&
          payload.targetPublicationStatus === 'publicado' &&
          participant.accreditationStatus === 'rechazado'
        ) {
          if (actor.role !== 'admin' || !payload.adminExceptionReason?.trim()) {
            throw new Error(
              `El participante ${participant.fullName} no está habilitado (estado: ${participant.accreditationStatus}). No se permite publicar resultados salvo una excepción autorizada por un Administrador con motivo justificado.`
            );
          }
          adminException = {
            authorized: true,
            type: 'unaccredited_participant',
            reason: payload.adminExceptionReason.trim(),
            authorizedBy: actor.uid,
            authorizedByName: actor.displayName,
            authorizedAt: Date.now(),
          };
        }

        // Disqualified participant IDs for reference best time calculation
        const disqualifiedIds = new Set(
          dbState.participants
            .filter((p) => p.eventId === activeEvent.id && p.isDisqualified)
            .map((p) => p.id)
        );

        const otherTestResults = dbState.results.filter(
          (r) =>
            r.eventId === activeEvent.id &&
            r.testId === test.id &&
            r.id !== resultId
        );

        const currentBestOtherMs = getBestEffectiveTimeMs(
          test.id,
          otherTestResults,
          disqualifiedIds
        );

        const calc = calculateResultMetrics({
          test,
          participationStatus: payload.participationStatus,
          rawScore: test.scoringMethod === 'manual' ? payload.rawScore : null,
          pointsPenalty: payload.pointsPenalty,
          registeredTimeMs: payload.registeredTimeMs,
          secondsPenaltyMs: test.enableSecondsPenalty ? payload.secondsPenaltyMs : 0,
          bestEffectiveTimeMsForTest: currentBestOtherMs,
          includeCandidateInBestTime:
            true &&
          payload.targetPublicationStatus === 'publicado' &&
            payload.participationStatus === 'completado' &&
            !participant.isDisqualified,
        });

        if (calc.validationErrors.length > 0) {
          throw new Error(calc.validationErrors.join(' '));
        }

        // TIME LIMIT CHECK (300s evaluated on registeredTimeMs BEFORE secondsPenaltyMs):
        if (
          payload.participationStatus === 'completado' &&
          calc.exceedsTimeLimit
        ) {
          if (actor.role !== 'admin' || !payload.adminExceptionReason?.trim()) {
            throw new Error(
              `El tiempo registrado supera el límite máximo de ${(
                test.timeLimitMs / 1000
              ).toFixed(
                0
              )} segundos. Debe registrar el estado como DNF o contar con una excepción administrativa justificada con motivo.`
            );
          }
          adminException = {
            authorized: true,
            type: 'time_limit_exceeded',
            reason: payload.adminExceptionReason.trim(),
            authorizedBy: actor.uid,
            authorizedByName: actor.displayName,
            authorizedAt: Date.now(),
          };
        }

        // Archive previous attempt if this is an extraordinary repeat or correction of published result
        const previousAttempts: AttemptSnapshot[] = existingResult
          ? [...(existingResult.previousAttempts || [])]
          : [];
        let attemptNumber = existingResult ? existingResult.attemptNumber : 1;

        if (existingResult && existingResult.publicationStatus === 'publicado') {
          const archiveReason =
            payload.isExtraordinaryRepeat
              ? payload.adminCorrectionReason || payload.adminExceptionReason || 'Repetición extraordinaria autorizada'
              : payload.adminCorrectionReason || 'Corrección administrativa de resultado publicado';

          previousAttempts.push({
            attemptNumber: existingResult.attemptNumber,
            trackId: existingResult.trackId,
            participationStatus: existingResult.participationStatus,
            publicationStatus: existingResult.publicationStatus,
            rawScore: existingResult.rawScore,
            pointsPenalty: existingResult.pointsPenalty,
            registeredTimeMs: existingResult.registeredTimeMs,
            secondsPenaltyMs: existingResult.secondsPenaltyMs,
            effectiveTimeMs: existingResult.effectiveTimeMs,
            calculatedBaseScore: existingResult.calculatedBaseScore,
            netScore: existingResult.netScore,
            contribution: existingResult.contribution,
            observation: existingResult.observation,
            adminException: existingResult.adminException,
            createdBy: existingResult.updatedBy,
            createdByName: existingResult.updatedByName,
            publishedAt: existingResult.publishedAt,
            archivedAt: Date.now(),
            archivedReason: archiveReason,
          });

          if (payload.isExtraordinaryRepeat) {
            attemptNumber += 1;
            adminException = {
              authorized: true,
              type: 'extraordinary_repeat',
              reason: archiveReason,
              authorizedBy: actor.uid,
              authorizedByName: actor.displayName,
              authorizedAt: Date.now(),
            };
          } else if (!adminException) {
            adminException = {
              authorized: true,
              type: 'admin_correction',
              reason: archiveReason,
              authorizedBy: actor.uid,
              authorizedByName: actor.displayName,
              authorizedAt: Date.now(),
            };
          }
        }

        const now = Date.now();
        const newVersion = currentServerVersion + 1;

        const newResult: CompetitionResult = {
          id: resultId,
          eventId: activeEvent.id,
          participantId: participant.id,
          testId: test.id,
          trackId: track.id,
          attemptNumber,
          participationStatus: payload.participationStatus,
          publicationStatus: payload.targetPublicationStatus,
          rawScore: test.scoringMethod === 'manual' ? payload.rawScore : null,
          pointsPenalty: payload.pointsPenalty,
          registeredTimeMs: payload.registeredTimeMs,
          secondsPenaltyMs: test.enableSecondsPenalty ? payload.secondsPenaltyMs : 0,
          effectiveTimeMs: calc.effectiveTimeMs,
          calculatedBaseScore: calc.calculatedBaseScore,
          netScore: calc.netScore,
          contribution: calc.contribution,
          observation: payload.observation.trim(),
          adminException,
          previousAttempts,
          version: newVersion,
          configVersionUsed: evt.configVersion,
          createdBy: existingResult ? existingResult.createdBy : actor.uid,
          createdByName: existingResult ? existingResult.createdByName : actor.displayName,
          updatedBy: actor.uid,
          updatedByName: actor.displayName,
          publishedAt:
            payload.targetPublicationStatus === 'publicado'
              ? now
              : existingResult?.publishedAt ?? null,
          updatedAt: now,
        };

        if (existingIdx !== -1) {
          dbState.results[existingIdx] = newResult;
        } else {
          dbState.results.push(newResult);
        }

        // If this test is time_calculated, recalculate ALL results of this test in the event
        // so any change in best effective time immediately updates all affected contributions!
        if (
          Boolean(0) &&
          payload.targetPublicationStatus === 'publicado' &&
          payload.participationStatus === 'dq'
        ) {
          const pIdx = dbState.participants.findIndex(
            (p) => p.id === participant.id && p.eventId === activeEvent.id
          );
          if (pIdx !== -1) {
            dbState.participants[pIdx] = {
              ...dbState.participants[pIdx],
              isDisqualified: true,
              disqualificationReason:
                payload.observation.trim() ||
                payload.adminCorrectionReason?.trim() ||
                `Descalificado (DQ) en ${test.name}`,
              disqualifiedBy: actor.uid,
              disqualifiedByName: actor.displayName,
              disqualifiedAt: now,
              updatedAt: now,
            };
          }
          disqualifiedIds.add(participant.id);
        }

        // Recalculate ALL time_calculated tests in the event so any score or DQ change updates rankings!
        const allTimeTests = dbState.tests.filter(
          (t) => t.eventId === activeEvent.id && t.scoringMethod === 'time_calculated'
        );
        for (const t of allTimeTests) {
          const allForTest = dbState.results.filter(
            (r) => r.eventId === activeEvent.id && r.testId === t.id
          );
          const { updatedResults } = recalculateAllResultsForTest(
            t,
            allForTest,
            disqualifiedIds
          );
          const updatedMap = new Map(updatedResults.map((ur) => [ur.id, ur]));
          dbState.results = dbState.results.map((r) => updatedMap.get(r.id) || r);
        }

        if (test && test.scoringMethod === 'time_calculated') {
          const allForTest = dbState.results.filter(
            (r) => r.eventId === activeEvent.id && r.testId === test.id
          );
          const { updatedResults } = recalculateAllResultsForTest(
            test,
            allForTest,
            disqualifiedIds
          );
          const updatedMap = new Map(updatedResults.map((ur) => [ur.id, ur]));
          dbState.results = dbState.results.map((r) => updatedMap.get(r.id) || r);
        }

        const finalSaved =
          dbState.results.find((r) => r.id === resultId && r.eventId === activeEvent.id) ||
          newResult;

        // Audit Log Entry
        const actionDesc =
          payload.targetPublicationStatus === 'borrador'
            ? `Guardado de borrador para ${participant.fullName} en ${test.name} (${track.name})`
            : existingResult?.publicationStatus === 'publicado'
            ? payload.isExtraordinaryRepeat
              ? `Repetición extraordinaria (Intento #${attemptNumber}) publicada para ${participant.fullName} en ${test.name}`
              : `Corrección administrativa de resultado publicado para ${participant.fullName} en ${test.name}`
            : `Publicación oficial de resultado para ${participant.fullName} en ${test.name} (${track.name})`;

        dbState.auditLogs.push({
          id: `log-${now}-${Math.random().toString(36).slice(2, 7)}`,
          eventId: activeEvent.id,
          entityType: 'result',
          entityId: resultId,
          action: actionDesc,
          actorUid: actor.uid,
          actorName: actor.displayName,
          actorRole: actor.role,
          reason:
            adminException?.reason ||
            payload.adminCorrectionReason ||
            payload.observation ||
            'Registro operativo de prueba',
          previousValue: existingResult
            ? {
                version: existingResult.version,
                participationStatus: existingResult.participationStatus,
                publicationStatus: existingResult.publicationStatus,
                rawScore: existingResult.rawScore,
                pointsPenalty: existingResult.pointsPenalty,
                registeredTimeMs: existingResult.registeredTimeMs,
                secondsPenaltyMs: existingResult.secondsPenaltyMs,
                contribution: existingResult.contribution,
              }
            : null,
          newValue: {
            version: finalSaved.version,
            attemptNumber: finalSaved.attemptNumber,
            participationStatus: finalSaved.participationStatus,
            publicationStatus: finalSaved.publicationStatus,
            rawScore: finalSaved.rawScore,
            pointsPenalty: finalSaved.pointsPenalty,
            registeredTimeMs: finalSaved.registeredTimeMs,
            secondsPenaltyMs: finalSaved.secondsPenaltyMs,
            contribution: finalSaved.contribution,
          },
          timestamp: now,
        });

        return finalSaved;
      });

      // If connected to real Cloud Firestore, also execute Firestore transaction
      if (!isDemoMode && db) {
        const resRef = doc(db, 'events', activeEvent.id, 'results', savedResult.id);
        const pubResRef = doc(
          db,
          'events',
          activeEvent.id,
          'public_results',
          savedResult.id
        );
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(resRef);
          const serverVer = snap.exists() ? (snap.data().version as number) : 0;
          if (serverVer !== payload.expectedVersion) {
            throw new ConcurrencyConflictError(
              'Conflicto de concurrencia en Firestore: el documento fue modificado por otro operador.',
              snap.data() as CompetitionResult
            );
          }
          tx.set(resRef, savedResult);
          const pubProj = toPublicResult(savedResult);
          if (pubProj) {
            tx.set(pubResRef, pubProj);
          }
        });
      }

      return savedResult;
    },
    [requireStaffOrAdmin, runAtomicDbTransaction, activeEvent.id, isDemoMode, db]
  );

  // 4. Annul Published Result (Admin Only)
  const annulPublishedResult = useCallback(
    async (params: {
      resultId: string;
      reason: string;
      expectedVersion: number;
    }) => {
      const admin = requireAdmin();
      if (false && !params.reason.trim()) {
        throw new Error('Debe indicar un motivo obligatorio para anular un resultado publicado.');
      }

      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.results.findIndex(
          (r) => r.id === params.resultId && r.eventId === activeEvent.id
        );
        if (idx === -1) throw new Error('Resultado no encontrado.');
        const existing = dbState.results[idx];

        if (existing.version !== params.expectedVersion) {
          throw new ConcurrencyConflictError(
            'El resultado fue modificado por otro operador antes de anularlo.',
            existing
          );
        }

        const participant = dbState.participants.find(
          (p) => p.id === existing.participantId && p.eventId === activeEvent.id
        );
        const test = dbState.tests.find(
          (t) => t.id === existing.testId && t.eventId === activeEvent.id
        );

        const now = Date.now();
        const annulled: CompetitionResult = {
          ...existing,
          publicationStatus: 'anulado',
          calculatedBaseScore: 0,
          netScore: 0,
          contribution: 0,
          version: existing.version + 1,
          updatedBy: admin.uid,
          updatedByName: admin.displayName,
          updatedAt: now,
        };

        dbState.results[idx] = annulled;

        // If the annulled result belonged to a time_calculated test, recalculate all remaining results!
        if (test && test.scoringMethod === 'time_calculated') {
          const disqualifiedIds = new Set(
            dbState.participants
              .filter((p) => p.eventId === activeEvent.id && p.isDisqualified)
              .map((p) => p.id)
          );
          const allForTest = dbState.results.filter(
            (r) => r.eventId === activeEvent.id && r.testId === test.id
          );
          const { updatedResults } = recalculateAllResultsForTest(
            test,
            allForTest,
            disqualifiedIds
          );
          const updatedMap = new Map(updatedResults.map((ur) => [ur.id, ur]));
          dbState.results = dbState.results.map((r) => updatedMap.get(r.id) || r);
        }

        dbState.auditLogs.push({
          id: `log-${now}-${Math.random().toString(36).slice(2, 7)}`,
          eventId: activeEvent.id,
          entityType: 'result',
          entityId: existing.id,
          action: `Anulación de resultado de ${participant?.fullName || existing.participantId} en ${
            test?.name || existing.testId
          }`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: params.reason.trim(),
          previousValue: {
            publicationStatus: existing.publicationStatus,
            participationStatus: existing.participationStatus,
            effectiveTimeMs: existing.effectiveTimeMs,
            contribution: existing.contribution,
          },
          newValue: {
            publicationStatus: 'anulado',
            contribution: 0,
          },
          timestamp: now,
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  // 5. Create Event (Admin Only)
  const createEvent = useCallback(
    async (params: {
      name: string;
      date: string;
      primaryColor: string;
      secondaryColor: string;
      logoUrl: string;
    }): Promise<string> => {
      const admin = requireAdmin();
      const newEventId = `evt-${Date.now()}`;

      await runAtomicDbTransaction((dbState) => {
        const now = Date.now();
        const newEvent: CompetitionEvent = {
          id: newEventId,
          name: params.name.trim(),
          date: params.date,
          logoUrl: params.logoUrl.trim(),
          primaryColor: params.primaryColor || '#0284c7',
          secondaryColor: params.secondaryColor || '#f59e0b',
          status: 'preparacion',
          configVersion: 1,
          accreditationRequirements: [
            { id: 'licencia_vigente', label: 'Licencia vigente verificada por el staff', required: true },
            { id: 'pertenencia_institucional', label: 'Pertenencia institucional verificada', required: true },
            { id: 'asistencia_briefing', label: 'Asistencia al briefing', required: true },
            { id: 'inspeccion_tecnica', label: 'Inspección técnica aprobada', required: true },
          ],
          tieBreakerRules: [
            { id: 'tb-1', type: 'total_score', direction: 'desc', label: '1. Mayor puntaje total' },
            {
              id: 'tb-2',
              type: 'test_contribution',
              testId: `${newEventId}_test_habilidades`,
              direction: 'desc',
              label: '2. Mayor aporte en Habilidades y Obstáculos',
            },
            {
              id: 'tb-3',
              type: 'test_contribution',
              testId: `${newEventId}_test_destreza`,
              direction: 'desc',
              label: '3. Mayor aporte en Destreza',
            },
            {
              id: 'tb-4',
              type: 'test_effective_time',
              testId: `${newEventId}_test_velocidad`,
              direction: 'asc',
              label: '4. Menor tiempo efectivo válido en Velocidad',
            },
          ],
          resolvedTies: {},
          createdAt: now,
          updatedAt: now,
        };

        const newTracks: Track[] = [1, 2, 3, 4].map((num) => ({
          id: `${newEventId}_track_${num}`,
          eventId: newEventId,
          name: `Pista ${num}`,
          status: 'operativa',
          assignedTestIds: [
            `${newEventId}_test_velocidad`,
            `${newEventId}_test_habilidades`,
            `${newEventId}_test_destreza`,
          ],
          currentParticipantId: null,
          currentTestId: null,
          order: num,
        }));

        const allTrackIds = newTracks.map((t) => t.id);

        const newTests: EvaluationTest[] = [
          {
            id: `${newEventId}_test_velocidad`,
            eventId: newEventId,
            name: 'Velocidad',
            scoringMethod: 'time_calculated',
            maxBaseScore: 100,
            maxContribution: 33.33,
            timeLimitMs: 300000,
            enableSecondsPenalty: true,
            officialAttemptsCount: 1,
            attemptSelectionRule: 'best_score',
            assignedTrackIds: allTrackIds,
            status: 'abierta',
            order: 1,
          },
          {
            id: `${newEventId}_test_habilidades`,
            eventId: newEventId,
            name: 'Habilidades y Obstáculos',
            scoringMethod: 'time_calculated',
            maxBaseScore: 100,
            maxContribution: 33.33,
            timeLimitMs: 300000,
            enableSecondsPenalty: true,
            officialAttemptsCount: 1,
            attemptSelectionRule: 'best_score',
            assignedTrackIds: allTrackIds,
            status: 'abierta',
            order: 2,
          },
          {
            id: `${newEventId}_test_destreza`,
            eventId: newEventId,
            name: 'Destreza',
            scoringMethod: 'time_calculated',
            maxBaseScore: 100,
            maxContribution: 33.34,
            timeLimitMs: 300000,
            enableSecondsPenalty: true,
            officialAttemptsCount: 1,
            attemptSelectionRule: 'best_score',
            assignedTrackIds: allTrackIds,
            status: 'abierta',
            order: 3,
          },
        ];

        dbState.events.push(newEvent);
        dbState.tracks.push(...newTracks);
        dbState.tests.push(...newTests);
        dbState.auditLogs.push({
          id: `log-${now}`,
          eventId: newEventId,
          entityType: 'event',
          entityId: newEventId,
          action: `Creación de nuevo evento "${newEvent.name}" con 4 pistas y 3 pruebas iniciales`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: 'Creación administrativa de evento',
          previousValue: null,
          newValue: newEvent,
          timestamp: now,
        });
      });

      setActiveEventId(newEventId);
      return newEventId;
    },
    [requireAdmin, runAtomicDbTransaction]
  );

  // 6. Update Event Details & Rules (Admin Only, enforces rule lock if published results exist)
  const updateEventDetails = useCallback(
    async (params: {
      eventId: string;
      name: string;
      date: string;
      primaryColor: string;
      secondaryColor: string;
      logoUrl: string;
      status: CompetitionEvent['status'];
      accreditationRequirements: AccreditationRequirement[];
      tieBreakerRules: TieBreakerRule[];
      extraordinaryReason?: string;
    }) => {
      const admin = requireAdmin();

      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.events.findIndex((e) => e.id === params.eventId);
        if (idx === -1) throw new Error('Evento no encontrado.');
        const prev = dbState.events[idx];

        const hasPublishedResults = dbState.results.some(
          (r) => r.eventId === params.eventId && r.publicationStatus === 'publicado'
        );

        const rulesChanged =
          JSON.stringify(prev.tieBreakerRules) !== JSON.stringify(params.tieBreakerRules) ||
          JSON.stringify(prev.accreditationRequirements) !==
            JSON.stringify(params.accreditationRequirements);

        if (hasPublishedResults && rulesChanged && !params.extraordinaryReason?.trim()) {
          throw new Error(
            'Ya existen resultados publicados en este evento. Para realizar una modificación extraordinaria de reglas debe ingresar un motivo justificado para generar una nueva versión de configuración.'
          );
        }

        const nextConfigVersion =
          hasPublishedResults && rulesChanged ? prev.configVersion + 1 : prev.configVersion;

        const updated: CompetitionEvent = {
          ...prev,
          name: params.name.trim(),
          date: params.date,
          primaryColor: params.primaryColor,
          secondaryColor: params.secondaryColor,
          logoUrl: params.logoUrl.trim(),
          status: params.status,
          accreditationRequirements: params.accreditationRequirements,
          tieBreakerRules: params.tieBreakerRules,
          configVersion: nextConfigVersion,
          updatedAt: Date.now(),
        };

        dbState.events[idx] = updated;
        dbState.auditLogs.push({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: params.eventId,
          entityType: 'event',
          entityId: params.eventId,
          action:
            nextConfigVersion > prev.configVersion
              ? `Modificación extraordinaria de configuración del evento (v${prev.configVersion} -> v${nextConfigVersion})`
              : `Actualización de datos/estado del evento "${updated.name}" (${updated.status})`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason:
            params.extraordinaryReason?.trim() || 'Actualización administrativa del evento',
          previousValue: {
            status: prev.status,
            configVersion: prev.configVersion,
            tieBreakerRules: prev.tieBreakerRules,
          },
          newValue: {
            status: updated.status,
            configVersion: updated.configVersion,
            tieBreakerRules: updated.tieBreakerRules,
          },
          timestamp: Date.now(),
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction]
  );

  // 7. Save Test Config (Admin Only, blocks rule edits when published results exist unless extraordinary reason given + controlled recalculation)
  const saveTestConfig = useCallback(
    async (params: { test: EvaluationTest; extraordinaryReason?: string }) => {
      const admin = requireAdmin();

      await runAtomicDbTransaction((dbState) => {
        const evtIdx = dbState.events.findIndex((e) => e.id === params.test.eventId);
        if (evtIdx === -1) throw new Error('Evento no encontrado.');
        const evt = dbState.events[evtIdx];

        const existingIdx = dbState.tests.findIndex(
          (t) => t.id === params.test.id && t.eventId === params.test.eventId
        );
        const existing = existingIdx !== -1 ? dbState.tests[existingIdx] : null;

        const hasPublishedResults = dbState.results.some(
          (r) => r.eventId === params.test.eventId && r.publicationStatus === 'publicado'
        );

        const scoringRulesChanged =
          existing &&
          (existing.scoringMethod !== params.test.scoringMethod ||
            existing.maxBaseScore !== params.test.maxBaseScore ||
            existing.maxContribution !== params.test.maxContribution ||
            existing.timeLimitMs !== params.test.timeLimitMs ||
            existing.enableSecondsPenalty !== params.test.enableSecondsPenalty);

        if (hasPublishedResults && scoringRulesChanged && !params.extraordinaryReason?.trim()) {
          throw new Error(
            `Bloqueo de seguridad: ya existen resultados publicados. Para realizar una modificación extraordinaria de las reglas de "${params.test.name}", debe ingresar un motivo obligatorio para incrementar la versión de configuración y ejecutar el recálculo controlado.`
          );
        }

        if (existingIdx !== -1) {
          dbState.tests[existingIdx] = params.test;
        } else {
          dbState.tests.push(params.test);
        }

        // Sync track assignments bidirectionally
        dbState.tracks = dbState.tracks.map((tr) => {
          if (tr.eventId !== params.test.eventId) return tr;
          const shouldHave = params.test.assignedTrackIds.includes(tr.id);
          const currentlyHas = tr.assignedTestIds.includes(params.test.id);
          if (shouldHave && !currentlyHas) {
            return { ...tr, assignedTestIds: [...tr.assignedTestIds, params.test.id] };
          }
          if (!shouldHave && currentlyHas) {
            return {
              ...tr,
              assignedTestIds: tr.assignedTestIds.filter((id) => id !== params.test.id),
            };
          }
          return tr;
        });

        let newConfigVersion = evt.configVersion;
        if (hasPublishedResults && scoringRulesChanged) {
          newConfigVersion = evt.configVersion + 1;
          dbState.events[evtIdx] = {
            ...evt,
            configVersion: newConfigVersion,
            updatedAt: Date.now(),
          };

          // Controlled recalculation of all results for this test!
          const disqualifiedIds = new Set(
            dbState.participants
              .filter((p) => p.eventId === evt.id && p.isDisqualified)
              .map((p) => p.id)
          );
          const allForTest = dbState.results.filter(
            (r) => r.eventId === evt.id && r.testId === params.test.id
          );
          const { updatedResults } = recalculateAllResultsForTest(
            params.test,
            allForTest,
            disqualifiedIds
          );
          const updatedMap = new Map(
            updatedResults.map((ur) => [
              ur.id,
              { ...ur, configVersionUsed: newConfigVersion },
            ])
          );
          dbState.results = dbState.results.map((r) => updatedMap.get(r.id) || r);
        }

        dbState.auditLogs.push({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: evt.id,
          entityType: 'test',
          entityId: params.test.id,
          action:
            newConfigVersion > evt.configVersion
              ? `Modificación extraordinaria de reglas en prueba "${params.test.name}" (Config v${newConfigVersion}) con recálculo controlado`
              : `Configuración de prueba "${params.test.name}" actualizada`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason:
            params.extraordinaryReason?.trim() || 'Configuración administrativa de prueba',
          previousValue: existing,
          newValue: params.test,
          timestamp: Date.now(),
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction]
  );

  // 8. Toggle Test Status (Open / Close Test)
  const toggleTestStatus = useCallback(
    async (params: { testId: string; status: 'abierta' | 'cerrada'; reason: string }) => {
      const admin = requireAdmin();
      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.tests.findIndex(
          (t) => t.id === params.testId && t.eventId === activeEvent.id
        );
        if (idx === -1) throw new Error('Prueba no encontrada.');
        const prev = dbState.tests[idx];
        dbState.tests[idx] = { ...prev, status: params.status };

        dbState.auditLogs.push({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: activeEvent.id,
          entityType: 'test',
          entityId: prev.id,
          action: `${
            params.status === 'cerrada' ? 'Cierre oficial' : 'Reapertura'
          } de la prueba "${prev.name}"`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: params.reason.trim() || `Cambio de estado a ${params.status}`,
          previousValue: { status: prev.status },
          newValue: { status: params.status },
          timestamp: Date.now(),
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  // 9. Save Track Config (Admin Only)
  const saveTrackConfig = useCallback(
    async (track: Track) => {
      const admin = requireAdmin();
      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.tracks.findIndex(
          (t) => t.id === track.id && t.eventId === track.eventId
        );
        const prev = idx !== -1 ? dbState.tracks[idx] : null;
        if (idx !== -1) {
          dbState.tracks[idx] = track;
        } else {
          dbState.tracks.push(track);
        }

        // Sync test assignedTrackIds bidirectionally
        dbState.tests = dbState.tests.map((test) => {
          if (test.eventId !== track.eventId) return test;
          const shouldHave = track.assignedTestIds.includes(test.id);
          const currentlyHas = test.assignedTrackIds.includes(track.id);
          if (shouldHave && !currentlyHas) {
            return { ...test, assignedTrackIds: [...test.assignedTrackIds, track.id] };
          }
          if (!shouldHave && currentlyHas) {
            return {
              ...test,
              assignedTrackIds: test.assignedTrackIds.filter((id) => id !== track.id),
            };
          }
          return test;
        });

        dbState.auditLogs.push({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: track.eventId,
          entityType: 'track',
          entityId: track.id,
          action: `Configuración de pista "${track.name}" actualizada`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: 'Configuración administrativa de pistas',
          previousValue: prev,
          newValue: track,
          timestamp: Date.now(),
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction]
  );

  // 10. Save / Edit Participant (Admin Only)
  const saveParticipantAdmin = useCallback(
    async (params: {
      participant: Omit<Participant, 'normalizedName' | 'createdAt' | 'updatedAt'>;
      isNew: boolean;
    }) => {
      const admin = requireAdmin();
      await runAtomicDbTransaction((dbState) => {
        const now = Date.now();
        const existingIdx = dbState.participants.findIndex(
          (p) =>
            p.id.toUpperCase() === params.participant.id.toUpperCase() &&
            p.eventId === activeEvent.id
        );

        if (params.isNew && existingIdx !== -1) {
          throw new Error(
            `El identificador interno "${params.participant.id}" ya existe en este evento.`
          );
        }

        const fullRecord: Participant = {
          ...params.participant,
          normalizedName: normalizeSearchText(params.participant.fullName),
          createdAt: existingIdx !== -1 ? dbState.participants[existingIdx].createdAt : now,
          updatedAt: now,
        };

        if (existingIdx !== -1) {
          dbState.participants[existingIdx] = fullRecord;
        } else {
          dbState.participants.push(fullRecord);
        }

        dbState.auditLogs.push({
          id: `log-${now}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: activeEvent.id,
          entityType: 'participant',
          entityId: fullRecord.id,
          action: `${params.isNew ? 'Creación' : 'Edición'} de participante ${fullRecord.fullName} (${
            fullRecord.competitorNumber || fullRecord.id
          })`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: 'Gestión de nómina de participantes',
          previousValue: existingIdx !== -1 ? dbState.participants[existingIdx] : null,
          newValue: fullRecord,
          timestamp: now,
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  // 11. Batch Import Participants from CSV (Admin Only)
  const importParticipantsBatch = useCallback(
    async (newParticipants: Participant[]) => {
      const admin = requireAdmin();
      if (newParticipants.length === 0) return;

      await runAtomicDbTransaction((dbState) => {
        const now = Date.now();
        dbState.participants.push(...newParticipants);
        dbState.auditLogs.push({
          id: `log-${now}`,
          eventId: activeEvent.id,
          entityType: 'participant',
          entityId: 'CSV_IMPORT',
          action: `Importación masiva CSV de ${newParticipants.length} participantes`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: 'Importación de nómina CSV validada',
          previousValue: null,
          newValue: { importedIds: newParticipants.map((p) => p.id) },
          timestamp: now,
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  // 12. General Disqualification (DQ) of Participant (Admin Only, preserves all results & recalculates velocity reference if affected)
  const setParticipantGeneralDQ = useCallback(
    async (params: {
      participantId: string;
      isDisqualified: boolean;
      reason: string;
    }) => {
      const admin = requireAdmin();
      if (false && !params.reason.trim()) {
        throw new Error(
          'Debe ingresar un motivo obligatorio para aplicar o levantar una descalificación general (DQ).'
        );
      }

      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.participants.findIndex(
          (p) => p.id === params.participantId && p.eventId === activeEvent.id
        );
        if (idx === -1) throw new Error('Participante no encontrado.');
        const prev = dbState.participants[idx];
        const now = Date.now();

        const updated: Participant = {
          ...prev,
          isDisqualified: params.isDisqualified,
          disqualificationReason: params.isDisqualified ? params.reason.trim() : undefined,
          disqualifiedBy: params.isDisqualified ? admin.uid : undefined,
          disqualifiedByName: params.isDisqualified ? admin.displayName : undefined,
          disqualifiedAt: params.isDisqualified ? now : undefined,
          updatedAt: now,
        };

        dbState.participants[idx] = updated;

        if (Boolean(0) && 'isDisqualified' in params) {
          dbState.results = dbState.results.map((r) => {
            if (
              r.eventId === activeEvent.id &&
              r.participantId === params.participantId &&
              r.participationStatus === 'dq'
            ) {
              return {
                ...r,
                participationStatus: 'dnf',
                updatedAt: Date.now(),
              };
            }
            return r;
          });
        }

        // Recalculate all time_calculated tests in case this participant held the reference best time!
        const disqualifiedIds = new Set(
          dbState.participants
            .filter((p) => p.eventId === activeEvent.id && p.isDisqualified)
            .map((p) => p.id)
        );

        const eventTests = dbState.tests.filter(
          (t) => t.eventId === activeEvent.id && t.scoringMethod === 'time_calculated'
        );

        for (const t of eventTests) {
          const allForTest = dbState.results.filter(
            (r) => r.eventId === activeEvent.id && r.testId === t.id
          );
          const { updatedResults } = recalculateAllResultsForTest(
            t,
            allForTest,
            disqualifiedIds
          );
          const updatedMap = new Map(updatedResults.map((ur) => [ur.id, ur]));
          dbState.results = dbState.results.map((r) => updatedMap.get(r.id) || r);
        }

        dbState.auditLogs.push({
          id: `log-${now}-${Math.random().toString(36).slice(2, 6)}`,
          eventId: activeEvent.id,
          entityType: 'participant',
          entityId: prev.id,
          action: params.isDisqualified
            ? `Descalificación General (DQ) aplicada a ${prev.fullName} (${prev.competitorNumber})`
            : `Rehabilitación / levantamiento de DQ General a ${prev.fullName}`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: params.reason.trim(),
          previousValue: {
            isDisqualified: prev.isDisqualified,
            disqualificationReason: prev.disqualificationReason,
          },
          newValue: {
            isDisqualified: updated.isDisqualified,
            disqualificationReason: updated.disqualificationReason,
          },
          timestamp: now,
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  // 13. Resolve Persistent Tie (Admin Only)
  const resolvePersistentTie = useCallback(
    async (params: {
      tieGroupKey: string;
      orderedParticipantIds: string[];
      reason: string;
    }) => {
      const admin = requireAdmin();
      if (false && !params.reason.trim()) {
        throw new Error('Debe registrar el motivo o acta del juez para resolver un desempate.');
      }

      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.events.findIndex((e) => e.id === activeEvent.id);
        if (idx === -1) throw new Error('Evento no encontrado.');
        const evt = dbState.events[idx];
        const now = Date.now();

        const resolution = {
          tieGroupKey: params.tieGroupKey,
          participantIds: [...params.orderedParticipantIds].sort(),
          orderedParticipantIds: params.orderedParticipantIds,
          reason: params.reason.trim(),
          resolvedBy: admin.uid,
          resolvedByName: admin.displayName,
          resolvedAt: now,
        };

        dbState.events[idx] = {
          ...evt,
          resolvedTies: {
            ...(evt.resolvedTies || {}),
            [params.tieGroupKey]: resolution,
          },
          updatedAt: now,
        };

        dbState.auditLogs.push({
          id: `log-${now}`,
          eventId: activeEvent.id,
          entityType: 'tie_break',
          entityId: params.tieGroupKey,
          action: `Resolución administrativa de empate entre pilotos (${params.orderedParticipantIds.join(
            ' > '
          )})`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: params.reason.trim(),
          previousValue: evt.resolvedTies?.[params.tieGroupKey] || null,
          newValue: resolution,
          timestamp: now,
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  const clearTieResolution = useCallback(
    async (tieGroupKey: string, reason: string) => {
      const admin = requireAdmin();
      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.events.findIndex((e) => e.id === activeEvent.id);
        if (idx === -1) return;
        const evt = dbState.events[idx];
        const prev = evt.resolvedTies?.[tieGroupKey];
        const nextTies = { ...(evt.resolvedTies || {}) };
        delete nextTies[tieGroupKey];
        dbState.events[idx] = {
          ...evt,
          resolvedTies: nextTies,
          updatedAt: Date.now(),
        };
        dbState.auditLogs.push({
          id: `log-${Date.now()}`,
          eventId: activeEvent.id,
          entityType: 'tie_break',
          entityId: tieGroupKey,
          action: `Anulación de desempate manual (${tieGroupKey}); vuelve a empate persistente`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: reason.trim() || 'Reapertura de desempate',
          previousValue: prev,
          newValue: null,
          timestamp: Date.now(),
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  // 14. Manage Staff Users (Admin Only)
  const saveStaffUser = useCallback(
    async (params: {
      uid?: string;
      email: string;
      displayName: string;
      role: UserRole;
      active: boolean;
    }) => {
      const admin = requireAdmin();
      await runAtomicDbTransaction((dbState) => {
        const now = Date.now();
        const uid = params.uid || `user-${now}`;
        const idx = dbState.users.findIndex((u) => u.uid === uid);
        const prev = idx !== -1 ? dbState.users[idx] : null;

        const record: UserProfile = {
          uid,
          email: params.email.trim(),
          displayName: params.displayName.trim(),
          role: params.role,
          active: params.active,
          createdAt: prev ? prev.createdAt : now,
          updatedAt: now,
        };

        if (idx !== -1) {
          dbState.users[idx] = record;
        } else {
          dbState.users.push(record);
        }

        dbState.auditLogs.push({
          id: `log-${now}`,
          eventId: activeEvent.id,
          entityType: 'user',
          entityId: uid,
          action: `${prev ? 'Actualización' : 'Creación'} de acceso de usuario ${record.displayName} (${
            record.role
          }, ${record.active ? 'Activo' : 'Inactivo'})`,
          actorUid: admin.uid,
          actorName: admin.displayName,
          actorRole: admin.role,
          reason: 'Gestión de permisos de staff',
          previousValue: prev,
          newValue: record,
          timestamp: now,
        });
      });
    },
    [requireAdmin, runAtomicDbTransaction, activeEvent.id]
  );

  const setEventRankingViewMode = useCallback(
    async (mode: RankingViewMode) => {
      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.events.findIndex((e) => e.id === activeEvent.id);
        if (idx === -1) return;
        dbState.events[idx] = {
          ...dbState.events[idx],
          rankingViewMode: mode,
          updatedAt: Date.now(),
        };
      });
    },
    [runAtomicDbTransaction, activeEvent.id]
  );

  const setEventRankingTeamFilter = useCallback(
    async (filter: RankingTeamFilter) => {
      await runAtomicDbTransaction((dbState) => {
        const idx = dbState.events.findIndex((e) => e.id === activeEvent.id);
        if (idx === -1) return;
        dbState.events[idx] = {
          ...dbState.events[idx],
          rankingTeamFilter: filter,
          updatedAt: Date.now(),
        };
      });
    },
    [runAtomicDbTransaction, activeEvent.id]
  );

  const toggleTrackResultDQ = useCallback(
    async (params: { participantId: string; testId: string; trackId?: string }) => {
      const actor = requireStaffOrAdmin();
      await runAtomicDbTransaction((dbState) => {
        const now = Date.now();
        const resultId = `${params.participantId}__${params.testId}`;
        const existingIdx = dbState.results.findIndex(
          (r) => r.id === resultId && r.eventId === activeEvent.id
        );
        const test = dbState.tests.find(
          (t) => t.id === params.testId && t.eventId === activeEvent.id
        );
        const evt = dbState.events.find((e) => e.id === activeEvent.id) || activeEvent;
        if (!test) return;

        const existing = existingIdx !== -1 ? dbState.results[existingIdx] : null;
        const isCurrentlyDQ =
          existing &&
          existing.publicationStatus === 'publicado' &&
          existing.participationStatus === 'dq';

        const defaultTrackId =
          params.trackId ||
          existing?.trackId ||
          dbState.tracks.find((tr) => tr.eventId === activeEvent.id)?.id ||
          'track_1';

        if (isCurrentlyDQ && existing) {
          // Restore previous valid time/score if available, or set back to pendiente
          const hasValidTime =
            existing.registeredTimeMs !== null && existing.registeredTimeMs > 0;
          const hasValidManual =
            test.scoringMethod === 'manual' &&
            existing.rawScore !== null &&
            existing.rawScore >= 0;

          if (hasValidTime || hasValidManual) {
            dbState.results[existingIdx] = {
              ...existing,
              participationStatus: 'completado',
              publicationStatus: 'publicado',
              version: existing.version + 1,
              updatedBy: actor.uid,
              updatedByName: actor.displayName,
              updatedAt: now,
            };
          } else {
            dbState.results[existingIdx] = {
              ...existing,
              participationStatus: 'pendiente',
              publicationStatus: 'borrador',
              calculatedBaseScore: null,
              netScore: null,
              contribution: null,
              effectiveTimeMs: null,
              version: existing.version + 1,
              updatedBy: actor.uid,
              updatedByName: actor.displayName,
              updatedAt: now,
            };
          }
        } else {
          // Mark ONLY this specific track as DQ (0,00 pts), preserving registeredTimeMs in case it is restored later
          const dqResult: CompetitionResult = {
            id: resultId,
            eventId: activeEvent.id,
            participantId: params.participantId,
            testId: test.id,
            trackId: defaultTrackId,
            attemptNumber: existing ? existing.attemptNumber : 1,
            participationStatus: 'dq',
            publicationStatus: 'publicado',
            rawScore: existing ? existing.rawScore : null,
            pointsPenalty: existing ? existing.pointsPenalty : 0,
            registeredTimeMs: existing ? existing.registeredTimeMs : null,
            secondsPenaltyMs: existing ? existing.secondsPenaltyMs : 0,
            effectiveTimeMs: null,
            calculatedBaseScore: 0,
            netScore: 0,
            contribution: 0,
            observation: existing?.observation || `DQ en ${test.name} (0,00 pts)`,
            adminException: existing?.adminException || null,
            previousAttempts: existing?.previousAttempts || [],
            version: existing ? existing.version + 1 : 1,
            configVersionUsed: evt.configVersion,
            createdBy: existing ? existing.createdBy : actor.uid,
            createdByName: existing ? existing.createdByName : actor.displayName,
            updatedBy: actor.uid,
            updatedByName: actor.displayName,
            publishedAt: now,
            updatedAt: now,
          };

          if (existingIdx !== -1) {
            dbState.results[existingIdx] = dqResult;
          } else {
            dbState.results.push(dqResult);
          }
        }

        // Recalculate all time_calculated tests so best reference time and scores update immediately
        const disqualifiedIds = new Set(
          dbState.participants
            .filter((p) => p.eventId === activeEvent.id && p.isDisqualified)
            .map((p) => p.id)
        );
        const allTimeTests = dbState.tests.filter(
          (t) => t.eventId === activeEvent.id && t.scoringMethod === 'time_calculated'
        );
        for (const t of allTimeTests) {
          const allForTest = dbState.results.filter(
            (r) => r.eventId === activeEvent.id && r.testId === t.id
          );
          const { updatedResults } = recalculateAllResultsForTest(
            t,
            allForTest,
            disqualifiedIds
          );
          const updatedMap = new Map(updatedResults.map((ur) => [ur.id, ur]));
          dbState.results = dbState.results.map((r) => updatedMap.get(r.id) || r);
        }
      });
    },
    [requireStaffOrAdmin, runAtomicDbTransaction, activeEvent]
  );

  const resetDemoDatabase = useCallback(() => {
    localStorage.removeItem(LOCAL_DB_STORAGE_KEY);
    const fresh = getInitialLocalDb();
    fresh.lastUpdatedAt = Math.max(Date.now(), (localDb.lastUpdatedAt || 0) + 1);
    try {
      localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(fresh));
    } catch {
      // ignore
    }
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: fresh }),
    }).catch(() => {});
    setLocalDb(fresh);
    setActiveEventId(INITIAL_EVENT_ID);
    setLastSyncTimestamp(Date.now());
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({
        type: 'DB_UPDATED',
        timestamp: Date.now(),
      });
    }
  }, []);

  const value: CompetitionContextValue = {
    envStatus,
    isDemoMode,
    isOnline,
    simulatedOffline,
    setSimulatedOffline,
    lastSyncTimestamp,
    currentUser,
    isPublicScreenMode,
    setIsPublicScreenMode,
    loginWithDemoProfile,
    loginWithFirebaseEmail,
    logout,
    events: localDb.events,
    activeEventId: activeEvent.id,
    activeEvent,
    setActiveEventId,
    tracks,
    tests,
    participants,
    results,
    auditLogs,
    users: isAuthorizedStaff ? localDb.users : [],
    publicParticipants,
    publicResults,
    updateAccreditation,
    updateTrackLiveState,
    saveOrPublishResult,
    annulPublishedResult,
    createEvent,
    updateEventDetails,
    saveTestConfig,
    toggleTestStatus,
    saveTrackConfig,
    saveParticipantAdmin,
    importParticipantsBatch,
    setParticipantGeneralDQ,
    resolvePersistentTie,
    clearTieResolution,
    saveStaffUser,
    resetDemoDatabase,
    setEventRankingViewMode,
    setEventRankingTeamFilter,
    toggleTrackResultDQ,
  };

  return (
    <CompetitionContext.Provider value={value}>
      {children}
    </CompetitionContext.Provider>
  );
};

export function useCompetition(): CompetitionContextValue {
  const ctx = useContext(CompetitionContext);
  if (!ctx) {
    throw new Error('useCompetition must be used inside CompetitionProvider');
  }
  return ctx;
}

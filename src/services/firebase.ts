import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  Firestore,
  connectFirestoreEmulator,
  getFirestore,
} from 'firebase/firestore';

export interface FirebaseEnvironmentStatus {
  isConfigured: boolean;
  useEmulator: boolean;
  projectId: string | null;
  databaseId: string;
  missingKeys: string[];
}

const REQUIRED_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export function getFirebaseEnvironmentStatus(): FirebaseEnvironmentStatus {
  const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
  const missingKeys: string[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    const val = import.meta.env[key];
    if (!val || String(val).trim() === '') {
      missingKeys.push(key);
    }
  }

  const isConfigured = missingKeys.length === 0 || useEmulator;
  const projectId =
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    (useEmulator ? 'demo-drone-competition' : null);
  const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)';

  return {
    isConfigured,
    useEmulator,
    projectId,
    databaseId,
    missingKeys,
  };
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;
let emulatorsConnected = false;

export function getFirebaseInstances(): {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  envStatus: FirebaseEnvironmentStatus;
} {
  const envStatus = getFirebaseEnvironmentStatus();

  if (!envStatus.isConfigured) {
    return { app: null, auth: null, db: null, envStatus };
  }

  if (!firebaseApp) {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
      authDomain:
        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
        `${envStatus.projectId}.firebaseapp.com`,
      projectId: envStatus.projectId || 'demo-drone-competition',
      storageBucket:
        import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
        `${envStatus.projectId}.appspot.com`,
      messagingSenderId:
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo',
    };

    firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firestoreDb =
      envStatus.databaseId && envStatus.databaseId !== '(default)'
        ? getFirestore(firebaseApp, envStatus.databaseId)
        : getFirestore(firebaseApp);

    if (envStatus.useEmulator && !emulatorsConnected) {
      connectAuthEmulator(firebaseAuth, 'http://localhost:9099', {
        disableWarnings: true,
      });
      connectFirestoreEmulator(firestoreDb, 'localhost', 8080);
      emulatorsConnected = true;
    }
  }

  return {
    app: firebaseApp,
    auth: firebaseAuth,
    db: firestoreDb,
    envStatus,
  };
}

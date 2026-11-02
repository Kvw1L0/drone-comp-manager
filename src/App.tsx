import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  UserCheck,
  ClipboardEdit,
  Settings,
  Tv,
  Wifi,
  WifiOff,
  LogOut,
  Sun,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import {
  CompetitionProvider,
  useCompetition,
} from './context/CompetitionContext';
import { LoginView } from './components/LoginView';
import { OperationalDashboard } from './components/OperationalDashboard';
import { AccreditationView } from './components/AccreditationView';
import { ResultEntryView } from './components/ResultEntryView';
import { AdminView } from './components/AdminView';
import { PublicScoreboard } from './components/PublicScoreboard';

type ActiveScreen = 'dashboard' | 'accreditation' | 'result_entry' | 'admin';

const MainShell: React.FC = () => {
  const {
    currentUser,
    isPublicScreenMode,
    setIsPublicScreenMode,
    isDemoMode,
    isOnline,
    simulatedOffline,
    setSimulatedOffline,
    activeEvent,
    events,
    setActiveEventId,
    loginWithDemoProfile,
    logout,
  } = useCompetition();

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');
  const [highContrastOutdoor, setHighContrastOutdoor] = useState<boolean>(false);

  // Contextual navigation parameters
  const [selectedParticipantId, setSelectedParticipantId] = useState<
    string | undefined
  >(undefined);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(
    undefined
  );
  const [selectedTestId, setSelectedTestId] = useState<string | undefined>(
    undefined
  );

  // Check URL query parameter ?vista=ranking for direct giant screen projection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('vista') === 'ranking' || params.get('screen') === 'public') {
      setIsPublicScreenMode(true);
    }
  }, [setIsPublicScreenMode]);

  // 1. Giant 16:9 Public Screen Mode (No login required, zero private data exposed)
  if (isPublicScreenMode) {
    return (
      <PublicScoreboard
        onExitPublicView={() => setIsPublicScreenMode(false)}
      />
    );
  }

  // 2. Staff / Admin Login Screen
  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={() => setActiveScreen('dashboard')}
        onOpenPublicScreen={() => setIsPublicScreenMode(true)}
      />
    );
  }

  // 3. Authenticated Staff / Admin Operational Workspace
  return (
    <div
      className={`min-h-screen flex flex-col ${
        highContrastOutdoor
          ? 'bg-black text-white contrast-125'
          : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Demo / Offline Status Top Strip */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isDemoMode && (
              <span className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-extrabold">
                MODO DEMOSTRACIÓN LOCAL (35 Pilotos • 4 Pistas)
              </span>
            )}
            <span className="text-slate-400">Evento:</span>
            <select
              aria-label="Seleccionar evento activo"
              value={activeEvent.id}
              onChange={(e) => setActiveEventId(e.target.value)}
              className="px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-white font-bold text-xs"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({ev.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Outdoor Sunlight High-Contrast Toggle */}
            <button
              type="button"
              onClick={() => setHighContrastOutdoor((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 cursor-pointer ${
                highContrastOutdoor
                  ? 'bg-amber-400 text-slate-950 border-white font-black'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Optimizar contraste para lectura bajo luz solar directa en pista"
            >
              <Sun className="w-3.5 h-3.5" />
              {highContrastOutdoor ? 'Luz Exterior: ACTIVO' : 'Modo Luz Exterior'}
            </button>

            {/* Offline Simulation Toggle to test local draft & conflict resolution */}
            <button
              type="button"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 cursor-pointer ${
                !isOnline
                  ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
                  : 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
              }`}
              title="Simular corte de conexión para verificar borradores locales aislados"
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  Conectado (Simular Corte)
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  SIN CONEXIÓN (Reconectar)
                </>
              )}
            </button>

            {/* Quick Profile Switcher in Demo Mode */}
            {isDemoMode && (
              <select
                aria-label="Cambiar operador en modo demo"
                value={currentUser.uid}
                onChange={(e) => {
                  loginWithDemoProfile(e.target.value);
                  if (
                    e.target.value !== 'demo-admin-1' &&
                    activeScreen === 'admin'
                  ) {
                    setActiveScreen('dashboard');
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-sky-300 font-bold text-xs cursor-pointer"
              >
                <option value="demo-admin-1">
                  👤 Carlos Mendoza (ADMIN)
                </option>
                <option value="demo-staff-1">
                  👤 Andrea Silva (STAFF - Pista 1)
                </option>
                <option value="demo-staff-2">
                  👤 Javier Morales (STAFF - Pista 2)
                </option>
                <option value="demo-staff-3">
                  👤 Francisca Pino (STAFF - Pista 3)
                </option>
                <option value="demo-staff-4">
                  👤 Rodrigo Vega (STAFF - Pista 4)
                </option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow"
              style={{
                backgroundColor: activeEvent.primaryColor || '#0284c7',
              }}
            >
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-white text-sm sm:text-base leading-tight">
                {activeEvent.name}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>{currentUser.displayName}</span>
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-sky-300 font-bold uppercase text-[10px]">
                  {currentUser.role}
                </span>
              </div>
            </div>
          </div>

          {/* Primary Navigation Buttons (Large Touch Targets for Field Staff) */}
          <nav className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('dashboard')}
              className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeScreen === 'dashboard'
                  ? 'bg-sky-500 text-slate-950 shadow'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Panel Operativo
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('accreditation')}
              className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeScreen === 'accreditation'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Acreditación
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('result_entry')}
              className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeScreen === 'result_entry'
                  ? 'bg-sky-500 text-slate-950 shadow'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <ClipboardEdit className="w-4 h-4" />
              Registro Resultados
            </button>

            {currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => setActiveScreen('admin')}
                className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                  activeScreen === 'admin'
                    ? 'bg-sky-500 text-slate-950 shadow'
                    : 'bg-slate-800/90 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <Settings className="w-4 h-4" />
                Administración
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPublicScreenMode(true)}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer"
            >
              <Tv className="w-4 h-4" />
              Ranking 16:9
            </button>

            <button
              type="button"
              onClick={() => logout()}
              title="Cerrar sesión"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-700 text-slate-300 hover:text-rose-300 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeScreen === 'dashboard' && (
          <OperationalDashboard
            onNavigateAccreditation={(participantId) => {
              if (participantId) setSelectedParticipantId(participantId);
              setActiveScreen('accreditation');
            }}
            onNavigateResultEntry={(params) => {
              if (params?.participantId)
                setSelectedParticipantId(params.participantId);
              if (params?.trackId) setSelectedTrackId(params.trackId);
              if (params?.testId) setSelectedTestId(params.testId);
              setActiveScreen('result_entry');
            }}
            onNavigateAdmin={() => setActiveScreen('admin')}
            onOpenPublicScreen={() => setIsPublicScreenMode(true)}
          />
        )}

        {activeScreen === 'accreditation' && (
          <AccreditationView
            initialParticipantId={selectedParticipantId}
            onGoToResultEntry={(participantId) => {
              setSelectedParticipantId(participantId);
              setActiveScreen('result_entry');
            }}
          />
        )}

        {activeScreen === 'result_entry' && (
          <ResultEntryView
            initialParticipantId={selectedParticipantId}
            initialTrackId={selectedTrackId}
            initialTestId={selectedTestId}
          />
        )}

        {activeScreen === 'admin' && (
          <AdminView
            onEditResultInForm={({ participantId, testId, trackId }) => {
              setSelectedParticipantId(participantId);
              setSelectedTestId(testId);
              setSelectedTrackId(trackId);
              setActiveScreen('result_entry');
            }}
          />
        )}
      </main>
    </div>
  );
};

export function App() {
  return (
    <CompetitionProvider>
      <MainShell />
    </CompetitionProvider>
  );
}

export default App;

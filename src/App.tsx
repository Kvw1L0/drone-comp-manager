import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Timer,
  Settings,
  Tv,
  Wifi,
  WifiOff,
  LogOut,
  Sun,
  ShieldCheck,
  Radio,
  Sparkles,
} from 'lucide-react';
import {
  CompetitionProvider,
  useCompetition,
} from './context/CompetitionContext';
import { LoginView } from './components/LoginView';
import { OperationalDashboard } from './components/OperationalDashboard';
import { ResultEntryView } from './components/ResultEntryView';
import { AdminView } from './components/AdminView';
import { PublicScoreboard } from './components/PublicScoreboard';

type ActiveScreen = 'dashboard' | 'result_entry' | 'admin';

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

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('result_entry');
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
        onLoginSuccess={() => setActiveScreen('result_entry')}
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
      {/* Sleek Compact Top Strip */}
      <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 py-1.5 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isDemoMode && (
              <span
                className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-[11px] flex items-center gap-1"
                title="Modo demostración local con 35 pilotos precargados"
              >
                <Sparkles className="w-3 h-3" />
                DEMO
              </span>
            )}
            <select
              aria-label="Seleccionar evento activo"
              value={activeEvent.id}
              onChange={(e) => setActiveEventId(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-semibold text-xs focus:outline-none focus:border-sky-500"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Outdoor Sunlight High-Contrast Toggle (Icon-first) */}
            <button
              type="button"
              onClick={() => setHighContrastOutdoor((v) => !v)}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                highContrastOutdoor
                  ? 'bg-amber-400 text-slate-950 border-white font-black'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Contraste para luz solar exterior"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>

            {/* Connectivity Status / Offline Toggle */}
            <button
              type="button"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 cursor-pointer text-[11px] ${
                !isOnline
                  ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
                  : 'bg-emerald-950/60 border-emerald-600/40 text-emerald-300'
              }`}
              title="Estado de conexión (Clic para simular modo sin conexión)"
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">En línea</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Offline</span>
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
                    setActiveScreen('result_entry');
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-sky-300 font-bold text-xs cursor-pointer"
              >
                <option value="demo-admin-1">Carlos M. (Admin)</option>
                <option value="demo-staff-1">Andrea S. (Pista 1)</option>
                <option value="demo-staff-2">Javier M. (Pista 2)</option>
                <option value="demo-staff-3">Francisca P. (Pista 3)</option>
                <option value="demo-staff-4">Rodrigo V. (Pista 4)</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="bg-slate-900/95 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white shadow-lg shrink-0"
              style={{
                backgroundColor: activeEvent.primaryColor || '#0284c7',
              }}
            >
              <Radio className="w-5 h-5" />
            </div>
            <div className="truncate">
              <div className="font-extrabold text-white text-sm sm:text-base leading-tight truncate">
                {activeEvent.name}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="truncate">{currentUser.displayName.split('(')[0].trim()}</span>
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-sky-300 font-bold uppercase text-[9px]">
                  {currentUser.role}
                </span>
              </div>
            </div>
          </div>

          {/* Clean Icon-Focused Navigation Bar */}
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('result_entry')}
              className={`px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeScreen === 'result_entry'
                  ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <Timer className="w-4 h-4" />
              <span>Tiempos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('dashboard')}
              className={`px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeScreen === 'dashboard'
                  ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Panel</span>
            </button>

            {currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => setActiveScreen('admin')}
                className={`px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                  activeScreen === 'admin'
                    ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden md:inline">Admin</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPublicScreenMode(true)}
              title="Abrir Ranking en Pantalla Gigante 16:9"
              className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <Tv className="w-4 h-4" />
              <span className="hidden md:inline">Ranking 16:9</span>
            </button>

            <button
              type="button"
              onClick={() => logout()}
              title="Cerrar sesión"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-950 border border-slate-700/80 hover:border-rose-700 text-slate-400 hover:text-rose-300 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5">
        {activeScreen === 'dashboard' && (
          <OperationalDashboard
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

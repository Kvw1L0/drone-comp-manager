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
import { BrandLogo } from './components/BrandLogo';

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

  // Check URL query parameter ?vista=ranking or ?vista=podio for direct giant screen projection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('vista') === 'ranking' ||
      params.get('vista') === 'podio' ||
      params.get('pantalla') === 'publica' ||
      params.get('pantalla') === 'podio' ||
      params.get('screen') === 'public' ||
      params.get('ranking') !== null ||
      params.get('podio') !== null
    ) {
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

  // 3. Authenticated Staff / Admin Mobile-First Operational Workspace
  return (
    <div
      className={`min-h-screen flex flex-col pb-20 sm:pb-8 ${
        highContrastOutdoor
          ? 'bg-black text-white contrast-125'
          : 'text-slate-100'
      }`}
    >
      {/* Top Tech HUD Accent Line */}
      <div className="h-1 w-full bg-gradient-to-r from-red-700 via-red-500 to-red-900" />

      {/* Ultra-Clean Mobile-First Header */}
      <header className="bg-slate-950/90 border-b border-red-500/25 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          {/* Brand Logo + Event Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo className="w-9 h-9 shrink-0 drop-shadow-[0_0_10px_rgba(230,0,18,0.45)]" />
            <div className="min-w-0">
              <div className="font-black text-white text-xs sm:text-sm uppercase tracking-wider truncate">
                {activeEvent.name.replace('(DEMO)', '').trim()}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                {isDemoMode ? (
                  <select
                    aria-label="Cambiar operador"
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
                    className="bg-transparent text-red-400 font-bold text-[11px] focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="demo-admin-1" className="bg-slate-900 text-white">
                      Carlos M. (Admin)
                    </option>
                    <option value="demo-staff-1" className="bg-slate-900 text-white">
                      Andrea S. (Pista 1)
                    </option>
                    <option value="demo-staff-2" className="bg-slate-900 text-white">
                      Javier M. (Pista 2)
                    </option>
                    <option value="demo-staff-3" className="bg-slate-900 text-white">
                      Francisca P. (Pista 3)
                    </option>
                    <option value="demo-staff-4" className="bg-slate-900 text-white">
                      Rodrigo V. (Pista 4)
                    </option>
                  </select>
                ) : (
                  <span className="text-red-400 font-bold truncate">
                    {currentUser.displayName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Navigation + Quick Status Icons */}
          <div className="flex items-center gap-1.5">
            {/* Desktop Tabs (Hidden on phones, replaced by bottom thumb bar) */}
            <nav className="hidden sm:flex items-center gap-1.5 mr-2">
              <button
                type="button"
                onClick={() => setActiveScreen('result_entry')}
                className={`px-3.5 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                  activeScreen === 'result_entry'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <Timer className="w-4 h-4" />
                <span>Tiempos</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveScreen('dashboard')}
                className={`px-3.5 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                  activeScreen === 'dashboard'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Pistas</span>
              </button>

              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setActiveScreen('admin')}
                  className={`px-3.5 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                    activeScreen === 'admin'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Admin</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsPublicScreenMode(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-red-500/40 text-red-400 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Tv className="w-4 h-4" />
                <span>16:9</span>
              </button>
            </nav>

            {/* Online/Offline Compact Indicator */}
            <button
              type="button"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                !isOnline
                  ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
                  : 'bg-slate-900 border-slate-800 text-emerald-400'
              }`}
              title={isOnline ? 'En línea (Toca para simular offline)' : 'Sin conexión (Toca para reconectar)'}
            >
              {isOnline ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
            </button>

            {/* Sunlight High-Contrast Toggle */}
            <button
              type="button"
              onClick={() => setHighContrastOutdoor((v) => !v)}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                highContrastOutdoor
                  ? 'bg-amber-400 text-slate-950 border-white font-black'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Alto contraste para sol directo"
            >
              <Sun className="w-4 h-4" />
            </button>

            {/* Logout */}
            <button
              type="button"
              onClick={() => logout()}
              title="Cerrar sesión"
              className="p-2 rounded-xl bg-slate-900 hover:bg-red-950 border border-slate-800 hover:border-red-700 text-slate-400 hover:text-red-300 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Mobile-First Workspace Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 py-3 sm:py-5">
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

      {/* Mobile Bottom Thumb Navigation Bar (Visible on Phones) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 border-t border-red-500/30 backdrop-blur-lg px-2 py-1.5">
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setActiveScreen('result_entry')}
            className={`py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 font-extrabold text-[11px] transition cursor-pointer ${
              activeScreen === 'result_entry'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Timer className="w-5 h-5" />
            <span>Tiempos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('dashboard')}
            className={`py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 font-extrabold text-[11px] transition cursor-pointer ${
              activeScreen === 'dashboard'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Pistas</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPublicScreenMode(true)}
            className="py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 font-extrabold text-[11px] text-slate-400 hover:text-red-400 transition cursor-pointer"
          >
            <Tv className="w-5 h-5" />
            <span>Ranking</span>
          </button>

          {currentUser.role === 'admin' ? (
            <button
              type="button"
              onClick={() => setActiveScreen('admin')}
              className={`py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 font-extrabold text-[11px] transition cursor-pointer ${
                activeScreen === 'admin'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Admin</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => logout()}
              className="py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 font-extrabold text-[11px] text-slate-400 hover:text-rose-400 transition cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              <span>Salir</span>
            </button>
          )}
        </div>
      </nav>
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

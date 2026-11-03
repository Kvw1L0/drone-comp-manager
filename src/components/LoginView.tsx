import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Tv,
  Lock,
  AlertCircle,
  Radio,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';

interface LoginViewProps {
  onLoginSuccess: () => void;
  onOpenPublicScreen: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onOpenPublicScreen,
}) => {
  const {
    isDemoMode,
    envStatus,
    loginWithDemoProfile,
    loginWithFirebaseEmail,
    activeEvent,
  } = useCompetition();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFirebaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithFirebaseEmail(email, password);
      onLoginSuccess();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al iniciar sesión con Firebase Auth.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSelect = (uid: string) => {
    setError(null);
    try {
      loginWithDemoProfile(uid);
      onLoginSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Left Banner: Event & Public Screen Shortcut */}
        <div
          className="lg:col-span-5 p-8 flex flex-col justify-between text-white"
          style={{
            background: `linear-gradient(135deg, ${activeEvent.primaryColor || '#0284c7'}, #0f172a)`,
          }}
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 text-xs font-bold uppercase tracking-wider mb-6 border border-white/15">
              <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              Control de Competencia
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mb-3">
              {activeEvent.name}
            </h1>
            <p className="text-sm text-slate-200/90 leading-relaxed">
              Cronometraje oficial en pista y transmisión del ranking en vivo.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-white/15 space-y-3">
            <button
              type="button"
              onClick={onOpenPublicScreen}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2.5 shadow-lg transition cursor-pointer"
            >
              <Tv className="w-5 h-5" />
              Pantalla Pública 16:9
            </button>
          </div>
        </div>

        {/* Right Panel: Staff & Admin Access */}
        <div className="lg:col-span-7 p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-sky-400" />
                Acceso Operadores
              </h2>
              {isDemoMode && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  DEMO
                </span>
              )}
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isDemoMode ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => handleDemoSelect('demo-admin-1')}
                  className="w-full p-4 rounded-2xl bg-sky-950/50 hover:bg-sky-900/60 border border-sky-700/60 text-left flex items-center justify-between transition group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 font-bold">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-extrabold text-white group-hover:text-sky-200">
                        Carlos Mendoza
                      </div>
                      <div className="text-xs text-sky-300 font-medium">
                        Director General • ADMIN
                      </div>
                    </div>
                  </div>
                  <span className="px-3.5 py-2 rounded-xl bg-sky-500 text-slate-950 font-black text-xs flex items-center gap-1">
                    Entrar <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {[
                    { uid: 'demo-staff-1', name: 'Andrea Silva', track: 'Pista 1' },
                    { uid: 'demo-staff-2', name: 'Javier Morales', track: 'Pista 2' },
                    { uid: 'demo-staff-3', name: 'Francisca Pino', track: 'Pista 3' },
                    { uid: 'demo-staff-4', name: 'Rodrigo Vega', track: 'Pista 4' },
                  ].map((op) => (
                    <button
                      key={op.uid}
                      type="button"
                      onClick={() => handleDemoSelect(op.uid)}
                      className="p-3.5 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/60 text-left flex items-center justify-between transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-bold text-sm text-white">{op.name}</div>
                          <div className="text-xs text-slate-400">{op.track}</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-emerald-400" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <form onSubmit={handleFirebaseSubmit} className="space-y-4">
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-700/50 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Firebase: <strong>{envStatus.projectId}</strong>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operador@evento.cl"
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm transition cursor-pointer"
                >
                  {loading ? 'Ingresando...' : 'Iniciar Sesión'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

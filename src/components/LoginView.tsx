import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Tv,
  Lock,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';
import { BrandLogo } from './BrandLogo';

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
    <div className="min-h-screen text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md kv-hud-card rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5 pb-4 border-b border-slate-800">
          <BrandLogo className="w-14 h-14 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-400">
              Control de Competencia
            </div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white leading-snug">
              {activeEvent.name}
            </h1>
          </div>
        </div>

        {/* Staff & Admin Quick Access */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              Selecciona tu Perfil
            </h2>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isDemoMode ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
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
                    className="p-3 rounded-2xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-sky-500/60 text-left flex items-center justify-between transition cursor-pointer active:scale-95"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase text-sky-400">
                        {op.track}
                      </div>
                      <div className="font-bold text-xs text-white truncate">
                        {op.name}
                      </div>
                    </div>
                    <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleDemoSelect('demo-admin-1')}
                className="w-full p-3.5 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/50 text-left flex items-center justify-between transition cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center font-bold">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-white">
                      Carlos Mendoza
                    </div>
                    <div className="text-[11px] text-sky-300 font-semibold">
                      Director General • ADMIN
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-sky-300" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleFirebaseSubmit} className="space-y-3">
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-700/50 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Firebase: <strong>{envStatus.projectId}</strong>
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@evento.cl"
                className="w-full px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-black text-sm transition cursor-pointer"
              >
                {loading ? 'Ingresando...' : 'Entrar'}
              </button>
            </form>
          )}
        </div>

        {/* Public Scoreboard Shortcut */}
        <div className="pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onOpenPublicScreen}
            className="w-full py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-amber-300 font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Tv className="w-4 h-4" />
            Abrir Pantalla Pública 16:9
          </button>
        </div>
      </div>
    </div>
  );
};

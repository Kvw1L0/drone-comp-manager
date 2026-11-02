import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Tv,
  Lock,
  AlertCircle,
  Radio,
  CheckCircle2,
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
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
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
              Control Oficial de Competencia
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mb-3">
              {activeEvent.name}
            </h1>
            <p className="text-sm text-slate-200/90 leading-relaxed">
              Sistema integral para acreditación de pilotos, registro concurrente en 4 pistas
              y clasificación en tiempo real para pantalla gigante.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-white/15 space-y-4">
            <div className="text-xs uppercase tracking-wider text-slate-200 font-semibold">
              Proyección sin inicio de sesión
            </div>
            <button
              type="button"
              onClick={onOpenPublicScreen}
              className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg transition cursor-pointer"
            >
              <Tv className="w-5 h-5" />
              Abrir Ranking en Pantalla Gigante (16:9)
            </button>
            <p className="text-xs text-slate-300">
              Vista pública de solo lectura sin acceso a notas internas ni controles administrativos.
            </p>
          </div>
        </div>

        {/* Right Panel: Staff & Admin Access */}
        <div className="lg:col-span-7 p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-sky-400" />
                  Acceso del Personal (Staff y Admin)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Seleccione su perfil operativo o ingrese con sus credenciales de Firebase Auth.
                </p>
              </div>
              {isDemoMode && (
                <span className="px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
                  MODO DEMO LOCAL
                </span>
              )}
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-sm flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {isDemoMode ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 leading-relaxed">
                  <p className="font-semibold text-amber-300 mb-1">
                    Demostración Local Activa (Datos Ficticios Claramente Identificados)
                  </p>
                  No se detectaron credenciales reales en <code className="text-sky-300">.env.local</code>.
                  Puede probar todos los perfiles y abrir varias pestañas simultáneamente para verificar concurrencia.
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    1. Perfil Administrador (Control total y excepciones)
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDemoSelect('demo-admin-1')}
                    className="w-full p-4 rounded-xl bg-sky-950/60 hover:bg-sky-900/70 border border-sky-700/60 text-left flex items-center justify-between transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 font-bold">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-white group-hover:text-sky-200">
                          Carlos Mendoza — Director General
                        </div>
                        <div className="text-xs text-sky-300">
                          Rol: ADMINISTRADOR • Configura reglas, autoriza excepciones, anula/corrige resultados
                        </div>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs">
                      Ingresar
                    </span>
                  </button>
                </div>

                <div className="space-y-2.5 pt-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    2. Perfiles Staff — 4 Operadores Simultáneos de Pista
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { uid: 'demo-staff-1', name: 'Andrea Silva', track: 'Operador Pista 1' },
                      { uid: 'demo-staff-2', name: 'Javier Morales', track: 'Operador Pista 2' },
                      { uid: 'demo-staff-3', name: 'Francisca Pino', track: 'Operador Pista 3' },
                      { uid: 'demo-staff-4', name: 'Rodrigo Vega', track: 'Operador Pista 4' },
                    ].map((op) => (
                      <button
                        key={op.uid}
                        type="button"
                        onClick={() => handleDemoSelect(op.uid)}
                        className="p-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/60 text-left flex items-center justify-between transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <div className="font-bold text-sm text-white">{op.name}</div>
                            <div className="text-xs text-slate-400">{op.track} (Rol: STAFF)</div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-400">Entrar →</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFirebaseSubmit} className="space-y-4">
                <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-700/50 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Conectado al proyecto Firebase: <strong>{envStatus.projectId}</strong>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                    Correo Electrónico Corporativo
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
                  {loading ? 'Verificando credenciales...' : 'Iniciar Sesión en Firebase'}
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>Seguridad por rol: Admin / Staff / Pantalla Pública</span>
            <span>Borradores aislados por operador</span>
          </div>
        </div>
      </div>
    </div>
  );
};

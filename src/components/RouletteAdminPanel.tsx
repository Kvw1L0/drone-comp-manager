import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Play,
  RotateCcw,
  Trophy,
  Users,
  Settings,
  Volume2,
  VolumeX,
  Trash2,
  Download,
  ExternalLink,
  Plus,
  Search,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Tv,
  ListOrdered,
} from 'lucide-react';
import {
  loadRouletteState,
  saveRouletteState,
  subscribeRouletteState,
  broadcastSpinCommand,
  parseExcelParticipants,
  downloadSampleExcelTemplate,
  exportWinnersToExcel,
  RouletteParticipant,
  RouletteState,
} from '../services/rouletteStorage';
import { RouletteLiveCarousel } from './RouletteLiveCarousel';
import { useCompetition } from '../context/CompetitionContext';
import { formatShortName } from '../utils/scoring';

interface RouletteAdminPanelProps {
  onOpenPublicRoulette?: () => void;
}

export const RouletteAdminPanel: React.FC<RouletteAdminPanelProps> = ({
  onOpenPublicRoulette,
}) => {
  const { participants: tourneyParticipants } = useCompetition();
  const fileInputId = useId();

  const [state, setState] = useState<RouletteState>(loadRouletteState);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedWinnerMode, setSelectedWinnerMode] = useState<'random' | 'manual'>('random');
  const [manualWinnerId, setManualWinnerId] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual participant add inputs
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newNumber, setNewNumber] = useState<string>('');
  const [newCompany, setNewCompany] = useState<string>('');
  const [newDivision, setNewDivision] = useState<string>('Dx');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to live state
  useEffect(() => {
    const unsub = subscribeRouletteState((next) => {
      setState(next);
    });
    return unsub;
  }, []);

  const updateState = (updater: (prev: RouletteState) => RouletteState) => {
    setState((prev) => {
      const next = updater(prev);
      saveRouletteState(next, true);
      return next;
    });
  };

  // Feedback helper
  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // 1. Excel File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const parsed = await parseExcelParticipants(file);
      if (parsed.length === 0) {
        showFeedback('error', 'No se encontraron participantes válidos en el archivo Excel.');
      } else {
        updateState((prev) => ({
          ...prev,
          participants: parsed,
        }));
        showFeedback('success', `¡Éxito! Se cargaron ${parsed.length} participantes desde "${file.name}".`);
      }
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error al procesar el archivo Excel. Verifique el formato.');
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  // 2. Load participants from the active tournament
  const handleLoadFromTournament = () => {
    if (!tourneyParticipants || tourneyParticipants.length === 0) {
      showFeedback('error', 'No hay participantes registrados en el torneo actual.');
      return;
    }
    const mapped: RouletteParticipant[] = tourneyParticipants.map((p) => ({
      id: p.id,
      name: p.fullName,
      shortName: formatShortName(p.fullName),
      number: p.competitorNumber,
      company: p.companyOrTeam,
      division: p.teamDivision === 'transmision' ? 'Tx' : 'Dx',
    }));

    updateState((prev) => ({
      ...prev,
      participants: mapped,
    }));
    showFeedback('success', `Se sincronizaron ${mapped.length} competidores desde la nómina oficial del torneo.`);
  };

  // 3. Trigger Spin Activation
  const handleTriggerSpin = () => {
    if (state.participants.length === 0) {
      showFeedback('error', 'No hay participantes en la ruleta. Se sincronizaron los participantes oficiales del torneo.');
      handleLoadFromTournament();
      return;
    }

    let winnerId = manualWinnerId;
    if (selectedWinnerMode === 'random' || !winnerId) {
      const randomIdx = Math.floor(Math.random() * state.participants.length);
      winnerId = state.participants[randomIdx].id;
    }

    const duration = state.spinDurationSeconds || 8;
    const nonce = (state.spinNonce || 0) + 1;

    updateState((prev) => ({
      ...prev,
      spinNonce: nonce,
      targetWinnerId: winnerId,
      spinTimestamp: Date.now(),
      isSpinning: true,
    }));

    // Broadcast spin command to all screens
    broadcastSpinCommand(winnerId, duration, nonce);

    showFeedback('success', '🎰 ¡Ruleta activada y girando en tiempo real!');
  };

  // 4. Manual participant addition
  const handleAddManualParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newP: RouletteParticipant = {
      id: `manual-${Date.now()}`,
      name: newName.trim(),
      shortName: formatShortName(newName.trim()),
      number: newNumber.trim() ? (newNumber.startsWith('#') ? newNumber.trim() : `#${newNumber.trim()}`) : `#${state.participants.length + 1}`,
      company: newCompany.trim() || 'Participante',
      division: newDivision || undefined,
    };

    updateState((prev) => ({
      ...prev,
      participants: [...prev.participants, newP],
    }));

    setNewName('');
    setNewNumber('');
    setNewCompany('');
    setShowAddModal(false);
    showFeedback('success', `Participante "${newP.name}" agregado exitosamente.`);
  };

  // 5. Remove single participant
  const handleRemoveParticipant = (id: string) => {
    updateState((prev) => ({
      ...prev,
      participants: prev.participants.filter((p) => p.id !== id),
    }));
  };

  // 6. Return winner to pool
  const handleReincorporateWinner = (winnerRecordId: string) => {
    const winnerRecord = state.winners.find((w) => w.id === winnerRecordId);
    if (!winnerRecord) return;

    updateState((prev) => ({
      ...prev,
      winners: prev.winners.filter((w) => w.id !== winnerRecordId),
      participants: prev.participants.some((p) => p.id === winnerRecord.participant.id)
        ? prev.participants
        : [winnerRecord.participant, ...prev.participants],
    }));

    showFeedback('success', `"${winnerRecord.participant.name}" reincorporado a la ruleta.`);
  };

  // Filtered participants list
  const filteredParticipants = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return state.participants;
    return state.participants.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.company && p.company.toLowerCase().includes(term)) ||
        (p.number && p.number.toLowerCase().includes(term))
    );
  }, [state.participants, searchTerm]);

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* TOP HERO BANNER & ACTIVATION COCKPIT                                  */}
      {/* ===================================================================== */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-red-500/50 bg-gradient-to-br from-[#1b080d] via-[#10121a] to-[#0a0b10] p-5 sm:p-7 shadow-[0_10px_40px_rgba(230,0,18,0.25)]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Title & Status */}
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-red-600/30 border border-red-500/60 text-red-300 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(230,0,18,0.4)]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                MÓDULO DE TRANSMISIÓN Y SORTEOS
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono font-bold">
                {state.participants.length} en pozo
              </span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-black italic uppercase tracking-wider text-white drop-shadow-md">
              PANEL DE CONTROL DE RULETA
            </h2>

            <p className="text-sm text-slate-300 max-w-xl">
              Cargue nóminas desde Excel, configure premios y active giros en tiempo real sincronizados con la pantalla gigante de transmisión.
            </p>
          </div>

          {/* Huge Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button
              type="button"
              onClick={handleTriggerSpin}
              disabled={state.participants.length === 0}
              className={`flex-1 sm:flex-initial py-4 px-8 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-3 shadow-2xl transition-all cursor-pointer ${
                state.participants.length === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-600 via-red-500 to-amber-500 hover:brightness-110 active:scale-95 text-white shadow-red-600/50 border border-red-400/60 animate-pulse'
              }`}
            >
              <Play className="w-6 h-6 fill-current text-white" />
              <span>¡GIRAR RULETA AHORA!</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenPublicRoulette) {
                  onOpenPublicRoulette();
                } else {
                  window.open('?vista=ruleta', '_blank', 'noopener,noreferrer');
                }
              }}
              className="py-4 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border-2 border-red-500/40 text-red-400 hover:text-white font-black text-sm uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-lg"
              title="Abrir en proyector o pantalla 16:9"
            >
              <Tv className="w-5 h-5" />
              <span>Pantalla 16:9</span>
              <ExternalLink className="w-4 h-4 ml-0.5 opacity-70" />
            </button>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackMsg && (
          <div
            className={`mt-4 p-3 rounded-xl border flex items-center gap-2 text-sm font-bold animate-in fade-in duration-200 ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                : 'bg-rose-950/80 border-rose-500 text-rose-200'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* LIVE INTERACTIVE CAROUSEL COCKPIT (Visible in Admin & in Real-Time)   */}
      {/* ===================================================================== */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-red-500/50 bg-[#0a0c12] p-4 sm:p-6 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span className="text-sm sm:text-base font-black italic uppercase tracking-wider text-white">
              Cabina de Ruleta en Vivo (Giro Directo y Sincronizado)
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-amber-300 px-2.5 py-1 rounded-full bg-black/50 border border-white/15">
            🔴 Sincronizado en Tiempo Real
          </span>
        </div>

        <RouletteLiveCarousel
          mode="embedded"
          state={state}
          onUpdateState={updateState}
          showSpinButton={true}
        />
      </div>
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: EXCEL IMPORT & PARTICIPANT MANAGEMENT (7 COLS) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Excel File Box */}
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base uppercase text-white tracking-wide">
                    Cargar Nómina desde Excel
                  </h3>
                  <p className="text-xs text-slate-400">
                    Formatos soportados: .xlsx, .xls y .csv
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={downloadSampleExcelTemplate}
                className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-slate-300 flex items-center gap-1.5 transition cursor-pointer"
                title="Descargar formato modelo"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Plantilla</span>
              </button>
            </div>

            {/* Drag & Drop Upload Zone */}
            <label
              htmlFor={fileInputId}
              className="border-2 border-dashed border-red-500/30 hover:border-red-500/70 bg-black/40 hover:bg-red-950/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition cursor-pointer group"
            >
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              <Upload className="w-8 h-8 text-red-400 group-hover:scale-110 group-hover:text-amber-400 transition mb-2" />
              <span className="font-extrabold text-sm text-slate-200">
                {isUploading ? 'Procesando archivo...' : 'Haz clic para seleccionar o arrastra tu archivo Excel'}
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Columnas detectadas automáticamente: Nombre, N°, Empresa / Área, División
              </span>
            </label>

            {/* Quick Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLoadFromTournament}
                className="py-2 px-3.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-200 text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
              >
                <Users className="w-4 h-4 text-red-400" />
                <span>Cargar Pilotos del Torneo</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Manual</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Desea vaciar todos los participantes de la ruleta?')) {
                      updateState((prev) => ({ ...prev, participants: [] }));
                      showFeedback('success', 'Nómina vaciada.');
                    }
                  }}
                  disabled={state.participants.length === 0}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-600/60 text-slate-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vaciar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Participants Table with Live Search */}
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-base uppercase text-white tracking-wide">
                  Participantes en la Ruleta ({state.participants.length})
                </h3>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar participante..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-red-500 transition"
                />
              </div>
            </div>

            {/* List Table */}
            <div className="border border-slate-800 rounded-2xl overflow-hidden max-h-[320px] overflow-y-auto">
              {filteredParticipants.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-bold">
                  {state.participants.length === 0
                    ? 'No hay participantes en la ruleta. Cargue un archivo Excel arriba.'
                    : 'No se encontraron participantes que coincidan con la búsqueda.'}
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-black uppercase">
                    <tr>
                      <th className="py-2.5 px-3 w-16 text-center">N°</th>
                      <th className="py-2.5 px-3">Nombre</th>
                      <th className="py-2.5 px-3">Empresa / Área</th>
                      <th className="py-2.5 px-3 text-center">Div.</th>
                      <th className="py-2.5 px-3 text-center w-12">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredParticipants.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-red-950/20 transition-colors">
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-400">
                          {p.number || `#${String(idx + 1).padStart(2, '0')}`}
                        </td>
                        <td className="py-2 px-3 font-extrabold text-white">
                          {p.name}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {p.company || '—'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {p.division ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                                p.division === 'Tx'
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              {p.division}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(p.id)}
                            className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                            title="Eliminar de la ruleta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ROULETTE SETTINGS & WINNERS HISTORY (5 COLS) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Settings Box */}
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-400/30 text-red-400">
                <Settings className="w-5 h-5" />
              </div>
              <h3 className="font-black text-base uppercase text-white tracking-wide">
                Configuración del Sorteo
              </h3>
            </div>

            <div className="space-y-4">
              {/* Prize Title */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  Título del Premio o Motivo
                </label>
                <div className="relative">
                  <Trophy className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={state.prizeTitle}
                    onChange={(e) => updateState((prev) => ({ ...prev, prizeTitle: e.target.value }))}
                    placeholder="Ej. Drone DJI Mini 4 Pro, Gift Card..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/60 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Spin Duration */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  Duración del Giro en Pantalla
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { sec: 5, label: '5s Rápido' },
                    { sec: 8, label: '8s Normal' },
                    { sec: 12, label: '12s Épico' },
                  ].map((item) => (
                    <button
                      key={item.sec}
                      type="button"
                      onClick={() => updateState((prev) => ({ ...prev, spinDurationSeconds: item.sec }))}
                      className={`py-2 px-2 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                        state.spinDurationSeconds === item.sec
                          ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30'
                          : 'bg-black/60 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="pt-2 space-y-3 border-t border-slate-800">
                {/* Remove winner from pool toggle */}
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <span className="font-extrabold text-xs text-white block">
                      Eliminar ganador del pozo
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Evita que un mismo participante gane dos veces
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={state.removeWinnerFromPool}
                    onChange={(e) => updateState((prev) => ({ ...prev, removeWinnerFromPool: e.target.checked }))}
                    className="w-4 h-4 accent-red-600 cursor-pointer rounded"
                  />
                </label>

                {/* Sound toggle */}
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div className="flex items-center gap-2">
                    {state.soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                    <span className="font-extrabold text-xs text-white">
                      Efectos de sonido (Ticks y Fanfarria)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={state.soundEnabled}
                    onChange={(e) => updateState((prev) => ({ ...prev, soundEnabled: e.target.checked }))}
                    className="w-4 h-4 accent-red-600 cursor-pointer rounded"
                  />
                </label>

                {/* Confetti toggle */}
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-extrabold text-xs text-white">
                      Animación de confeti de victoria
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={state.confettiEnabled !== false}
                    onChange={(e) => updateState((prev) => ({ ...prev, confettiEnabled: e.target.checked }))}
                    className="w-4 h-4 accent-red-600 cursor-pointer rounded"
                  />
                </label>
              </div>

              {/* Draw Mode: Random vs Forced/Manual */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  Modalidad de Selección
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedWinnerMode('random')}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      selectedWinnerMode === 'random'
                        ? 'bg-red-950/80 text-white border-red-500'
                        : 'bg-black/60 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    100% Aleatorio
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedWinnerMode('manual')}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      selectedWinnerMode === 'manual'
                        ? 'bg-red-950/80 text-white border-red-500'
                        : 'bg-black/60 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    Preseleccionar
                  </button>
                </div>

                {selectedWinnerMode === 'manual' && (
                  <div className="mt-2">
                    <select
                      value={manualWinnerId}
                      onChange={(e) => setManualWinnerId(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-black/80 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-red-500"
                    >
                      <option value="">Seleccione el ganador para el próximo giro...</option>
                      {state.participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number} - {p.name} ({p.company})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Winners History Box */}
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-base uppercase text-white tracking-wide">
                  Historial de Ganadores ({state.winners.length})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportWinnersToExcel(state.winners)}
                  disabled={state.winners.length === 0}
                  className="py-1 px-2.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                  title="Exportar a Excel"
                >
                  <Download className="w-3 h-3" />
                  <span>Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Reiniciar todo el historial de ganadores?')) {
                      updateState((prev) => ({ ...prev, winners: [] }));
                      showFeedback('success', 'Historial reiniciado.');
                    }
                  }}
                  disabled={state.winners.length === 0}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition cursor-pointer disabled:opacity-40"
                  title="Limpiar historial"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="border border-slate-800 rounded-2xl overflow-hidden max-h-[260px] overflow-y-auto">
              {state.winners.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-bold">
                  Aún no se han sorteado ganadores en esta sesión.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {state.winners.map((w, idx) => (
                    <div
                      key={w.id}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-red-950/20 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono font-black text-xs border border-amber-400/30">
                            {idx + 1}°
                          </span>
                          <span className="font-black text-white text-xs truncate">
                            {w.participant.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {w.prizeTitle} • {w.participant.company || 'Participante'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReincorporateWinner(w.id)}
                        className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                        title="Devolver al pozo de la ruleta"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-400" />
                        <span>Reincorporar</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MANUAL PARTICIPANT ADD MODAL                                          */}
      {/* ===================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#12141a] border border-red-500/40 shadow-2xl space-y-4">
            <h3 className="text-lg font-black uppercase text-white tracking-wide">
              Agregar Participante Manual
            </h3>

            <form onSubmit={handleAddManualParticipant} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full py-2 px-3 rounded-xl bg-black/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Número / Dorsal
                  </label>
                  <input
                    type="text"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    placeholder="#11"
                    className="w-full py-2 px-3 rounded-xl bg-black/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    División
                  </label>
                  <select
                    value={newDivision}
                    onChange={(e) => setNewDivision(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-black/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-red-500"
                  >
                    <option value="Dx">Dx (Distribución)</option>
                    <option value="Tx">Tx (Transmisión)</option>
                    <option value="">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Empresa o Área
                </label>
                <input
                  type="text"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Ej. Chilquinta, Litoral..."
                  className="w-full py-2 px-3 rounded-xl bg-black/60 border border-slate-700 text-white text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="py-2 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-red-600/30"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

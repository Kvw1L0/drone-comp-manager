import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  UserCheck,
  AlertTriangle,
  Building2,
  Hash,
  FileText,
  ClipboardEdit,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useCompetition } from '../context/CompetitionContext';
import { AccreditationStatus, Participant } from '../types/domain';
import { normalizeSearchText } from '../utils/scoring';

interface AccreditationViewProps {
  initialParticipantId?: string;
  onGoToResultEntry: (participantId: string) => void;
}

export const AccreditationView: React.FC<AccreditationViewProps> = ({
  initialParticipantId,
  onGoToResultEntry,
}) => {
  const { activeEvent, participants, updateAccreditation } = useCompetition();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | AccreditationStatus>('todos');
  const [selectedId, setSelectedId] = useState<string>(
    initialParticipantId || participants[0]?.id || ''
  );

  // Local form state for selected participant
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedParticipant = useMemo(
    () => participants.find((p) => p.id === selectedId) || null,
    [participants, selectedId]
  );

  useEffect(() => {
    if (initialParticipantId) {
      setSelectedId(initialParticipantId);
    }
  }, [initialParticipantId]);

  useEffect(() => {
    if (selectedParticipant) {
      setChecks({ ...(selectedParticipant.requirementsChecks || {}) });
      setNotes(selectedParticipant.internalNotes || '');
      setFeedback(null);
    }
  }, [selectedParticipant]);

  // Detect homonyms (shared normalizedName across the event) so UI highlights company & number
  const homonymNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of participants) {
      counts.set(p.normalizedName, (counts.get(p.normalizedName) || 0) + 1);
    }
    const set = new Set<string>();
    for (const [k, v] of counts.entries()) {
      if (v > 1) set.add(k);
    }
    return set;
  }, [participants]);

  // Accent-insensitive and case-insensitive search across name, company, competitor number, and ID
  const filteredParticipants = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    return participants.filter((p) => {
      if (statusFilter !== 'todos' && p.accreditationStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${p.normalizedName} ${normalizeSearchText(
        p.companyOrTeam
      )} ${normalizeSearchText(p.competitorNumber)} ${normalizeSearchText(p.id)}`;
      return hay.includes(q);
    });
  }, [participants, searchQuery, statusFilter]);

  const allRequiredChecked = useMemo(() => {
    return activeEvent.accreditationRequirements
      .filter((r) => r.required)
      .every((r) => Boolean(checks[r.id]));
  }, [activeEvent.accreditationRequirements, checks]);

  const handleToggleCheck = (reqId: string) => {
    setChecks((prev) => ({
      ...prev,
      [reqId]: !prev[reqId],
    }));
    setFeedback(null);
  };

  const handleCheckAll = () => {
    const next: Record<string, boolean> = {};
    for (const req of activeEvent.accreditationRequirements) {
      next[req.id] = true;
    }
    setChecks(next);
    setFeedback(null);
  };

  const handleSaveAccreditation = async (targetStatus: AccreditationStatus) => {
    if (!selectedParticipant) return;
    setFeedback(null);
    setSaving(true);
    try {
      await updateAccreditation({
        participantId: selectedParticipant.id,
        requirementsChecks: checks,
        accreditationStatus: targetStatus,
        internalNotes: notes,
      });
      setFeedback({
        type: 'success',
        message:
          targetStatus === 'habilitado'
            ? `✓ Piloto ${selectedParticipant.fullName} (${selectedParticipant.competitorNumber}) HABILITADO oficialmente para competir.`
            : `Estado de acreditación de ${selectedParticipant.fullName} actualizado a "${targetStatus.toUpperCase()}".`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'No se pudo actualizar la acreditación.',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderStatusBadge = (p: Participant) => {
    if (p.isDisqualified) {
      return (
        <span className="px-2.5 py-1 rounded-full bg-rose-950 border border-rose-600 text-rose-300 text-xs font-extrabold flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" /> DQ GENERAL
        </span>
      );
    }
    if (p.accreditationStatus === 'habilitado') {
      return (
        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> HABILITADO
        </span>
      );
    }
    if (p.accreditationStatus === 'rechazado') {
      return (
        <span className="px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-extrabold flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" /> RECHAZADO
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-extrabold flex items-center gap-1">
        <Clock className="w-3.5 h-3.5" /> PENDIENTE
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Prominent Search & Filter Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2.5">
              <UserCheck className="w-6 h-6 text-emerald-400" />
              Mesa de Acreditación y Habilitación de Pilotos
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Búsqueda rápida sin distinción de mayúsculas ni tildes. Distingue homónimos por
              empresa y número de competidor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'todos', label: `Todos (${participants.length})` },
                {
                  id: 'pendiente',
                  label: `Pendientes (${
                    participants.filter((p) => p.accreditationStatus === 'pendiente').length
                  })`,
                },
                {
                  id: 'habilitado',
                  label: `Habilitados (${
                    participants.filter((p) => p.accreditationStatus === 'habilitado').length
                  })`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Giant Search Input */}
        <div className="relative">
          <Search className="w-5 h-5 text-sky-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar piloto por nombre (ej. matias rojas, agustin yanez), empresa o número (#101)..."
            className="w-full pl-12 pr-28 py-4 rounded-xl bg-slate-950 border-2 border-slate-700 focus:border-sky-500 text-white text-base font-medium placeholder:text-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold cursor-pointer"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Main Split: Left Participant Roster | Right Accreditation Sheet */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Roster List */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col max-h-[680px]">
          <div className="text-xs font-bold uppercase text-slate-400 mb-3 px-1 flex items-center justify-between">
            <span>Resultados de búsqueda ({filteredParticipants.length})</span>
            <span>Toque para seleccionar</span>
          </div>

          <div className="space-y-2 overflow-y-auto pr-1 flex-1">
            {filteredParticipants.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No se encontraron participantes para &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              filteredParticipants.map((p) => {
                const isSelected = p.id === selectedId;
                const isHomonym = homonymNames.has(p.normalizedName);

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full p-3.5 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-950/80 border-sky-400 shadow-md'
                        : 'bg-slate-950/60 hover:bg-slate-800/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2 flex-wrap">
                          <span>{p.fullName}</span>
                          {isHomonym && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-extrabold uppercase">
                              Homónimo: verificar empresa/#
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono font-bold">
                            <Hash className="w-3 h-3" />
                            {p.competitorNumber || p.id}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {p.companyOrTeam || 'Sin empresa'}
                          </span>
                          <span className="text-slate-500 font-mono text-[11px]">
                            ID: {p.id}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">{renderStatusBadge(p)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Participant Detail & Checklist Sheet */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
          {!selectedParticipant ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm py-16">
              Seleccione un participante de la lista para revisar y validar su acreditación.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pilot Identity Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-1">
                    <span>ID INTERNO: {selectedParticipant.id}</span>
                    <span>•</span>
                    <span>NÚMERO: {selectedParticipant.competitorNumber || 'S/N'}</span>
                  </div>
                  <h2 className="text-2xl font-extrabold text-white">
                    {selectedParticipant.fullName}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-sky-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      Empresa / Equipo: {selectedParticipant.companyOrTeam || 'Independiente'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-2">
                  {renderStatusBadge(selectedParticipant)}
                  {selectedParticipant.accreditationStatus === 'habilitado' &&
                    !selectedParticipant.isDisqualified && (
                      <button
                        type="button"
                        onClick={() => onGoToResultEntry(selectedParticipant.id)}
                        className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <ClipboardEdit className="w-4 h-4" />
                        Ir a Registrar Resultado
                      </button>
                    )}
                </div>
              </div>

              {homonymNames.has(selectedParticipant.normalizedName) && (
                <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-600/60 text-amber-200 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Aviso de Homonimia:</strong> Existe otro participante con el nombre{' '}
                    <strong>{selectedParticipant.fullName}</strong> en este evento. Confirme que
                    corresponde a la empresa{' '}
                    <strong className="underline">{selectedParticipant.companyOrTeam}</strong> y
                    número <strong className="underline">{selectedParticipant.competitorNumber}</strong>.
                  </div>
                </div>
              )}

              {feedback && (
                <div
                  className={`p-4 rounded-xl border text-sm font-bold flex items-center gap-2.5 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-950/80 border-emerald-600 text-emerald-200'
                      : 'bg-rose-950/80 border-rose-600 text-rose-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              {/* Configurable Accreditation Requirements Checklist */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      Requisitos de Acreditación (Validación Manual del Staff)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Marque cada requisito verificado en terreno antes de habilitar al piloto.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckAll}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 transition cursor-pointer"
                  >
                    Marcar todos
                  </button>
                </div>

                <div className="space-y-2.5">
                  {activeEvent.accreditationRequirements.map((req) => {
                    const checked = Boolean(checks[req.id]);
                    return (
                      <button
                        key={req.id}
                        type="button"
                        onClick={() => handleToggleCheck(req.id)}
                        className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                          checked
                            ? 'bg-emerald-950/40 border-emerald-500/60 text-white'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {checked ? (
                            <CheckSquare className="w-6 h-6 text-emerald-400 shrink-0" />
                          ) : (
                            <Square className="w-6 h-6 text-slate-500 shrink-0" />
                          )}
                          <div>
                            <div className="font-bold text-sm sm:text-base">{req.label}</div>
                            <div className="text-xs text-slate-400">
                              {req.required ? 'Requisito obligatorio' : 'Requisito opcional'}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded text-xs font-bold ${
                            checked
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {checked ? 'Verificado ✓' : 'Sin verificar'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Internal Observations (Private to Staff/Admin) */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-sky-400" />
                  Observaciones Internas del Staff (Privado — Nunca visible en pantalla pública)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Canal VTX asignado, dron de respaldo verificado, observación técnica..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  disabled={saving || !allRequiredChecked}
                  onClick={() => handleSaveAccreditation('habilitado')}
                  className="flex-1 py-4 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-base flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Habilitar para Competir a {selectedParticipant.fullName}
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveAccreditation('pendiente')}
                  className="py-4 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-sm transition cursor-pointer"
                >
                  Guardar como Pendiente
                </button>
              </div>
              {!allRequiredChecked && (
                <p className="text-xs text-amber-400 font-medium">
                  * Para habilitar al piloto debe marcar todos los requisitos obligatorios de la lista.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

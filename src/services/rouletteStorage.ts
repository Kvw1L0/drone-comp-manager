import * as XLSX from 'xlsx';
import { DEMO_PARTICIPANTS } from '../data/seedData';
import { formatShortName } from '../utils/scoring';

export interface RouletteParticipant {
  id: string;
  name: string;
  shortName: string;
  number?: string;
  company?: string;
  division?: string;
}

export interface RouletteWinner {
  id: string;
  participant: RouletteParticipant;
  prizeTitle: string;
  timestamp: number;
}

export interface RouletteSpinCommand {
  type: 'SPIN_COMMAND';
  winnerId: string;
  durationSec: number;
  nonce: number;
  timestamp: number;
}

export interface RouletteState {
  participants: RouletteParticipant[];
  winners: RouletteWinner[];
  prizeTitle: string;
  spinDurationSeconds: number;
  removeWinnerFromPool: boolean;
  soundEnabled: boolean;
  confettiEnabled: boolean;
  isSpinning: boolean;
  // Trigger synchronization
  spinNonce: number; // Increment on each spin command
  targetWinnerId: string | null;
  spinTimestamp: number;
}

const STORAGE_KEY = 'drone_comp_roulette_state_v3';
const CHANNEL_NAME = 'drone_roulette_channel_v3';

export function getDefaultRouletteParticipants(): RouletteParticipant[] {
  return DEMO_PARTICIPANTS.map((p) => ({
    id: p.id,
    name: p.fullName,
    shortName: formatShortName(p.fullName),
    number: p.competitorNumber,
    company: p.companyOrTeam,
    division: p.teamDivision === 'transmision' ? 'Tx' : 'Dx',
  }));
}

export function getDefaultRouletteState(): RouletteState {
  return {
    participants: getDefaultRouletteParticipants(),
    winners: [],
    prizeTitle: 'SORTEO OFICIAL DE COMPETENCIA',
    spinDurationSeconds: 8,
    removeWinnerFromPool: true,
    soundEnabled: true,
    confettiEnabled: true,
    isSpinning: false,
    spinNonce: 0,
    targetWinnerId: null,
    spinTimestamp: 0,
  };
}

export function loadRouletteState(): RouletteState {
  if (typeof window === 'undefined') return getDefaultRouletteState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultRouletteState();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.participants) || parsed.participants.length === 0) {
      parsed.participants = getDefaultRouletteParticipants();
    }
    return {
      ...getDefaultRouletteState(),
      ...parsed,
      isSpinning: false, // Always reset spinning state on fresh load
    };
  } catch {
    return getDefaultRouletteState();
  }
}

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

export function saveRouletteState(state: RouletteState, broadcast = true): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (broadcast) {
      const ch = getChannel();
      if (ch) {
        ch.postMessage({ type: 'STATE_UPDATED', state });
      }
    }
  } catch (err) {
    console.error('Failed to save roulette state', err);
  }
}

/**
 * Broadcasts an explicit spin command across tabs and windows
 */
export function broadcastSpinCommand(winnerId: string, durationSec: number, nonce: number): void {
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage({
        type: 'SPIN_COMMAND',
        winnerId,
        durationSec,
        nonce,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn('BroadcastChannel error', err);
    }
  }
}

export function subscribeRouletteEvents(
  onStateUpdate: (state: RouletteState) => void,
  onSpinCommand?: (cmd: RouletteSpinCommand) => void
): () => void {
  const ch = getChannel();

  const handleMessage = (event: MessageEvent) => {
    if (event.data) {
      if (event.data.type === 'STATE_UPDATED' && event.data.state) {
        onStateUpdate(event.data.state);
      } else if (event.data.type === 'SPIN_COMMAND' && onSpinCommand) {
        onSpinCommand(event.data);
      }
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        onStateUpdate(parsed);
      } catch {
        // ignore
      }
    }
  };

  if (ch) {
    ch.addEventListener('message', handleMessage);
  }
  window.addEventListener('storage', handleStorage);

  return () => {
    if (ch) {
      ch.removeEventListener('message', handleMessage);
    }
    window.removeEventListener('storage', handleStorage);
  };
}

export function subscribeRouletteState(callback: (state: RouletteState) => void): () => void {
  return subscribeRouletteEvents(callback);
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file and extracts participant entries.
 * Tolerates columns named "Nombre", "Piloto", "Participante", "Name", "Numero", "Nro", "Empresa", "Area", etc.
 */
export async function parseExcelParticipants(file: File): Promise<RouletteParticipant[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to array of objects
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  const parsed: RouletteParticipant[] = [];

  rawRows.forEach((row, idx) => {
    let nameVal = '';
    let numVal = '';
    let compVal = '';
    let divVal = '';

    for (const [key, val] of Object.entries(row)) {
      const normKey = key.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const strVal = String(val).trim();

      if (!nameVal && (normKey.includes('nombre') || normKey.includes('piloto') || normKey.includes('participante') || normKey.includes('name'))) {
        nameVal = strVal;
      } else if (!numVal && (normKey === 'nro' || normKey === 'n°' || normKey === 'no' || normKey === 'numero' || normKey === 'num' || normKey.includes('dorsal'))) {
        numVal = strVal;
      } else if (!compVal && (normKey.includes('empresa') || normKey.includes('equipo') || normKey.includes('team') || normKey.includes('compania') || normKey.includes('area'))) {
        compVal = strVal;
      } else if (!divVal && (normKey.includes('division') || normKey.includes('categoria'))) {
        divVal = strVal;
      }
    }

    // Fallback: If no column header matched, try first string cell with meaningful length
    if (!nameVal) {
      for (const val of Object.values(row)) {
        const strVal = String(val).trim();
        if (strVal.length >= 3 && isNaN(Number(strVal))) {
          nameVal = strVal;
          break;
        }
      }
    }

    if (nameVal) {
      const cleanNum = numVal ? (numVal.startsWith('#') ? numVal : `#${numVal}`) : `#${String(idx + 1).padStart(2, '0')}`;
      parsed.push({
        id: `p-${idx + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: nameVal,
        shortName: formatShortName(nameVal),
        number: cleanNum,
        company: compVal || 'Participante',
        division: divVal || undefined,
      });
    }
  });

  return parsed;
}

/**
 * Generates and downloads a sample Excel template for participants
 */
export function downloadSampleExcelTemplate(): void {
  const sampleData = [
    { 'N°': '01', 'Nombre y Apellido': 'Daniel Tapia', 'Empresa / Área': 'Litoral', 'División': 'Dx' },
    { 'N°': '02', 'Nombre y Apellido': 'Sabino Cruz', 'Empresa / Área': 'Chilquinta Dx', 'División': 'Dx' },
    { 'N°': '03', 'Nombre y Apellido': 'José Vivanco', 'Empresa / Área': 'Luz Parral', 'División': 'Dx' },
    { 'N°': '04', 'Nombre y Apellido': 'Bryan Álvarez', 'Empresa / Área': 'Chilquinta Dx', 'División': 'Dx' },
    { 'N°': '05', 'Nombre y Apellido': 'Emiliano Pastén', 'Empresa / Área': 'Chilquinta Dx', 'División': 'Dx' },
    { 'N°': '06', 'Nombre y Apellido': 'Erick Tapia', 'Empresa / Área': 'Chilquinta Dx', 'División': 'Dx' },
    { 'N°': '07', 'Nombre y Apellido': 'Matías Contreras', 'Empresa / Área': 'Luz Parral', 'División': 'Dx' },
    { 'N°': '08', 'Nombre y Apellido': 'Alejandro Moraga', 'Empresa / Área': 'Luz Linares', 'División': 'Dx' },
    { 'N°': '09', 'Nombre y Apellido': 'David Chávez', 'Empresa / Área': 'Tecmored', 'División': 'Tx' },
    { 'N°': '10', 'Nombre y Apellido': 'Rodrigo Pizarro', 'Empresa / Área': 'Tecmored', 'División': 'Tx' },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Participantes');
  XLSX.writeFile(wb, 'Plantilla_Ruleta_Participantes.xlsx');
}

/**
 * Exports winners history to an Excel file
 */
export function exportWinnersToExcel(winners: RouletteWinner[]): void {
  const rows = winners.map((w, idx) => ({
    'Lugar': `${idx + 1}°`,
    'N°': w.participant.number || '',
    'Ganador': w.participant.name,
    'Empresa / Área': w.participant.company || '',
    'División': w.participant.division || '',
    'Premio Sorteado': w.prizeTitle,
    'Fecha y Hora': new Date(w.timestamp).toLocaleString('es-CL'),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ganadores Sorteo');
  XLSX.writeFile(wb, `Ganadores_Ruleta_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

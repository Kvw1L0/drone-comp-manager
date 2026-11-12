import * as XLSX from 'xlsx';
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

const STORAGE_KEY = 'drone_comp_tombola_194_v1';
const CHANNEL_NAME = 'drone_tombola_194_channel_v1';

/**
 * Generates numbered participants from 1 to `count` (default 194)
 */
export function generateNumberedParticipants(count = 194): RouletteParticipant[] {
  const list: RouletteParticipant[] = [];
  for (let i = 1; i <= count; i++) {
    const formattedNum = String(i).padStart(3, '0');
    list.push({
      id: `num-${i}`,
      name: `Número ${i}`,
      shortName: `N° ${i}`,
      number: `#${formattedNum}`,
      company: 'Tómbola Oficial',
      division: undefined,
    });
  }
  return list;
}

export function getDefaultRouletteParticipants(): RouletteParticipant[] {
  return generateNumberedParticipants(194);
}

export function getDefaultRouletteState(): RouletteState {
  return {
    participants: generateNumberedParticipants(194),
    winners: [],
    prizeTitle: 'TÓMBOLA OFICIAL • NÚMEROS 1 AL 194',
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
      parsed.participants = generateNumberedParticipants(194);
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
 * Broadcasts an explicit spin command across tabs and windows, and also dispatches locally in the same window
 */
export function broadcastSpinCommand(winnerId: string, durationSec: number, nonce: number): void {
  if (typeof window === 'undefined') return;

  const eventPayload: RouletteSpinCommand = {
    type: 'SPIN_COMMAND',
    winnerId,
    durationSec,
    nonce,
    timestamp: Date.now(),
  };

  // 1. Same-window dispatch (so local carousels in the current window react immediately)
  try {
    window.dispatchEvent(
      new CustomEvent('ROULETTE_SPIN_COMMAND', {
        detail: eventPayload,
      })
    );
  } catch (err) {
    console.warn('CustomEvent dispatch error', err);
  }

  // 2. Cross-window / tab dispatch via BroadcastChannel
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage(eventPayload);
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

  const handleChannelMessage = (event: MessageEvent) => {
    if (event.data) {
      if (event.data.type === 'STATE_UPDATED' && event.data.state) {
        onStateUpdate(event.data.state);
      } else if (event.data.type === 'SPIN_COMMAND' && onSpinCommand) {
        onSpinCommand(event.data);
      }
    }
  };

  const handleCustomEvent = (event: Event) => {
    const customEv = event as CustomEvent<RouletteSpinCommand>;
    if (customEv.detail && onSpinCommand) {
      onSpinCommand(customEv.detail);
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
    ch.addEventListener('message', handleChannelMessage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('ROULETTE_SPIN_COMMAND', handleCustomEvent);
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    if (ch) {
      ch.removeEventListener('message', handleChannelMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('ROULETTE_SPIN_COMMAND', handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
    }
  };
}

export function subscribeRouletteState(callback: (state: RouletteState) => void): () => void {
  return subscribeRouletteEvents(callback);
}

/**
 * Resets the tombola completely to clean numbers 1 to 194 with 0 winners
 */
export function resetTombolaTo194(): RouletteState {
  const fresh = getDefaultRouletteState();
  saveRouletteState(fresh, true);
  return fresh;
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
      const cleanNum = numVal ? (numVal.startsWith('#') ? numVal : `#${numVal}`) : `#${String(idx + 1).padStart(3, '0')}`;
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
 * Generates and downloads a sample Excel template with 194 numbered participants
 */
export function downloadSampleExcelTemplate(): void {
  const sampleData: Array<Record<string, string>> = [];
  for (let i = 1; i <= 194; i++) {
    sampleData.push({
      'N°': String(i).padStart(3, '0'),
      'Nombre y Apellido': `Número ${i}`,
      'Empresa / Área': 'Tómbola Oficial',
      'División': '',
    });
  }

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Numeros_1_al_194');
  XLSX.writeFile(wb, 'Plantilla_Tombola_1_al_194.xlsx');
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
  XLSX.writeFile(wb, `Ganadores_Tombola_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

import {
  AccreditationRequirement,
  AccreditationStatus,
  EvaluationTest,
  Participant,
  RankingRow,
} from '../types/domain';
import { formatMsToTime, formatScore, normalizeSearchText } from './scoring';

export interface CsvParticipantPreviewRow {
  rowNumber: number;
  id: string;
  fullName: string;
  companyOrTeam: string;
  competitorNumber: string;
  accreditationStatus: AccreditationStatus;
  internalNotes: string;
  isValid: boolean;
  isExactDuplicate: boolean;
  isHomonymWarning: boolean;
  errors: string[];
  warnings: string[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseAndValidateParticipantsCsv(
  csvText: string,
  existingParticipants: Participant[]
): {
  rows: CsvParticipantPreviewRow[];
  validCount: number;
  errorCount: number;
  homonymCount: number;
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, homonymCount: 0 };
  }

  // Check if first line is header
  const firstCols = parseCsvLine(lines[0]).map((c) => normalizeSearchText(c));
  const hasHeader =
    firstCols.some((c) => c.includes('nombre') || c.includes('id') || c.includes('empresa'));

  const dataLines = hasHeader ? lines.slice(1) : lines;

  const existingIds = new Set(existingParticipants.map((p) => p.id.toUpperCase()));
  const existingCompositeKeys = new Set(
    existingParticipants.map(
      (p) =>
        `${p.normalizedName}|${normalizeSearchText(p.companyOrTeam)}|${normalizeSearchText(
          p.competitorNumber
        )}`
    )
  );
  const existingNames = new Map<string, Participant[]>();
  for (const p of existingParticipants) {
    const list = existingNames.get(p.normalizedName) || [];
    list.push(p);
    existingNames.set(p.normalizedName, list);
  }

  const seenIdsInCsv = new Set<string>();
  const seenCompositesInCsv = new Set<string>();
  const seenNamesInCsv = new Map<string, { id: string; company: string; number: string }[]>();

  const rows: CsvParticipantPreviewRow[] = [];
  let validCount = 0;
  let errorCount = 0;
  let homonymCount = 0;

  dataLines.forEach((line, index) => {
    const cols = parseCsvLine(line);
    const rowNumber = hasHeader ? index + 2 : index + 1;

    const rawId = (cols[0] || '').trim();
    const fullName = (cols[1] || '').trim();
    const companyOrTeam = (cols[2] || '').trim();
    const competitorNumber = (cols[3] || '').trim();
    const rawStatus = normalizeSearchText(cols[4] || 'pendiente');
    const internalNotes = (cols[5] || '').trim();

    const id =
      rawId ||
      `PIL-${String(existingParticipants.length + index + 1).padStart(3, '0')}`;

    const errors: string[] = [];
    const warnings: string[] = [];
    let isExactDuplicate = false;
    let isHomonymWarning = false;

    if (!fullName) {
      errors.push('El nombre completo es obligatorio.');
    }

    let accreditationStatus: AccreditationStatus = 'pendiente';
    if (rawStatus === 'habilitado' || rawStatus === 'acreditado') {
      accreditationStatus = 'habilitado';
    } else if (rawStatus === 'rechazado') {
      accreditationStatus = 'rechazado';
    } else if (rawStatus === '' || rawStatus === 'pendiente') {
      accreditationStatus = 'pendiente';
    } else {
      warnings.push(
        `Estado "${cols[4]}" no reconocido; se asignará "pendiente".`
      );
    }

    const upperId = id.toUpperCase();
    const normName = normalizeSearchText(fullName);
    const normCompany = normalizeSearchText(companyOrTeam);
    const normNumber = normalizeSearchText(competitorNumber);
    const compositeKey = `${normName}|${normCompany}|${normNumber}`;

    // 1. Check ID duplicate
    if (existingIds.has(upperId)) {
      isExactDuplicate = true;
      errors.push(`El identificador interno "${id}" ya existe en el evento.`);
    } else if (seenIdsInCsv.has(upperId)) {
      isExactDuplicate = true;
      errors.push(`El identificador interno "${id}" está repetido dentro del archivo CSV.`);
    }

    // 2. Check exact composite duplicate (same name + same company + same competitor number)
    if (normName) {
      if (existingCompositeKeys.has(compositeKey)) {
        isExactDuplicate = true;
        errors.push(
          `Registro duplicado exacto: ya existe "${fullName}" con la misma empresa ("${
            companyOrTeam || 'Sin empresa'
          }") y número ("${competitorNumber || 'Sin número'}").`
        );
      } else if (seenCompositesInCsv.has(compositeKey)) {
        isExactDuplicate = true;
        errors.push(
          `Registro duplicado en el CSV: "${fullName}" aparece dos veces con misma empresa y número.`
        );
      }
    }

    // 3. Check homonyms (same normalized name, but different company or competitor number!)
    // Do NOT block homonyms unless both company AND number are empty and indistinguishable.
    if (normName && !isExactDuplicate) {
      const existingSameName = existingNames.get(normName) || [];
      const csvSameName = seenNamesInCsv.get(normName) || [];

      if (existingSameName.length > 0 || csvSameName.length > 0) {
        if (!normCompany && !normNumber) {
          errors.push(
            `Participante homónimo ("${fullName}") sin empresa ni número de competidor para distinguirlo.`
          );
        } else {
          isHomonymWarning = true;
          warnings.push(
            `Homónimo detectado ("${fullName}"): se distinguirá en búsqueda por empresa (${
              companyOrTeam || '—'
            }) y número (${competitorNumber || '—'}).`
          );
        }
      }
    }

    seenIdsInCsv.add(upperId);
    if (normName) {
      seenCompositesInCsv.add(compositeKey);
      const list = seenNamesInCsv.get(normName) || [];
      list.push({ id, company: companyOrTeam, number: competitorNumber });
      seenNamesInCsv.set(normName, list);
    }

    const isValid = errors.length === 0;
    if (isValid) validCount++;
    else errorCount++;
    if (isHomonymWarning) homonymCount++;

    rows.push({
      rowNumber,
      id,
      fullName,
      companyOrTeam,
      competitorNumber,
      accreditationStatus,
      internalNotes,
      isValid,
      isExactDuplicate,
      isHomonymWarning,
      errors,
      warnings,
    });
  });

  return { rows, validCount, errorCount, homonymCount };
}

export function buildParticipantFromCsvRow(
  row: CsvParticipantPreviewRow,
  eventId: string,
  requirements: AccreditationRequirement[]
): Participant {
  const now = Date.now();
  const checks: Record<string, boolean> = {};
  for (const req of requirements) {
    checks[req.id] = row.accreditationStatus === 'habilitado';
  }

  return {
    id: row.id,
    eventId,
    fullName: row.fullName,
    normalizedName: normalizeSearchText(row.fullName),
    companyOrTeam: row.companyOrTeam,
    competitorNumber: row.competitorNumber,
    accreditationStatus: row.accreditationStatus,
    requirementsChecks: checks,
    internalNotes: row.internalNotes,
    isDisqualified: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function generateRankingCsv(
  eventName: string,
  tests: EvaluationTest[],
  rows: RankingRow[]
): string {
  const sortedTests = [...tests].sort((a, b) => a.order - b.order);
  const headers = [
    'Posicion',
    'ID_Participante',
    'Numero',
    'Nombre_Completo',
    'Empresa_Equipo',
    'Estado_Acreditacion',
    'Estado_General',
    ...sortedTests.flatMap((t) => [
      `${t.name}_Estado`,
      `${t.name}_Tiempo_Efectivo`,
      `${t.name}_Puntaje_Neto`,
      `${t.name}_Aporte`,
    ]),
    'Total_General',
    'Pruebas_Completadas',
    'Observacion_Empate_O_DQ',
  ];

  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines = [headers.map(escapeCsv).join(',')];

  for (const r of rows) {
    const posStr = r.isDisqualified ? 'DQ' : r.position !== null ? String(r.position) : '—';
    const generalState = r.isDisqualified
      ? 'DESCALIFICADO (DQ)'
      : r.hasPendingTests
      ? 'EN CURSO (Pendiente)'
      : 'COMPLETADO';

    const testCols = sortedTests.flatMap((t) => {
      const cell = r.testCells[t.id];
      if (!cell || cell.status === 'pendiente') {
        return ['Pendiente', '—', '—', 'Pendiente'];
      }
      if (cell.status === 'dnf') {
        return ['DNF', '—', '0,00', 'DNF (0,00)'];
      }
      if (cell.status === 'dq') {
        return ['DQ', '—', '0,00', 'DQ (0,00)'];
      }
      return [
        'Completado',
        formatMsToTime(cell.effectiveTimeMs),
        formatScore(cell.netScore),
        formatScore(cell.contribution),
      ];
    });

    const note = r.isDisqualified
      ? `DQ: ${r.disqualificationReason || 'Sin motivo'}`
      : r.hasPendingTie
      ? 'Desempate pendiente'
      : r.tieResolutionReason
      ? `Desempate resuelto: ${r.tieResolutionReason}`
      : '';

    const rowValues = [
      posStr,
      r.participantId,
      r.competitorNumber || '—',
      r.fullName,
      r.companyOrTeam || '—',
      r.accreditationStatus,
      generalState,
      ...testCols,
      formatScore(r.totalContribution),
      `${r.completedTestsCount}/${r.totalTestsCount}`,
      note,
    ];

    lines.push(rowValues.map(escapeCsv).join(','));
  }

  return `\uFEFF# Evento: ${eventName}\n` + lines.join('\n');
}

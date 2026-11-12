import * as XLSX from 'xlsx';
import { EvaluationTest, RankingRow } from '../types/domain';
import { formatMsToTime, filterAndRankByDivision } from './scoring';

export interface ExportRankingExcelOptions {
  eventName: string;
  tests: EvaluationTest[];
  rows: RankingRow[];
}

/**
 * Automatically computes column widths so contents are never truncated in Excel
 */
function computeAutoColWidths(data: Array<Record<string, string | number>>): Array<{ wch: number }> {
  if (!data || data.length === 0) return [];
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    for (const row of data) {
      const val = row[key];
      if (val !== undefined && val !== null) {
        const len = String(val).length;
        if (len > maxLen) {
          maxLen = len;
        }
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
}

/**
 * Builds table rows for an Excel worksheet from ranking rows
 */
function buildWorksheetData(
  rows: RankingRow[],
  sortedTests: EvaluationTest[],
  testHasTimeMap: Map<string, boolean>,
  options?: { isDivisionSpecific?: boolean }
): Array<Record<string, string | number>> {
  return rows.map((r, idx) => {
    // Determine position
    const pos = r.isDisqualified
      ? 'DQ'
      : options?.isDivisionSpecific && r.divisionPosition
      ? r.divisionPosition
      : r.position !== null
      ? r.position
      : idx + 1;

    // Total accumulated time
    let totalTimeMs = 0;
    let hasAnyTime = false;
    for (const t of sortedTests) {
      const c = r.testCells[t.id];
      if (c && c.status === 'completado' && c.effectiveTimeMs !== null && c.effectiveTimeMs > 0) {
        totalTimeMs += c.effectiveTimeMs;
        hasAnyTime = true;
      }
    }

    const rowObj: Record<string, string | number> = {
      'Lugar': pos,
      'N° Piloto': r.competitorNumber || '—',
      'Nombre y Apellidos': r.fullName,
      'Empresa / Área': r.companyOrTeam || '—',
      'División': r.teamDivision === 'transmision' ? 'Transmisión' : 'Distribución',
    };

    // Columns per test
    for (const t of sortedTests) {
      const cell = r.testCells[t.id];
      const hasTime = testHasTimeMap.get(t.id) ?? false;
      const tName = t.name;

      if (hasTime) {
        if (!cell || cell.status === 'pendiente') {
          rowObj[`${tName} (Tiempo)`] = '—';
          rowObj[`${tName} (Pts)`] = 'Pendiente';
        } else if (cell.status === 'dnf') {
          rowObj[`${tName} (Tiempo)`] = 'DNF';
          rowObj[`${tName} (Pts)`] = 0;
        } else if (cell.status === 'dq') {
          rowObj[`${tName} (Tiempo)`] = 'DQ';
          rowObj[`${tName} (Pts)`] = 0;
        } else {
          rowObj[`${tName} (Tiempo)`] =
            cell.effectiveTimeMs !== null ? formatMsToTime(cell.effectiveTimeMs) : '—';
          rowObj[`${tName} (Pts)`] = Number((cell.contribution ?? 0).toFixed(2));
        }
      } else {
        if (!cell || cell.status === 'pendiente') {
          rowObj[`${tName} (Pts)`] = 'Pendiente';
        } else if (cell.status === 'dnf') {
          rowObj[`${tName} (Pts)`] = 0;
        } else if (cell.status === 'dq') {
          rowObj[`${tName} (Pts)`] = 0;
        } else {
          rowObj[`${tName} (Pts)`] = Number((cell.contribution ?? 0).toFixed(2));
        }
      }
    }

    // Totals and metadata
    rowObj['Tiempo Total Acumulado'] = hasAnyTime ? formatMsToTime(totalTimeMs) : '—';
    rowObj['Puntaje Total (PTS)'] = Number((r.totalContribution ?? 0).toFixed(2));
    rowObj['Pruebas Completadas'] = `${r.completedTestsCount}/${r.totalTestsCount}`;
    rowObj['Estado General'] = r.isDisqualified
      ? 'DESCALIFICADO (DQ)'
      : r.hasPendingTests
      ? 'EN CURSO (Pendiente)'
      : 'COMPLETADO';

    const obs = r.isDisqualified
      ? `DQ: ${r.disqualificationReason || 'Descalificación oficial'}`
      : r.hasPendingTie
      ? 'Desempate pendiente'
      : r.tieResolutionReason
      ? `Desempate resuelto: ${r.tieResolutionReason}`
      : '';
    rowObj['Observaciones'] = obs;

    return rowObj;
  });
}

/**
 * Creates and downloads a multi-tab Excel (.xlsx) workbook of the competition ranking:
 * - Tab 1: Ranking General (todos los pilotos ordenados por lugar)
 * - Tab 2: Top 10 Distribución
 * - Tab 3: Top 10 Transmisión
 * - Tab 4: Equipo Distribución (nómina completa)
 * - Tab 5: Equipo Transmisión (nómina completa)
 */
export function exportRankingToExcel({
  eventName,
  tests,
  rows,
}: ExportRankingExcelOptions): string {
  const sortedTests = [...tests].sort((a, b) => a.order - b.order);

  // Map tests that record time or have at least one time recorded
  const testHasTimeMap = new Map<string, boolean>();
  for (const t of sortedTests) {
    const hasTime =
      t.scoringMethod === 'time_calculated' ||
      rows.some((r) => {
        const c = r.testCells[t.id];
        return c && c.effectiveTimeMs !== null && c.effectiveTimeMs > 0;
      });
    testHasTimeMap.set(t.id, hasTime);
  }

  const wb = XLSX.utils.book_new();

  // 1. Sheet: Ranking General
  const generalData = buildWorksheetData(rows, sortedTests, testHasTimeMap);
  const wsGeneral = XLSX.utils.json_to_sheet(generalData);
  wsGeneral['!cols'] = computeAutoColWidths(generalData);
  XLSX.utils.book_append_sheet(wb, wsGeneral, 'Ranking General');

  // 2. Sheet: Top 10 Distribución
  const distRows = filterAndRankByDivision(rows, 'distribucion');
  const top10Dist = distRows.slice(0, 10);
  const top10DistData = buildWorksheetData(top10Dist, sortedTests, testHasTimeMap, {
    isDivisionSpecific: true,
  });
  const wsTop10Dist = XLSX.utils.json_to_sheet(top10DistData);
  wsTop10Dist['!cols'] = computeAutoColWidths(top10DistData);
  XLSX.utils.book_append_sheet(wb, wsTop10Dist, 'Top 10 Distribución');

  // 3. Sheet: Top 10 Transmisión
  const transRows = filterAndRankByDivision(rows, 'transmision');
  const top10Trans = transRows.slice(0, 10);
  const top10TransData = buildWorksheetData(top10Trans, sortedTests, testHasTimeMap, {
    isDivisionSpecific: true,
  });
  const wsTop10Trans = XLSX.utils.json_to_sheet(top10TransData);
  wsTop10Trans['!cols'] = computeAutoColWidths(top10TransData);
  XLSX.utils.book_append_sheet(wb, wsTop10Trans, 'Top 10 Transmisión');

  // 4. Sheet: Equipo Distribución (todos)
  const allDistData = buildWorksheetData(distRows, sortedTests, testHasTimeMap, {
    isDivisionSpecific: true,
  });
  const wsAllDist = XLSX.utils.json_to_sheet(allDistData);
  wsAllDist['!cols'] = computeAutoColWidths(allDistData);
  XLSX.utils.book_append_sheet(wb, wsAllDist, 'Equipo Distribución');

  // 5. Sheet: Equipo Transmisión (todos)
  const allTransData = buildWorksheetData(transRows, sortedTests, testHasTimeMap, {
    isDivisionSpecific: true,
  });
  const wsAllTrans = XLSX.utils.json_to_sheet(allTransData);
  wsAllTrans['!cols'] = computeAutoColWidths(allTransData);
  XLSX.utils.book_append_sheet(wb, wsAllTrans, 'Equipo Transmisión');

  // File name
  const safeName = (eventName || 'Competencia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Ranking_${safeName}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
  return fileName;
}

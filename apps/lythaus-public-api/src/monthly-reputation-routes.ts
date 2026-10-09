import type { Client } from 'pg';
import { classifyPublicError } from './auth-runtime-policy.ts';
import { readOwnMonthlyReputationReport } from '../../../packages/db/src/monthly-reputation-report.ts';
import { readOwnMonthlyRewardSnapshot } from '../../../packages/db/src/monthly-reward-snapshots.ts';
import { readOwnMonthlyRewardSelections } from '../../../packages/db/src/monthly-reward-selections.ts';
import { requireSourceMonth } from '../../../packages/contracts/src/monthly-reputation-policy.ts';
import { serializeMonthlyReputationReportCsv } from './monthly-reputation-report-export.ts';
import { monthlyRewardsResponseReadiness } from '../../../packages/contracts/src/monthly-rewards-response-readiness.ts';

export interface MonthlyReputationRouteDependencies {
  authenticate: (request: Request) => Promise<{ userId: string }>;
  transaction: <T>(work: (client: Client) => Promise<T>) => Promise<T>;
  snapshotRulesVersion?: string;
  selectionRulesVersion?: string;
  respond: (body: unknown, status: number, headers?: HeadersInit) => Response;
}

function privateResponse(dependencies: MonthlyReputationRouteDependencies, body: unknown,
  status: number, headers: HeadersInit = {}): Response {
  const response = dependencies.respond(body, status, headers);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}

function monthlyJsonResponse(dependencies: MonthlyReputationRouteDependencies, body: object): Response {
  return privateResponse(dependencies, { ...body,
    responsePreparation: monthlyRewardsResponseReadiness(), preparedResponse: null,
  }, 200, { 'content-type': 'application/json; charset=utf-8' });
}

function errorResponse(dependencies: MonthlyReputationRouteDependencies, error: unknown): Response {
  const code = error instanceof Error ? error.message : '';
  if (code === 'monthly_reputation_source_month_invalid' || code === 'monthly_reputation_effective_month_invalid') {
    return privateResponse(dependencies, { error: code }, 400);
  }
  const classified = classifyPublicError(error);
  return privateResponse(dependencies, { error: classified.exposedCode }, classified.status);
}

function routeMatch(request: Request) {
  if (request.method !== 'GET') return undefined;
  const pathname = new URL(request.url).pathname;
  const csv = pathname.match(/^\/api\/reputation\/me\/reports\/monthly\/([^/]+)\/export\.csv$/);
  if (csv) return { kind: 'csv' as const, sourceMonth: csv[1] };
  const report = pathname.match(/^\/api\/reputation\/me\/reports\/monthly\/([^/]+)$/);
  if (report) return { kind: 'report' as const, sourceMonth: report[1] };
  if (pathname === '/api/rewards/me/monthly') return { kind: 'rewards' as const };
  return undefined;
}

export async function handleMonthlyReputationRead(request: Request,
  dependencies: MonthlyReputationRouteDependencies): Promise<Response | undefined> {
  const route = routeMatch(request);
  if (!route) return undefined;
  try {
    const principal = await dependencies.authenticate(request);
    if (route.kind === 'report' || route.kind === 'csv') {
      let sourceMonth: string;
      try { sourceMonth = decodeURIComponent(route.sourceMonth); }
      catch { throw new Error('monthly_reputation_source_month_invalid'); }
      requireSourceMonth(sourceMonth);
      const format = new URL(request.url).searchParams.get('format');
      if ((route.kind === 'csv' && format !== null)
        || (route.kind === 'report' && format !== null && format !== 'json')) {
        throw new Error('monthly_report_format_invalid');
      }
      const report = await dependencies.transaction(client => readOwnMonthlyReputationReport(client, {
        subjectId: principal.userId,
        sourceMonth,
        snapshotRulesVersion: dependencies.snapshotRulesVersion,
      }));
      if (route.kind === 'csv') {
        return privateResponse(dependencies, serializeMonthlyReputationReportCsv(report), 200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="monthly-reputation-${sourceMonth}.csv"`,
        });
      }
      return monthlyJsonResponse(dependencies, report);
    }

    // No configured server rules means no monthly-reward table reads. In particular,
    // owner identity and score values never come from query or body parameters.
    if (!dependencies.snapshotRulesVersion || !dependencies.selectionRulesVersion) {
      return monthlyJsonResponse(dependencies, {
        state: 'pending', reasonCode: 'approval_unavailable', effectiveMonth: null,
        currentLevel: null, sourceMonth: null, sourceScore: null,
        snapshot: { state: 'unavailable', reasonCode: 'approval_unavailable' },
        selection: { state: 'unavailable', reasonCode: 'approval_unavailable' },
      });
    }
    const monthly = await dependencies.transaction(async client => {
      const selection = await readOwnMonthlyRewardSelections(client, {
        subjectId: principal.userId,
        rulesVersion: dependencies.selectionRulesVersion,
      });
      // The selection reader acquires the member and reputation-period locks before
      // resolving its snapshot. Keep the standalone level projection inside that
      // same transaction and after those locks so both projections share a revision.
      const snapshot = await readOwnMonthlyRewardSnapshot(client, {
        subjectId: principal.userId,
        rulesVersion: dependencies.snapshotRulesVersion,
      });
      return { snapshot, selection };
    });
    const ready = monthly.snapshot.state === 'confirmed' && monthly.selection.state === 'ready';
    return monthlyJsonResponse(dependencies, {
      state: ready ? 'ready' : 'pending',
      reasonCode: ready ? null : monthly.selection.reasonCode ?? monthly.snapshot.reasonCode ?? 'approval_unavailable',
      effectiveMonth: monthly.snapshot.effectiveMonth ?? monthly.selection.effectiveMonth ?? null,
      currentLevel: monthly.snapshot.level ?? null,
      sourceMonth: monthly.snapshot.sourceMonth ?? null,
      sourceScore: monthly.snapshot.sourceScore ?? null,
      snapshot: monthly.snapshot,
      selection: monthly.selection,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'monthly_report_format_invalid') {
      return privateResponse(dependencies, { error: error.message }, 400);
    }
    return errorResponse(dependencies, error);
  }
}

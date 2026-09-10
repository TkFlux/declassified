import path from 'path';
import type { Agency, DraftRow, RecordFilters, RecordRow } from './types';
import { isReadOnly } from './mode';
import {
  getAgenciesJson,
  getAgenciesJsonAsync,
  getRecordByIdJson,
  getRecordByIdJsonAsync,
  queryRecordsJson,
  queryRecordsJsonAsync,
} from './json-store';

export { isReadOnly, READ_ONLY_BANNER } from './mode';

type DbModule = typeof import('./db');

let _dbMod: DbModule | null = null;

/**
 * Load better-sqlite3-backed db only when not read-only.
 * Uses eval('require') so webpack/NFT do not statically pull native sqlite
 * into Vercel serverless traces.
 */
function loadDb(): DbModule {
  if (_dbMod) return _dbMod;
  const g = globalThis as {
    __non_webpack_require__?: NodeRequire;
  };
  const req: NodeRequire =
    typeof g.__non_webpack_require__ === 'function'
      ? g.__non_webpack_require__
      : // eslint-disable-next-line no-eval, @typescript-eslint/no-unsafe-call
        (eval('require') as NodeRequire);

  try {
    _dbMod = req(path.join(__dirname, 'db')) as DbModule;
  } catch {
    _dbMod = req(path.join(process.cwd(), 'src/lib/db')) as DbModule;
  }
  return _dbMod;
}

export function queryRecords(filters: RecordFilters = {}): {
  rows: RecordRow[];
  total: number;
} {
  if (isReadOnly()) return queryRecordsJson(filters);
  try {
    return loadDb().queryRecords(filters);
  } catch {
    return queryRecordsJson(filters);
  }
}

export async function queryRecordsAsync(filters: RecordFilters = {}): Promise<{
  rows: RecordRow[];
  total: number;
}> {
  if (isReadOnly()) return queryRecordsJsonAsync(filters);
  try {
    return loadDb().queryRecords(filters);
  } catch {
    return queryRecordsJsonAsync(filters);
  }
}

export function getRecordById(id: string): RecordRow | undefined {
  if (isReadOnly()) return getRecordByIdJson(id);
  try {
    return loadDb().getRecordById(id);
  } catch {
    return getRecordByIdJson(id);
  }
}

export async function getRecordByIdAsync(
  id: string
): Promise<RecordRow | undefined> {
  if (isReadOnly()) return getRecordByIdJsonAsync(id);
  try {
    return loadDb().getRecordById(id);
  } catch {
    return getRecordByIdJsonAsync(id);
  }
}

export function getAgencies(): string[] {
  if (isReadOnly()) return getAgenciesJson();
  try {
    return loadDb().getAgencies();
  } catch {
    return getAgenciesJson();
  }
}

export async function getAgenciesAsync(): Promise<string[]> {
  if (isReadOnly()) return getAgenciesJsonAsync();
  try {
    return loadDb().getAgencies();
  } catch {
    return getAgenciesJsonAsync();
  }
}

export function createDraft(recordId: string, text: string): DraftRow {
  if (isReadOnly()) {
    throw new Error(
      'Drafts are disabled on this read-only deploy. Run locally to use Draft for X.'
    );
  }
  return loadDb().createDraft(recordId, text);
}

export function listDrafts(status?: string): Array<
  DraftRow & { title: string; source_url: string; agency: Agency }
> {
  if (isReadOnly()) return [];
  return loadDb().listDrafts(status);
}

export function updateDraftStatus(
  id: number,
  status: 'pending' | 'approved' | 'rejected'
): DraftRow | undefined {
  if (isReadOnly()) {
    throw new Error(
      'Drafts are disabled on this read-only deploy. Run locally to use Draft for X.'
    );
  }
  return loadDb().updateDraftStatus(id, status);
}

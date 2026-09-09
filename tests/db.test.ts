import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getDb,
  migrate,
  upsertRecord,
  queryRecords,
  createDraft,
  listDrafts,
  updateDraftStatus,
  resetDbConnection,
  closeDb,
} from '../src/lib/db';
import { buildTweetDraft } from '../src/lib/draft-text';
import { stripHtml, slugId } from '../src/lib/http';

const tmpDb = path.join(
  os.tmpdir(),
  `declassified-test-${process.pid}-${Date.now()}.db`
);

test.before(() => {
  process.env.DATABASE_PATH = tmpDb;
  resetDbConnection();
  getDb();
});

test.after(() => {
  closeDb();
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(tmpDb + '-wal');
    fs.unlinkSync(tmpDb + '-shm');
  } catch {
    /* ignore */
  }
});

test('migrate creates records and drafts tables', () => {
  const db = getDb();
  migrate(db);
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    )
    .all() as Array<{ name: string }>;
  const names = tables.map((t) => t.name);
  assert.ok(names.includes('records'));
  assert.ok(names.includes('drafts'));
  assert.ok(names.includes('crawl_runs'));
});

test('upsert and query records with filters', () => {
  upsertRecord({
    id: 't-cuba-1',
    title: 'CIA Reading Room: Cuba Collection',
    summary: 'Historical products concerning Cuba.',
    agency: 'CIA',
    source: 'test',
    source_url: 'https://example.com/cuba',
    download_url: null,
    thumbnail_url: null,
    published_at: '2025-01-01T00:00:00.000Z',
    raw_meta: null,
  });
  upsertRecord({
    id: 't-nara-1',
    title: 'NDC Cold War cables',
    summary: 'Diplomatic cables release.',
    agency: 'NDC',
    source: 'test',
    source_url: 'https://example.com/ndc',
    download_url: 'https://example.com/file.pdf',
    thumbnail_url: null,
    published_at: '2025-06-01T00:00:00.000Z',
    raw_meta: null,
  });

  const cuba = queryRecords({ q: 'Cuba', limit: 10, offset: 0 });
  assert.equal(cuba.total >= 1, true);
  assert.equal(cuba.rows[0].id, 't-cuba-1');

  const pageOnly = queryRecords({ download: 'page-only', limit: 50, offset: 0 });
  assert.ok(pageOnly.rows.some((r) => r.id === 't-cuba-1'));
  assert.ok(!pageOnly.rows.some((r) => r.id === 't-nara-1'));

  const available = queryRecords({
    download: 'available',
    limit: 50,
    offset: 0,
  });
  assert.ok(available.rows.some((r) => r.id === 't-nara-1'));
});

test('draft queue create and status update', () => {
  const draft = createDraft(
    't-cuba-1',
    'Test draft about Cuba\n\nhttps://example.com/cuba'
  );
  assert.equal(draft.status, 'pending');
  const pending = listDrafts('pending');
  assert.ok(pending.some((d) => d.id === draft.id));

  const updated = updateDraftStatus(draft.id, 'approved');
  assert.equal(updated?.status, 'approved');
});

test('buildTweetDraft keeps link and truncates', () => {
  const text = buildTweetDraft({
    id: 'x',
    title: 'A'.repeat(200),
    summary: 'B'.repeat(200),
    agency: 'FBI',
    source: 't',
    source_url: 'https://example.com/source',
    download_url: 'https://example.com/file.pdf',
    thumbnail_url: null,
    published_at: null,
    collected_at: new Date().toISOString(),
    raw_meta: null,
  });
  assert.ok(text.includes('https://example.com/file.pdf'));
  assert.ok(text.length <= 280);
});

test('stripHtml and slugId helpers', () => {
  assert.equal(stripHtml('<b>Hello&nbsp;World</b>'), 'Hello World');
  assert.equal(slugId('fbi', 'https://vault.fbi.gov/x'), slugId('fbi', 'https://vault.fbi.gov/x'));
  assert.notEqual(slugId('fbi', 'a'), slugId('fbi', 'b'));
});

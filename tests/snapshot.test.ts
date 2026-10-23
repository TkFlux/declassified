import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { RecordRow } from '../src/lib/types';
import {
  mergeSnapshot,
  readPackedStrict,
  writePacked,
  partName,
} from '../src/lib/snapshot';
import { buildRecords } from '../scripts/build-records';
import { loadJsonRecords, queryRecordsJson, resetJsonCache } from '../src/lib/json-store';

const rec = (id: string, extra: Partial<RecordRow> = {}): RecordRow => ({
  id,
  title: id,
  summary: 's',
  agency: 'FBI',
  source: 'fbi-vault-sitemap',
  source_url: `https://vault.fbi.gov/${id}/view`,
  download_url: null,
  thumbnail_url: null,
  published_at: '2026-10-01T00:00:00.000Z',
  collected_at: '2026-10-01T00:00:00.000Z',
  raw_meta: null,
  ...extra,
});

function tmp(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('crawl is merged: new added, existing updated, missing kept', () => {
  const existing = [
    rec('old', { first_seen: '2026-09-01T00:00:00.000Z' }),
    rec('shared', {
      title: 'Old title',
      download_url: 'https://vault.fbi.gov/shared/at_download/file',
      first_seen: '2026-09-01T00:00:00.000Z',
    }),
  ];
  const crawl = [rec('shared', { title: 'New title' }), rec('new')];
  const seenAt = '2026-10-22T00:00:00.000Z';
  const r = mergeSnapshot(existing, crawl, { seenAt });
  assert.deepEqual(r.records.map((x) => x.id).sort(), ['new', 'old', 'shared']);
  assert.deepEqual(r.added, ['new']);
  assert.deepEqual(r.updated, ['shared']);
  assert.deepEqual(r.kept, ['old']);
  const shared = r.records.find((x) => x.id === 'shared')!;
  assert.equal(shared.title, 'New title');
  assert.equal(shared.download_url, 'https://vault.fbi.gov/shared/at_download/file');
  assert.equal(shared.first_seen, '2026-09-01T00:00:00.000Z');
  assert.equal(shared.last_seen, seenAt);
  const added = r.records.find((x) => x.id === 'new')!;
  assert.equal(added.first_seen, seenAt);
  assert.equal(r.records.find((x) => x.id === 'old')!.last_seen, undefined);
});

test('new download_url replaces old; untrusted FBI links are never carried', () => {
  const r = mergeSnapshot(
    [
      rec('a', { download_url: 'https://vault.fbi.gov/a/old' }),
      rec('b', { download_url: 'https://fbijobs.gov/eeoc_policy.pdf' }),
    ],
    [rec('a', { download_url: 'https://vault.fbi.gov/a/new' }), rec('b')]
  );
  assert.equal(r.records.find((x) => x.id === 'a')!.download_url, 'https://vault.fbi.gov/a/new');
  assert.equal(r.records.find((x) => x.id === 'b')!.download_url, null);
});

test('records are only removed when explicitly listed', () => {
  const r = mergeSnapshot([rec('a'), rec('b')], [], { removed: new Set(['b', 'zzz']) });
  assert.deepEqual(r.records.map((x) => x.id), ['a']);
  assert.deepEqual(r.removed, ['b']);
});

test('pack/unpack round trip across many parts, stale parts deleted', (t) => {
  const dir = tmp(t);
  const many = Array.from({ length: 2500 }, (_, i) => rec(`id-${i}`, { summary: `x${i * 7919}` }));
  const w1 = writePacked(dir, many, 1000);
  assert.ok(w1.parts > 20, `expected >20 parts, got ${w1.parts}`);
  assert.equal(readPackedStrict(dir).length, 2500);
  const w2 = writePacked(dir, many.slice(0, 10), 1000);
  assert.ok(!fs.existsSync(path.join(dir, partName(w2.parts + 1))));
  assert.equal(readPackedStrict(dir).length, 10);
});

test('corrupt or missing parts abort the build without touching history', (t) => {
  const dir = tmp(t);
  writePacked(dir, [rec('a'), rec('b'), rec('c')], 50);
  fs.unlinkSync(path.join(dir, partName(2)));
  assert.throws(() => buildRecords(dir));
  writePacked(dir, [rec('a'), rec('b'), rec('c')], 50);
  fs.writeFileSync(path.join(dir, partName(1)), 'broken!!');
  assert.throws(() => buildRecords(dir));
});

test('buildRecords accumulates across successive crawls and is idempotent', (t) => {
  const dir = tmp(t);
  writePacked(dir, [rec('a'), rec('b')]);
  const line = (rows: RecordRow[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'export.jsonl'), line([rec('b'), rec('c')]));
  assert.equal(buildRecords(dir, { seenAt: '2026-10-22T00:00:00.000Z' }).records.length, 3);
  fs.writeFileSync(path.join(dir, 'export.jsonl'), line([rec('d')]));
  assert.equal(buildRecords(dir, { seenAt: '2026-10-26T00:00:00.000Z' }).records.length, 4);
  const before = fs.readFileSync(path.join(dir, partName(1)), 'utf8');
  fs.unlinkSync(path.join(dir, 'export.jsonl'));
  assert.equal(buildRecords(dir).records.length, 4);
  assert.equal(fs.readFileSync(path.join(dir, partName(1)), 'utf8'), before);
});

test('committed snapshot loads fully (count matches manifest, no 759 cap)', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data', 'snapshot-manifest.json'), 'utf8')
  ) as { records: number };
  resetJsonCache();
  assert.equal(loadJsonRecords(true).length, manifest.records);
  assert.equal(queryRecordsJson({ limit: 24 }).total, manifest.records);
  const last = queryRecordsJson({ limit: 100, offset: manifest.records - 5 });
  assert.equal(last.rows.length, 5);
});

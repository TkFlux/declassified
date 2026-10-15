import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import { buildRecords, readPackedHistory } from '../scripts/build-records';

const record = (id: string, extra = {}) => ({
  id, title: id, summary: 'Detailed historical description', agency: 'FBI',
  source: 'fbi-vault-sitemap', source_url: `https://vault.fbi.gov/${id}`,
  download_url: `https://vault.fbi.gov/${id}/@@download/file`, thumbnail_url: null,
  published_at: '2026-10-01T00:00:00.000Z', collected_at: '2026-10-01T00:00:00.000Z',
  raw_meta: '{"verified":true}', ...extra,
});
function fixture(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name: string, data: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  const packed = (rows: unknown[], parts = false) => {
    const b64 = gzipSync(JSON.stringify(rows)).toString('base64');
    fs.writeFileSync(path.join(dir, 'records.b64.txt'), parts ? 'See records.b64.part1.txt' : b64);
    if (parts) {
      fs.writeFileSync(path.join(dir, 'records.b64.part1.txt'), b64.slice(0, 30));
      fs.writeFileSync(path.join(dir, 'records.b64.part2.txt'), b64.slice(30));
    }
  };
  return { dir, write, packed };
}

test('rolling window retains history, enriches missing fields, and is idempotent', t => {
  const { dir, write, packed } = fixture(t);
  const historical = record('shared');
  packed([record('outside-window'), historical], true);
  write('records.json', []); // Production has only a placeholder JSON file.
  write('seed.json', [record('shared', { title: 'Generic seed title' })]);
  fs.writeFileSync(path.join(dir, 'export.jsonl'), [record('shared', {
    title: 'Shared', summary: '', download_url: null, raw_meta: null,
    thumbnail_url: 'https://vault.fbi.gov/thumb.jpg', published_at: null,
    collected_at: '2026-10-12T00:00:00.000Z',
  }), record('new')].map(r => JSON.stringify(r)).join('\n'));
  const rows = buildRecords(dir);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find(r => r.id === 'shared'), { ...historical, thumbnail_url: 'https://vault.fbi.gov/thumb.jpg' });
  const first = fs.readFileSync(path.join(dir, 'records.json'), 'utf8');
  buildRecords(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'records.json'), 'utf8'), first);
  fs.writeFileSync(path.join(dir, 'export.jsonl'), '');
  assert.equal(buildRecords(dir).length, 3);
});

test('single packed file, JSON-only history and first build are supported', t => {
  const { dir, write, packed } = fixture(t);
  write('seed.json', [record('seed')]);
  assert.equal(buildRecords(dir).length, 1);
  packed([record('packed')]);
  assert.equal(buildRecords(dir).length, 2);
  fs.unlinkSync(path.join(dir, 'records.b64.txt'));
  assert.equal(buildRecords(dir).length, 2);
});

test('duplicate inputs fill blanks and keep earliest discovery with stable ordering', t => {
  const { dir, write } = fixture(t);
  write('records.json', [record('b', { summary: '', download_url: null }), record('a')]);
  write('seed.json', [record('b', { collected_at: '2026-09-01T00:00:00.000Z' }), record('a')]);
  const rows = buildRecords(dir);
  assert.deepEqual(rows.map(r => r.id), ['a', 'b']);
  assert.equal(rows[1].download_url, record('b').download_url);
  assert.equal(rows[1].summary, record('b').summary);
  assert.equal(rows[1].collected_at, '2026-09-01T00:00:00.000Z');
});

for (const failure of ['corrupt packed', 'missing part', 'bad json', 'bad jsonl', 'invalid record', 'conflicting id']) {
  test(`${failure} fails without replacing history`, t => {
    const { dir, write, packed } = fixture(t);
    write('records.json', [record('original')]);
    packed([record('original')], true);
    if (failure === 'corrupt packed') fs.writeFileSync(path.join(dir, 'records.b64.part1.txt'), 'broken');
    if (failure === 'missing part') fs.unlinkSync(path.join(dir, 'records.b64.part1.txt'));
    if (failure === 'bad json') write('seed.json', {});
    if (failure === 'bad jsonl') fs.writeFileSync(path.join(dir, 'export.jsonl'), '{bad');
    if (failure === 'invalid record') write('seed.json', [{ title: 'no identity' }]);
    if (failure === 'conflicting id') write('seed.json', [record('original', { source_url: 'https://vault.fbi.gov/different' })]);
    const before = fs.readFileSync(path.join(dir, 'records.json'), 'utf8');
    assert.throws(() => buildRecords(dir));
    assert.equal(fs.readFileSync(path.join(dir, 'records.json'), 'utf8'), before);
  });
}

test('actual committed snapshot survives a clean checkout with an empty crawl', t => {
  const { dir, write } = fixture(t);
  const data = path.join(process.cwd(), 'data');
  for (const name of fs.readdirSync(data).filter(n => n.startsWith('records.b64'))) {
    fs.copyFileSync(path.join(data, name), path.join(dir, name));
  }
  write('records.json', []);
  const history = readPackedHistory(dir);
  assert.ok(history.length > 700);
  assert.deepEqual(new Set(buildRecords(dir).map(r => r.id)), new Set(history.map(r => r.id)));
});


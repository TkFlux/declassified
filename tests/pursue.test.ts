import test from 'node:test';
import assert from 'node:assert/strict';
import {
  csvToObjects,
  discoverCsvUrl,
  parseCsv,
  parseUsDate,
  pursueRowsToRecords,
} from '../src/lib/sources/pursue';

const HEADER =
  'Featured,Redaction,Release Date,Title,Type,Video Pairing,PDF Pairing,Description Blurb,DVIDS Video ID,Video Title,Agency,Incident Date,Incident Location,PDF | Image Link,Modal Image,Image Alt Text,Image VIRIN,Column1';

const CSV =
  '\uFEFF' +
  HEADER +
  '\r\n' +
  'Yes,TRUE,10/23/26,"DOW-UAP-D176, Triangular UAP AARO Memorandum for Record, 2026",PDF,,,"Line one, with comma.\n\nSecond ""quoted"" paragraph.",,,Department of War,"June, 2026",Western United States,https://www.war.gov/medialink/ufo/release-07/documents/DOW-UAP-D176-Triangular_UAP_AARO_MFR_2026.pdf,https://www.war.gov/medialink/ufo/release-07/thumbnails/DOW-UAP-D176.jpg,Memo,260508-D-1,\r\n' +
  ',TRUE,5/8/26,"DOW-UAP-PR019, Unresolved UAP Report, Middle East, May 2022",VID,,DoW-UAP-D010,Video blurb,1006056,Unresolved UAP Report,Department of War,N/A,Middle East,https://www.war.gov/medialink/ufo/release_1/dow-uap-d10.pdf,,,,\r\n' +
  ',,6/12/26,"FBI-UAP-D014,\u00a0Digital Rendering",IMG,,,Img blurb,,,FBI,"October, 2023",Western US,https://www.war.gov/x/FBI-UAP-D014.png,https://www.war.gov/x/t.jpg,,,\r\n' +
  ',,7/10/26,"FBI-UAP-D014, Correspondence ",PDF ,,,Pdf blurb,,,FBI,10/10/74,Various,https://www.war.gov/y/FBI-UAP-D014.pdf,,,,\r\n' +
  ',,,,,,,,,,,,,,,,,\r\n';

test('parseCsv handles BOM, quotes, escaped quotes, embedded newlines, CRLF', () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 5); // header + 4 (blank row dropped)
  assert.equal(rows[0][0], 'Featured');
  assert.equal(rows[1][3], 'DOW-UAP-D176, Triangular UAP AARO Memorandum for Record, 2026');
  assert.equal(rows[1][7], 'Line one, with comma.\n\nSecond "quoted" paragraph.');
  assert.equal(rows[1][11], 'June, 2026');
});

test('parseUsDate converts M/D/YY and M/D/YYYY', () => {
  assert.equal(parseUsDate('10/23/26'), '2026-10-23');
  assert.equal(parseUsDate('5/8/2026'), '2026-05-08');
  assert.equal(parseUsDate('June, 2026'), null);
});

test('pursueRowsToRecords maps releases, media URLs, thumbnails and unique ids', () => {
  const recs = pursueRowsToRecords(csvToObjects(CSV));
  assert.equal(recs.length, 4);
  const [d176, vid, img, pdf] = recs;
  assert.equal(new Set(recs.map((r) => r.id)).size, 4, 'same code, different type => distinct ids');

  assert.equal(d176.agency, 'PURSUE');
  assert.equal(d176.source, 'war-pursue');
  assert.equal(d176.published_at, '2026-10-23T12:00:00.000Z');
  assert.match(d176.download_url!, /release-07\/documents\/DOW-UAP-D176/);
  assert.equal(d176.thumbnail_url, 'https://www.war.gov/medialink/ufo/release-07/thumbnails/DOW-UAP-D176.jpg');
  assert.match(d176.summary, /^PURSUE Release 04 \(Oct 23, 2026\) · PDF · Department of War · Incident: June, 2026, Western United States\./);
  const meta = JSON.parse(d176.raw_meta!);
  assert.equal(meta.release, 4); // 4th distinct release date in this fixture
  assert.equal(meta.featured, true);
  assert.equal(meta.originating_agency, 'Department of War');

  assert.equal(vid.source_url, 'https://www.dvidshub.net/video/1006056');
  assert.equal(vid.download_url, null);
  assert.equal(JSON.parse(vid.raw_meta!).release, 1);
  assert.equal(JSON.parse(vid.raw_meta!).paired_document, 'https://www.war.gov/medialink/ufo/release_1/dow-uap-d10.pdf');

  assert.equal(img.title, 'FBI-UAP-D014, Digital Rendering');
  assert.equal(JSON.parse(img.raw_meta!).file_type, 'Image');
  assert.equal(JSON.parse(pdf.raw_meta!).file_type, 'PDF');
  // stable ids across runs
  assert.deepEqual(pursueRowsToRecords(csvToObjects(CSV)).map((r) => r.id), recs.map((r) => r.id));
});

test('discoverCsvUrl picks the highest ?release= CSV reference', () => {
  const html = `a "uap-data.csv?release=4" b 'uap-data.csv?ver=abc' c "uap-data.csv?release=7v2"`;
  assert.equal(
    discoverCsvUrl(html),
    'https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-data.csv?release=7v2'
  );
  assert.equal(discoverCsvUrl('<html></html>'), null);
});

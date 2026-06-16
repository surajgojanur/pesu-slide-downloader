'use strict';

// Pure unit tests for the PESU downloader's unit/speed/fingerprint helpers.
// Run with: npm test  (node tests/unit.test.js)

const assert = require('assert');
const {
  normalizeUnitIdentity,
  findUnitByIdentity,
  fingerprintSlidesTable,
  fingerprintsDiffer,
  parseSpeedOption,
  sourceSetFingerprint,
  isDuplicateSourceSet,
  romanToInt,
  SPEED_PRESETS
} = require('../src/core/unitTools');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  ok  ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`FAIL  ${name}\n      ${error.message}\n`);
  }
}

// ---------------------------------------------------------------------------
// normalizeUnitIdentity
// ---------------------------------------------------------------------------
test('normalizeUnitIdentity parses arabic numbers and padding variants', () => {
  assert.strictEqual(normalizeUnitIdentity('Unit 1').number, 1);
  assert.strictEqual(normalizeUnitIdentity('Unit 01').number, 1);
  assert.strictEqual(normalizeUnitIdentity('unit-2').number, 2);
  assert.strictEqual(normalizeUnitIdentity('UNIT_3').number, 3);
  assert.strictEqual(normalizeUnitIdentity('Unit 4 - Graphs').number, 4);
});

test('normalizeUnitIdentity parses roman numerals', () => {
  assert.strictEqual(normalizeUnitIdentity('UNIT I').number, 1);
  assert.strictEqual(normalizeUnitIdentity('Unit IV').number, 4);
  assert.strictEqual(normalizeUnitIdentity('Unit IX').number, 9);
  assert.strictEqual(romanToInt('xii'), 12);
});

test('normalizeUnitIdentity handles module/chapter/lesson keywords', () => {
  assert.strictEqual(normalizeUnitIdentity('Module 2').number, 2);
  assert.strictEqual(normalizeUnitIdentity('Chapter 5').number, 5);
  assert.strictEqual(normalizeUnitIdentity('Lesson 7').number, 7);
});

test('normalizeUnitIdentity extracts the trailing label', () => {
  const identity = normalizeUnitIdentity('Unit 4 - Graphs and Trees');
  assert.strictEqual(identity.label, 'Graphs and Trees');
  assert.strictEqual(identity.isUnit, true);
});

test('normalizeUnitIdentity flags ignored top-level tabs and non-units', () => {
  assert.strictEqual(normalizeUnitIdentity('Course Units').isIgnored, true);
  assert.strictEqual(normalizeUnitIdentity('Course Units').isUnit, false);
  assert.strictEqual(normalizeUnitIdentity('Introduction').isUnit, false);
  assert.strictEqual(normalizeUnitIdentity('References').isUnit, false);
  assert.strictEqual(normalizeUnitIdentity('Objectives').isUnit, false);
});

// ---------------------------------------------------------------------------
// findUnitByIdentity
// ---------------------------------------------------------------------------
test('findUnitByIdentity matches by number across formatting differences', () => {
  const units = [
    { text: 'Unit 01 - Intro', selector: '#u1' },
    { text: 'Unit 02 - Sorting', selector: '#u2' },
    { text: 'Unit 03 - Graphs', selector: '#u3' }
  ];
  const found = findUnitByIdentity(units, normalizeUnitIdentity('Unit 2'));
  assert.strictEqual(found.selector, '#u2');
});

test('findUnitByIdentity matches roman intended against arabic discovered', () => {
  const units = [{ text: 'Unit 1' }, { text: 'Unit 2' }, { text: 'Unit 3' }];
  const found = findUnitByIdentity(units, normalizeUnitIdentity('Unit III'));
  assert.strictEqual(found.text, 'Unit 3');
});

test('findUnitByIdentity returns null when nothing matches', () => {
  const units = [{ text: 'Unit 1' }];
  assert.strictEqual(findUnitByIdentity(units, normalizeUnitIdentity('Unit 9')), null);
});

// ---------------------------------------------------------------------------
// fingerprintSlidesTable
// ---------------------------------------------------------------------------
function tableObservation(rows, headers = ['Class', 'Title', 'Slides']) {
  return {
    tables: [
      {
        headers,
        rowCount: rows.length,
        rows: rows.map((rowText, index) => ({
          rowText,
          cells: [{ anchors: [{ href: `https://x/${index}.pdf` }], clickables: [] }]
        }))
      }
    ]
  };
}

test('fingerprintSlidesTable produces equal hashes for identical tables', () => {
  const a = fingerprintSlidesTable(tableObservation(['1 Intro', '2 Loops']));
  const b = fingerprintSlidesTable(tableObservation(['1 Intro', '2 Loops']));
  assert.strictEqual(a.hash, b.hash);
  assert.strictEqual(a.rowCount, 2);
  assert.strictEqual(fingerprintsDiffer(a, b), false);
});

test('fingerprintSlidesTable detects different unit content', () => {
  const unit1 = fingerprintSlidesTable(tableObservation(['1 Intro', '2 Loops']));
  const unit2 = fingerprintSlidesTable(tableObservation(['1 Trees', '2 Graphs']));
  assert.notStrictEqual(unit1.hash, unit2.hash);
  assert.strictEqual(fingerprintsDiffer(unit1, unit2), true);
});

test('fingerprintSlidesTable reports empty when no rows', () => {
  const fp = fingerprintSlidesTable({ tables: [] });
  assert.strictEqual(fp.isEmpty, true);
  assert.strictEqual(fp.rowCount, 0);
});

// ---------------------------------------------------------------------------
// parseSpeedOption
// ---------------------------------------------------------------------------
test('parseSpeedOption maps presets to expected delays', () => {
  assert.strictEqual(parseSpeedOption({ speed: 'fast' }).actionDelayMs, SPEED_PRESETS.fast);
  assert.strictEqual(parseSpeedOption({ speed: 'normal' }).actionDelayMs, 800);
  assert.strictEqual(parseSpeedOption({ speed: 'slow' }).actionDelayMs, 1400);
  assert.strictEqual(parseSpeedOption({ speed: 'SAFE' }).actionDelayMs, 2200);
});

test('parseSpeedOption defaults to normal when nothing supplied', () => {
  assert.strictEqual(parseSpeedOption({}).actionDelayMs, 800);
  assert.strictEqual(parseSpeedOption().actionDelayMs, 800);
});

test('parseSpeedOption lets delayMs override speed', () => {
  const resolved = parseSpeedOption({ speed: 'safe', delayMs: '500' });
  assert.strictEqual(resolved.actionDelayMs, 500);
  assert.strictEqual(resolved.source, 'delay-ms');
});

test('parseSpeedOption rejects invalid speed presets', () => {
  assert.throws(() => parseSpeedOption({ speed: 'ludicrous' }), /Invalid speed value/);
});

test('parseSpeedOption rejects invalid delay values', () => {
  assert.throws(() => parseSpeedOption({ delayMs: 'abc' }), /Invalid delay value/);
  assert.throws(() => parseSpeedOption({ delayMs: '-5' }), /Invalid delay value/);
  assert.throws(() => parseSpeedOption({ delayMs: '999999' }), /Invalid delay value/);
});

// ---------------------------------------------------------------------------
// duplicate source detection
// ---------------------------------------------------------------------------
test('sourceSetFingerprint normalizes and dedupes URLs', () => {
  const fp = sourceSetFingerprint([
    { href: 'https://x/a.pdf#page=1' },
    { url: 'https://x/a.pdf#page=2' },
    { src: 'https://x/b.pdf' }
  ]);
  assert.deepStrictEqual(fp.keys, ['https://x/a.pdf', 'https://x/b.pdf']);
});

test('isDuplicateSourceSet flags identical wrong-unit source sets', () => {
  const unit1 = ['https://x/a.pdf', 'https://x/b.pdf'];
  const unit2Same = ['https://x/b.pdf', 'https://x/a.pdf'];
  const unit2Diff = ['https://x/c.pdf', 'https://x/d.pdf'];
  assert.strictEqual(isDuplicateSourceSet(unit1, unit2Same), true);
  assert.strictEqual(isDuplicateSourceSet(unit1, unit2Diff), false);
});

test('isDuplicateSourceSet ignores empty sets', () => {
  assert.strictEqual(isDuplicateSourceSet([], ['https://x/a.pdf']), false);
  assert.strictEqual(isDuplicateSourceSet(['https://x/a.pdf'], []), false);
  assert.strictEqual(isDuplicateSourceSet(null, undefined), false);
});

// ---------------------------------------------------------------------------
process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exitCode = 1;
}

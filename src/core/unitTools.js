'use strict';

const crypto = require('crypto');

// Speed presets in milliseconds of inter-action delay.
const SPEED_PRESETS = {
  fast: 250,
  normal: 800,
  slow: 1400,
  safe: 2200
};

// Top-level course tabs that must never be treated as content units.
const IGNORED_UNIT_TABS = new Set([
  'course units',
  'introduction',
  'objectives',
  'outcomes',
  'outline',
  'syllabus',
  'references',
  'unclassified live videos'
]);

const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function romanToInt(roman) {
  const value = String(roman).toLowerCase();
  if (!/^[ivxlcdm]+$/.test(value)) {
    return null;
  }
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    const current = ROMAN_VALUES[value[index]];
    const next = ROMAN_VALUES[value[index + 1]];
    if (next && current < next) {
      total -= current;
    } else {
      total += current;
    }
  }
  return total > 0 ? total : null;
}

// Parse a unit label into a stable identity. Handles:
//   "Unit 1", "Unit 01", "unit-1", "UNIT I", "Unit I", "Module 2", "Chapter 3", "Lesson 4".
// Returns { raw, number, keyword, label, normalized, isUnit, isIgnored }.
function normalizeUnitIdentity(rawText) {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  const normalized = text.toLowerCase().replace(/[\s._-]+/g, ' ').trim();

  if (!text) {
    return { raw: '', number: null, keyword: null, label: '', normalized: '', isUnit: false, isIgnored: false };
  }

  const isIgnored = IGNORED_UNIT_TABS.has(normalized);
  const match = text.match(/\b(unit|module|chapter|lesson)[\s._-]*0*([0-9]+|[ivxlcdm]+)\b/i);

  let number = null;
  let keyword = null;
  let label = text;

  if (match) {
    keyword = match[1].toLowerCase();
    const token = match[2].toLowerCase();
    if (/^[0-9]+$/.test(token)) {
      number = Number(token);
    } else {
      number = romanToInt(token);
    }
    label = text.replace(match[0], '').replace(/^[\s._:-]+/, '').trim();
  }

  return {
    raw: text,
    number,
    keyword,
    label,
    normalized,
    isUnit: Boolean(match) && number != null && !isIgnored,
    isIgnored
  };
}

// Find the discovered unit object whose identity matches the intended identity.
// Matches by unit number first, then by normalized label text.
function findUnitByIdentity(units, intended) {
  if (!Array.isArray(units) || !units.length || !intended) {
    return null;
  }

  const intendedIdentity =
    intended.normalized !== undefined ? intended : normalizeUnitIdentity(intended.text || intended);

  if (intendedIdentity.number != null) {
    const byNumber = units.find((unit) => {
      const identity = normalizeUnitIdentity(unit.text || unit.raw || '');
      return identity.number === intendedIdentity.number;
    });
    if (byNumber) {
      return byNumber;
    }
  }

  return (
    units.find((unit) => {
      const identity = normalizeUnitIdentity(unit.text || unit.raw || '');
      return identity.normalized && identity.normalized === intendedIdentity.normalized;
    }) || null
  );
}

// Pick the table most likely to be the slides/class table for fingerprinting.
function pickFingerprintTable(observation) {
  const tables = (observation && observation.tables) || [];
  const slidesTable = tables.find((table) =>
    (table.headers || []).some((header) => /(slides|slide|pdf|material|notes|ppt)/i.test(header))
  );
  return slidesTable || tables[0] || null;
}

// Build a stable fingerprint of the visible slide table so unit transitions can be proven.
// Captures row count, visible row text, and any slide source URLs / onclick handlers.
function fingerprintSlidesTable(observation) {
  const table = pickFingerprintTable(observation);
  const rowTexts = [];
  const sourceKeys = [];

  if (table) {
    for (const row of table.rows || []) {
      rowTexts.push(String(row.rowText || '').replace(/\s+/g, ' ').trim());
      for (const cell of row.cells || []) {
        for (const anchor of cell.anchors || []) {
          if (anchor.href) {
            sourceKeys.push(String(anchor.href).split('#')[0]);
          }
        }
        for (const clickable of cell.clickables || []) {
          if (clickable.onclick) {
            sourceKeys.push(String(clickable.onclick));
          }
        }
      }
    }
  }

  const rowCount = table ? (table.rowCount != null ? table.rowCount : (table.rows || []).length) : 0;
  const payload = JSON.stringify({ rowCount, rowTexts, sourceKeys });

  return {
    hash: shortHash(payload),
    rowCount,
    rowTexts,
    sourceKeys,
    isEmpty: rowCount === 0
  };
}

// Two fingerprints differ when their hashes differ.
function fingerprintsDiffer(previous, current) {
  if (!previous || !current) {
    return Boolean(current && !current.isEmpty);
  }
  return previous.hash !== current.hash;
}

// Resolve user-controlled automation speed into a delay in milliseconds.
// --delay-ms (delayMs) always overrides --speed.
function parseSpeedOption(input = {}) {
  const { speed, delayMs } = input;

  if (delayMs !== undefined && delayMs !== null && String(delayMs).trim() !== '') {
    const numeric = Number(delayMs);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 60_000) {
      throw new Error(
        `Invalid delay value: "${delayMs}". Provide a number of milliseconds between 0 and 60000.`
      );
    }
    const rounded = Math.round(numeric);
    return { actionDelayMs: rounded, label: `custom (${rounded}ms)`, source: 'delay-ms' };
  }

  if (speed === undefined || speed === null || String(speed).trim() === '') {
    return { actionDelayMs: SPEED_PRESETS.normal, label: `normal (${SPEED_PRESETS.normal}ms)`, source: 'default' };
  }

  const key = String(speed).toLowerCase().trim();
  if (!Object.prototype.hasOwnProperty.call(SPEED_PRESETS, key)) {
    throw new Error(
      `Invalid speed value: "${speed}". Choose one of: ${Object.keys(SPEED_PRESETS).join(', ')}.`
    );
  }

  return { actionDelayMs: SPEED_PRESETS[key], label: `${key} (${SPEED_PRESETS[key]}ms)`, source: 'speed' };
}

// Normalize a list of source descriptors into a sorted, de-duplicated set of URL keys.
function sourceSetFingerprint(sources) {
  const keys = (sources || [])
    .map((source) => {
      if (typeof source === 'string') {
        return source;
      }
      return source && (source.href || source.src || source.url || source.onclick);
    })
    .filter(Boolean)
    .map((value) => String(value).split('#')[0]);

  const unique = Array.from(new Set(keys)).sort();
  return { keys: unique, hash: unique.length ? shortHash(unique.join('|')) : '' };
}

// True when two units resolved to the exact same non-empty set of source URLs.
function isDuplicateSourceSet(previousKeys, currentKeys) {
  if (!Array.isArray(previousKeys) || !Array.isArray(currentKeys)) {
    return false;
  }
  if (!previousKeys.length || !currentKeys.length) {
    return false;
  }
  if (previousKeys.length !== currentKeys.length) {
    return false;
  }
  const a = [...previousKeys].sort();
  const b = [...currentKeys].sort();
  return a.every((value, index) => value === b[index]);
}

module.exports = {
  SPEED_PRESETS,
  IGNORED_UNIT_TABS,
  shortHash,
  romanToInt,
  normalizeUnitIdentity,
  findUnitByIdentity,
  pickFingerprintTable,
  fingerprintSlidesTable,
  fingerprintsDiffer,
  parseSpeedOption,
  sourceSetFingerprint,
  isDuplicateSourceSet
};

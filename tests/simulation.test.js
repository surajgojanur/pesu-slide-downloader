'use strict';

// End-to-end simulation of PESU Academy's single-page unit UI.
//
// This does NOT launch a browser. Instead it implements an in-memory state machine
// that reproduces the exact behaviours observed in the live logs, and a mock Playwright
// `page`/`context` backed by that state machine, then drives the REAL downloader
// navigation code (discoverUnits / processUnit / openUnitVerified / ensureUnitActive)
// against it.
//
// Modelled real-world behaviours:
//   - Switching a unit tab loads that unit's class table via AJAX.
//   - Opening a slide -> eye icon -> iframe yields that slide's PDF URL.
//   - "Back to Units" returns to the table BUT resets the active unit to Unit 1
//     (this is the root cause of the "Unit 2 downloads Unit 1 again" bug).
//   - Optional adversarial mode `stickyTab`: the unit tab keeps its "active" CSS class
//     even after the content reverts to Unit 1, so the active-tab signal lies.
//
// The downloaded "PDF" content is just the slide's URL, so after a run we can read each
// saved file and prove which unit's slide actually landed in each unit folder.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDir } = require('../src/core/fileUtils');
const { createProgressStore } = require('../src/core/progressStore');
const { normalizeUnitIdentity } = require('../src/core/unitTools');
const downloader = require('../src/core/downloader');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      process.stdout.write(`  ok  ${name}\n`);
    })
    .catch((error) => {
      failed += 1;
      process.stdout.write(`FAIL  ${name}\n      ${error.stack || error.message}\n`);
    });
}

const PAGE_URL = 'https://pesu.example/Academy/s/studentProfilePESU#';
const IGNORED_TOP_TABS = [
  'Course Units',
  'Introduction',
  'Objectives',
  'Outcomes',
  'Outline',
  'Syllabus',
  'References'
];

// ---------------------------------------------------------------------------
// PESU state machine
// ---------------------------------------------------------------------------
function createSim({ unitClassCounts, stickyTab = false }) {
  const units = unitClassCounts.map((count, unitIndex) => {
    const number = unitIndex + 1;
    const classes = [];
    for (let i = 1; i <= count; i += 1) {
      classes.push({
        topic: `UNIT-${number}-TOPIC-${i}`,
        url: `https://pesu.example/slides/UNIT-${number}-CLASS-${i}.pdf`
      });
    }
    return { number, classes };
  });

  return {
    units,
    stickyTab,
    view: 'table',
    activeUnit: 1, // which unit's table content is currently loaded
    lastClickedUnit: 1, // which tab carries the "active" CSS class
    detail: null, // { unit, row, url }
    iframeSrc: null,
    backToUnitsCount: 0,

    clickUnit(n) {
      this.activeUnit = n;
      this.lastClickedUnit = n;
      this.view = 'table';
      this.detail = null;
      this.iframeSrc = null;
    },
    clickSlideTrigger(unit, row) {
      const slide = this.units[unit - 1].classes[row - 1];
      this.detail = { unit, row, url: slide ? slide.url : null };
      this.view = 'detail';
      this.iframeSrc = null;
    },
    clickEye() {
      this.iframeSrc = this.detail ? this.detail.url : null;
    },
    backToUnits() {
      // THE BUG: returns to the table but reverts the loaded content to Unit 1.
      this.activeUnit = 1;
      if (!this.stickyTab) {
        this.lastClickedUnit = 1;
      }
      this.view = 'table';
      this.detail = null;
      this.iframeSrc = null;
      this.backToUnitsCount += 1;
    }
  };
}

// ---------------------------------------------------------------------------
// Observation builders (what the real observePage / evaluate calls would see)
// ---------------------------------------------------------------------------
function classTableObservation(sim, unitNumber) {
  const classes = sim.units[unitNumber - 1].classes;
  return {
    selector: `table-u${unitNumber}`,
    headers: ['Class', 'Topic', 'Slides'],
    rowCount: classes.length,
    rows: classes.map((klass, index) => {
      const i = index + 1;
      return {
        selector: `row-u${unitNumber}-r${i}`,
        rowText: `${i} ${klass.topic}`,
        cells: [
          { text: `${i}`, selector: `c-u${unitNumber}-r${i}-0`, anchors: [], clickables: [] },
          { text: klass.topic, selector: `c-u${unitNumber}-r${i}-1`, anchors: [], clickables: [] },
          {
            text: '',
            selector: `c-u${unitNumber}-r${i}-2`,
            anchors: [],
            clickables: [{ text: `${i}`, selector: `slide-trigger-u${unitNumber}-r${i}` }]
          }
        ]
      };
    })
  };
}

function buildTableObservation(sim) {
  const choices = [];
  IGNORED_TOP_TABS.forEach((text, index) => {
    choices.push({
      text,
      ariaLabel: '',
      title: '',
      href: '',
      role: 'a',
      tagName: 'a',
      className: '',
      selector: `top-tab-${index}`,
      region: 'tab-content',
      top: 100,
      left: index * 80,
      bottom: 120
    });
  });
  for (const unit of sim.units) {
    choices.push({
      text: `Unit ${unit.number}`,
      ariaLabel: '',
      title: '',
      href: '',
      role: 'a',
      tagName: 'a',
      className: unit.number === sim.lastClickedUnit ? 'nav-tab active' : 'nav-tab',
      selector: `unit-tab-${unit.number}`,
      region: 'tab-content',
      top: 140,
      left: unit.number * 80,
      bottom: 160
    });
  }

  return {
    title: 'Course',
    url: PAGE_URL,
    headings: [],
    choices,
    tables: [classTableObservation(sim, sim.activeUnit)],
    dialogs: [],
    forms: { usernameInputs: [], passwordInputs: [] }
  };
}

function buildDetailObservation() {
  const tab = (text, selector, active) => ({
    text,
    ariaLabel: '',
    title: '',
    href: '',
    role: 'a',
    tagName: 'a',
    className: active ? 'active' : '',
    selector,
    region: 'document',
    top: 200,
    left: 0,
    bottom: 220
  });

  return {
    title: 'Course',
    url: PAGE_URL,
    headings: [],
    choices: [
      tab('AV Summary', 'tab-av', false),
      tab('Live Videos', 'tab-lv', false),
      tab('Slides', '#contentType_2', true),
      tab('Notes', 'tab-notes', false)
    ],
    tables: [],
    dialogs: [],
    forms: { usernameInputs: [], passwordInputs: [] }
  };
}

// ---------------------------------------------------------------------------
// Mock Playwright surface
// ---------------------------------------------------------------------------
function createMockLocator(sim, selector) {
  const sel = String(selector || '');

  const recognized =
    /^unit-tab-\d+$/.test(sel) ||
    /^slide-trigger-u\d+-r\d+$/.test(sel) ||
    sel === 'eye-icon' ||
    sel.includes('myIframe') ||
    sel.includes('courseContentinfo') ||
    /Back to Units/i.test(sel) ||
    sel === '#contentType_2' ||
    /^row-u\d+-r\d+$/.test(sel) ||
    /^c-u\d+/.test(sel) ||
    /^top-tab-\d+$/.test(sel);

  const doClick = () => {
    let match;
    if ((match = sel.match(/^unit-tab-(\d+)$/))) {
      sim.clickUnit(Number(match[1]));
    } else if ((match = sel.match(/^slide-trigger-u(\d+)-r(\d+)$/))) {
      sim.clickSlideTrigger(Number(match[1]), Number(match[2]));
    } else if (sel === 'eye-icon') {
      sim.clickEye();
    } else if (sel.includes('courseContentinfo') || /Back to Units/i.test(sel)) {
      sim.backToUnits();
    }
    // '#contentType_2' (Slides tab) and row/cell selectors: no-op
  };

  const locator = {
    count: async () => (recognized ? 1 : 0),
    first: () => locator,
    isVisible: async () => recognized,
    scrollIntoViewIfNeeded: async () => {},
    waitFor: async () => {},
    filter: () => locator,
    fill: async () => {},
    click: async () => {
      doClick();
    },
    evaluate: async () => {
      // clickBackToUnitsControl uses element.click() through locator.evaluate
      doClick();
    },
    textContent: async () => {
      if (sel.includes('courseContentinfo') || /Back to Units/i.test(sel)) {
        return 'Back to Units';
      }
      return '';
    },
    getAttribute: async (name) => {
      if (sel.includes('myIframe') && name === 'src') {
        return sim.iframeSrc;
      }
      if ((sel.includes('courseContentinfo') || /Back to Units/i.test(sel)) && name === 'onclick') {
        return "courseContentinfo('22219')";
      }
      return null;
    }
  };

  return locator;
}

function createMockContext() {
  return {
    cookies: async () => [],
    on: () => {},
    off: () => {},
    waitForEvent: async () => null,
    newPage: async () => null,
    pages: () => []
  };
}

function createMockPage(sim) {
  const emptyHints = () => ({
    url: PAGE_URL,
    dialogLinks: [],
    dialogButtons: [],
    pageLinks: [],
    viewerSources: [],
    onclickPdfSources: []
  });

  return {
    url: () => PAGE_URL,
    goto: async () => {},
    goBack: async () => {},
    waitForLoadState: async () => {},
    waitForSelector: async () => {},
    content: async () => '<html></html>',
    screenshot: async () => {},
    keyboard: { press: async () => {} },
    getByRole: () => createMockLocator(sim, '__none__'),
    getByLabel: () => createMockLocator(sim, '__none__'),
    getByPlaceholder: () => createMockLocator(sim, '__none__'),
    locator: (selector) => createMockLocator(sim, selector),
    evaluate: async (fn) => {
      const source = typeof fn === 'function' ? fn.toString() : String(fn);
      if (source.includes('activeTexts')) {
        if (sim.view !== 'table') {
          return { activeTexts: [] };
        }
        return { activeTexts: [`Unit ${sim.lastClickedUnit}`] };
      }
      if (source.includes('dialogLinks')) {
        return emptyHints();
      }
      if (source.includes('glyphicon-eye-open') || source.includes('pushAnchor')) {
        if (sim.view !== 'detail') {
          return [];
        }
        return [
          {
            selector: 'eye-icon',
            reason: 'glyphicon-eye-open',
            text: '',
            onclick: `loadIframe('${sim.detail ? sim.detail.url : ''}')`,
            className: ''
          }
        ];
      }
      // Default: the big observePage extraction (contains 'usernameInputs').
      return sim.view === 'table' ? buildTableObservation(sim) : buildDetailObservation();
    }
  };
}

// ---------------------------------------------------------------------------
// Test runtime + course runner
// ---------------------------------------------------------------------------
function buildTestRuntime() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pesu-sim-'));
  const paths = {
    debugDir: path.join(tmp, 'debug'),
    downloadRoot: path.join(tmp, 'downloads'),
    learnedSelectorsFile: path.join(tmp, 'learned.json'),
    logDir: tmp,
    logFile: path.join(tmp, 'log.txt'),
    memoryDir: tmp,
    notesFile: path.join(tmp, 'notes.md'),
    profileDir: tmp,
    progressFile: path.join(tmp, 'progress.json'),
    tempDownloadDir: path.join(tmp, 'tmp')
  };
  ensureDir(paths.debugDir);
  ensureDir(paths.downloadRoot);
  ensureDir(paths.tempDownloadDir);

  const logs = [];
  return {
    tmp,
    logs,
    runtime: {
      actionDelayMs: 0,
      browser: {},
      credentials: { username: 'u', password: 'p' },
      headless: true,
      logger: {
        log: (message) => logs.push(message),
        error: (message) => logs.push(`ERROR ${message}`)
      },
      paths,
      progressStore: createProgressStore({ progressFile: paths.progressFile, onProgress: () => {} }),
      currentUnitSourceKeys: [],
      stopRequested: false
    }
  };
}

function installFetchStub() {
  const original = global.fetch;
  global.fetch = async (url) => ({
    ok: true,
    status: 200,
    url,
    arrayBuffer: async () => Buffer.from(String(url)),
    headers: {
      get: (header) => (String(header).toLowerCase() === 'content-type' ? 'application/pdf' : null)
    }
  });
  return () => {
    global.fetch = original;
  };
}

async function runCourse(sim) {
  const { runtime } = buildTestRuntime();
  downloader.__test.setRuntime(runtime);
  const restoreFetch = installFetchStub();

  const course = {
    label: 'TEST101 - Sim Course',
    directory: path.join(runtime.paths.downloadRoot, 'TEST101 - Sim Course'),
    identity: { code: 'TEST101', name: 'Sim Course' }
  };
  ensureDir(course.directory);

  const page = createMockPage(sim);
  const context = createMockContext();

  try {
    const detectedUnits = await downloader.__test.discoverUnits(page, course.label);
    const unitPlan = detectedUnits.map((unit) => ({ ...unit, identity: normalizeUnitIdentity(unit.text) }));

    let previousUnitState = null;
    for (const unit of unitPlan) {
      previousUnitState = await downloader.__test.processUnit(page, context, course, unit, previousUnitState);
    }
  } finally {
    restoreFetch();
    downloader.__test.clearRuntime();
  }

  return collectDownloads(course.directory);
}

function collectDownloads(courseDir) {
  const result = {};
  if (!fs.existsSync(courseDir)) {
    return result;
  }
  for (const unitDir of fs.readdirSync(courseDir)) {
    const full = path.join(courseDir, unitDir);
    if (!fs.statSync(full).isDirectory()) continue;
    result[unitDir] = fs.readdirSync(full).map((file) => ({
      file,
      content: fs.readFileSync(path.join(full, file), 'utf8')
    }));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  // 1. Confirm the simulation actually reproduces the reported bug condition.
  await test('simulation: "Back to Units" reverts the loaded content to Unit 1', () => {
    const sim = createSim({ unitClassCounts: [3, 2, 4, 1] });
    sim.clickUnit(3);
    assert.strictEqual(sim.activeUnit, 3);
    sim.clickSlideTrigger(3, 1);
    sim.clickEye();
    assert.strictEqual(sim.iframeSrc, 'https://pesu.example/slides/UNIT-3-CLASS-1.pdf');
    sim.backToUnits();
    assert.strictEqual(sim.activeUnit, 1, 'after Back to Units the loaded unit reverts to 1');
    const obs = buildTableObservation(sim);
    const firstRowTrigger = obs.tables[0].rows[0].cells[2].clickables[0].selector;
    assert.ok(
      firstRowTrigger.startsWith('slide-trigger-u1-'),
      'without re-activation the next row would be read from Unit 1 (this is the bug)'
    );
  });

  // 2. Real downloader code, normal SPA behaviour: every unit folder gets its own slides.
  await test('downloader saves the correct unit content for every unit (normal SPA)', async () => {
    const sim = createSim({ unitClassCounts: [3, 2, 4, 1] });
    const downloads = await runCourse(sim);
    assertEachUnitCorrect(downloads, [3, 2, 4, 1]);
  });

  // 3. Adversarial: the unit tab keeps its "active" class while content reverts to Unit 1.
  //    A tab-class-based check would be fooled; the content-fingerprint check must not be.
  await test('downloader saves correct unit content even with a sticky/lying active tab', async () => {
    const sim = createSim({ unitClassCounts: [3, 2, 4, 1], stickyTab: true });
    const downloads = await runCourse(sim);
    assertEachUnitCorrect(downloads, [3, 2, 4, 1]);
  });

  // 4. Make sure "Back to Units" was actually exercised (the run really hit the bug path).
  await test('the run exercised the Back-to-Units reversion path', async () => {
    const sim = createSim({ unitClassCounts: [3, 2] });
    await runCourse(sim);
    assert.ok(sim.backToUnitsCount >= 5, `expected several Back-to-Units events, got ${sim.backToUnitsCount}`);
  });

  // 5. Regression: the live-account bug where returning to "My Courses" landed on a
  //    page mid-AJAX (the "Just a moment..." overlay), so the snapshot saw zero
  //    course rows. discoverCourses must retry past the transient empty snapshots
  //    instead of throwing and losing the remaining course(s).
  await test('discoverCourses retries past transient empty My Courses snapshots (loading overlay)', async () => {
    const { runtime } = buildTestRuntime();
    downloader.__test.setRuntime(runtime);
    try {
      const state = { calls: 0 };
      // Two empty snapshots (overlay still up), then the real 6-row table — exactly the
      // "zero candidates on Nth return-to-My-Courses" failure from the bug report.
      const snapshots = [
        myCoursesEmptyObservation(),
        myCoursesEmptyObservation(),
        myCoursesTableObservation()
      ];
      const page = createMyCoursesMockPage(snapshots, state);
      const courses = await downloader.__test.discoverCourses(page);
      assert.strictEqual(courses.length, 6, `expected 6 courses after retry, got ${courses.length}`);
      assert.strictEqual(
        courses[5].courseCode,
        'UQ25CA654B',
        'the 6th course (Web Application Frameworks) must be recovered after the retry'
      );
      assert.ok(state.calls >= 3, `expected discovery to retry the snapshot at least 3 times, got ${state.calls}`);
    } finally {
      downloader.__test.clearRuntime();
    }
  });

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function assertEachUnitCorrect(downloads, expectedCounts) {
  for (let unitNumber = 1; unitNumber <= expectedCounts.length; unitNumber += 1) {
    const dirName = `Unit ${String(unitNumber).padStart(2, '0')} - Unit ${unitNumber}`;
    const files = downloads[dirName] || [];
    assert.strictEqual(
      files.length,
      expectedCounts[unitNumber - 1],
      `Unit ${unitNumber} should have ${expectedCounts[unitNumber - 1]} files, got ${files.length} (${files.map((f) => f.file).join(', ')})`
    );
    for (const entry of files) {
      assert.ok(
        entry.content.includes(`UNIT-${unitNumber}-CLASS-`),
        `Unit ${unitNumber} file "${entry.file}" contains the wrong unit's slide: ${entry.content}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// My Courses observation builders + mock page (for the discoverCourses retry test)
// ---------------------------------------------------------------------------
function navChoice(text) {
  return {
    text,
    ariaLabel: '',
    title: '',
    href: '',
    role: 'a',
    tagName: 'a',
    className: '',
    selector: `nav-${text}`,
    region: 'nav-sidebar',
    top: 0,
    left: 0,
    bottom: 20
  };
}

// What observePage sees while PESU's AJAX table is still loading: only the sidebar
// nav, no tables, no headings (this is the exact shape captured in the bug's debug JSON).
function myCoursesEmptyObservation() {
  return {
    title: 'Profile | MyCourses',
    url: 'https://pesu.example/Academy/s/studentProfilePESU',
    headings: [],
    choices: [navChoice('Home'), navChoice('My Courses'), navChoice('Results'), navChoice('Time Table')],
    tables: [],
    dialogs: [],
    forms: { usernameInputs: [], passwordInputs: [] }
  };
}

// The settled page with the real My Courses table.
function myCoursesTableObservation() {
  const rows = [
    ['UQ25CA601B', 'Aptitude and Reasoning'],
    ['UQ25CA641BC1', 'Network Security'],
    ['UQ25CA651B', 'Algorithms Analysis and Design'],
    ['UQ25CA652B', 'Data Communication and Networking'],
    ['UQ25CA653B', 'Artificial Intelligence and Machine Learning'],
    ['UQ25CA654B', 'Web Application Frameworks - I']
  ];
  return {
    title: 'Profile | MyCourses',
    url: 'https://pesu.example/Academy/s/studentProfilePESU',
    headings: [],
    choices: [navChoice('Home')],
    tables: [
      {
        selector: 'table#courses',
        headers: ['Course Code', 'Course Title', 'Course Type', 'Status', 'Action'],
        rowCount: rows.length,
        rows: rows.map(([code, title], index) => ({
          selector: `row-${index}`,
          rowText: `${code} ${title}`,
          cells: [
            { text: code, selector: `c-${index}-0`, anchors: [], clickables: [] },
            { text: title, selector: `c-${index}-1`, anchors: [], clickables: [] },
            { text: 'CC', selector: `c-${index}-2`, anchors: [], clickables: [] },
            { text: 'Enrolled', selector: `c-${index}-3`, anchors: [], clickables: [] },
            { text: '', selector: `c-${index}-4`, anchors: [], clickables: [{ text: 'view', selector: `act-${index}` }] }
          ]
        }))
      }
    ],
    dialogs: [],
    forms: { usernameInputs: [], passwordInputs: [] }
  };
}

function createMyCoursesMockPage(snapshots, state) {
  const noopLocator = {
    count: async () => 0,
    first() {
      return this;
    },
    isVisible: async () => false,
    filter() {
      return this;
    },
    click: async () => {},
    fill: async () => {},
    getAttribute: async () => null,
    scrollIntoViewIfNeeded: async () => {},
    waitFor: async () => {},
    evaluate: async () => {},
    textContent: async () => ''
  };

  return {
    url: () => 'https://pesu.example/Academy/s/studentProfilePESU',
    goto: async () => {},
    goBack: async () => {},
    waitForLoadState: async () => {},
    waitForSelector: async () => {},
    content: async () => '<html></html>',
    screenshot: async () => {},
    keyboard: { press: async () => {} },
    getByRole: () => noopLocator,
    getByLabel: () => noopLocator,
    getByPlaceholder: () => noopLocator,
    locator: () => noopLocator,
    evaluate: async (fn) => {
      const source = typeof fn === 'function' ? fn.toString() : String(fn);
      // observePage's big DOM extraction is the only evaluate hit on this path.
      if (source.includes('usernameInputs')) {
        const index = Math.min(state.calls, snapshots.length - 1);
        state.calls += 1;
        return snapshots[index];
      }
      return {};
    }
  };
}

main();

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const BASE_URL = 'https://www.pesuacademy.com/';
const STUDENT_HOME_URL = 'https://www.pesuacademy.com/Academy/s/studentProfilePESU';
const PROFILE_DIR = path.join(ROOT_DIR, '.chromium-profile');
const TMP_DOWNLOAD_DIR = path.join(ROOT_DIR, '.tmp-downloads');
const DOWNLOAD_ROOT = path.join(ROOT_DIR, 'downloads', 'PESU_Academy');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'pesu-download.log');
const DEBUG_DIR = path.join(ROOT_DIR, 'debug');
const MEMORY_DIR = path.join(ROOT_DIR, 'memory');
const NOTES_FILE = path.join(MEMORY_DIR, 'pesu-notes.md');
const PROGRESS_FILE = path.join(MEMORY_DIR, 'pesu-progress.json');
const LEARNED_SELECTORS_FILE = path.join(MEMORY_DIR, 'pesu-learned-selectors.json');

const DEFAULT_TIMEOUT = 20_000;
const IGNORED_TOP_LEVEL_COURSE_TABS = new Set([
  'course units',
  'introduction',
  'objectives',
  'outcomes',
  'outline',
  'syllabus',
  'references',
  'unclassified live videos'
]);
const ACTION_DELAY_MS = process.env.PESU_AGENT_DELAY_MS
  ? Number(process.env.PESU_AGENT_DELAY_MS)
  : (process.env.PWDEBUG ? 1400 : 800);
const RETRY_COUNT = 3;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function sanitizeName(value, fallback = 'Untitled') {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');

  return text || fallback;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function sleep(ms = ACTION_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  const line = `[${now()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

function appendNote(section, message) {
  ensureDir(MEMORY_DIR);
  if (!fs.existsSync(NOTES_FILE)) {
    fs.writeFileSync(NOTES_FILE, '# PESU Agent Notes\n');
  }
  fs.appendFileSync(
    NOTES_FILE,
    `\n## ${section}\n- ${now()}: ${message.replace(/\n+/g, ' ')}\n`
  );
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function initFiles() {
  ensureDir(PROFILE_DIR);
  ensureDir(TMP_DOWNLOAD_DIR);
  ensureDir(DOWNLOAD_ROOT);
  ensureDir(LOG_DIR);
  ensureDir(DEBUG_DIR);
  ensureDir(MEMORY_DIR);

  if (!fs.existsSync(PROGRESS_FILE)) {
    saveJson(PROGRESS_FILE, {
      downloaded: {},
      failed: {},
      history: [],
      lastUpdated: null
    });
  }

  if (!fs.existsSync(LEARNED_SELECTORS_FILE)) {
    saveJson(LEARNED_SELECTORS_FILE, {
      learnedAt: null,
      buckets: {}
    });
  }

  if (!fs.existsSync(NOTES_FILE)) {
    fs.writeFileSync(
      NOTES_FILE,
      [
        '# PESU Agent Notes',
        '',
        '## Operating Model',
        '- Adaptive Playwright operator that reasons from live DOM structure, visible text, headings, tables, dialogs, and links.',
        '- Successful selectors and element paths are saved as learned selectors for future runs.',
        '- Debug bundles are captured when the agent is uncertain or a step fails.',
        ''
      ].join('\n')
    );
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function withProgress(mutator) {
  const progress = loadJson(PROGRESS_FILE, {
    downloaded: {},
    failed: {},
    history: [],
    lastUpdated: null
  });
  progress.downloaded ||= {};
  progress.failed ||= {};
  progress.history ||= [];
  mutator(progress);
  progress.lastUpdated = now();
  saveJson(PROGRESS_FILE, progress);
}

function withLearnedSelectors(mutator) {
  const learned = loadJson(LEARNED_SELECTORS_FILE, {
    learnedAt: null,
    buckets: {}
  });
  mutator(learned);
  learned.learnedAt = now();
  saveJson(LEARNED_SELECTORS_FILE, learned);
}

function rememberSelector(bucket, label, payload) {
  withLearnedSelectors((learned) => {
    learned.buckets[bucket] ||= {};
    learned.buckets[bucket][label] ||= [];
    const record = {
      ...payload,
      learnedAt: now()
    };
    const duplicate = learned.buckets[bucket][label].find(
      (item) =>
        item.selector === record.selector &&
        item.text === record.text &&
        item.reason === record.reason
    );
    if (!duplicate) {
      learned.buckets[bucket][label].unshift(record);
      learned.buckets[bucket][label] = learned.buckets[bucket][label].slice(0, 12);
    }
  });
}

async function withRetries(taskName, fn) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      log(`${taskName} failed on attempt ${attempt}/${RETRY_COUNT}: ${error.message}`);
      if (attempt < RETRY_COUNT) {
        await sleep(attempt * 1000);
      }
    }
  }
  throw lastError;
}

async function waitForStablePage(page) {
  await Promise.race([
    page.waitForLoadState('networkidle', { timeout: 8_000 }),
    page.waitForLoadState('domcontentloaded', { timeout: 8_000 })
  ]).catch(() => {});
  await sleep();
}

async function captureDebugBundle(page, label, observation) {
  ensureDir(DEBUG_DIR);
  const safe = sanitizeName(label, 'debug').replace(/\s+/g, '_');
  const stamp = now().replace(/[:.]/g, '-');
  const base = path.join(DEBUG_DIR, `${stamp}-${safe}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${base}.html`, await page.content().catch(() => ''));
  if (observation) {
    saveJson(`${base}.json`, observation);
  }
  log(`Debug bundle saved: ${base}.{png,html,json}`);
}

async function captureNamedDebugBundle(page, fileNameBase, observation) {
  ensureDir(DEBUG_DIR);
  const safe = sanitizeName(fileNameBase, 'debug').replace(/\s+/g, '-');
  const base = path.join(DEBUG_DIR, safe);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${base}.html`, await page.content().catch(() => ''));
  if (observation) {
    saveJson(`${base}.json`, observation);
  }
  log(`Debug bundle saved: ${base}.{png,html,json}`);
}

async function observePage(page, label, options = {}) {
  await waitForStablePage(page);
  const observation = await page.evaluate(() => {
    function clean(value) {
      return (value || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 10 && rect.height > 10;
    }

    function cssPath(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return null;
      }
      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) {
            selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
        }
        parts.unshift(selector);
        current = parent;
      }
      return parts.join(' > ');
    }

    function regionFor(element) {
      const container = element.closest(
        'nav, header, aside, footer, main, section, article, table, [role="dialog"], .modal, .popup, .card, .panel, .tab-content'
      );
      if (!container) {
        return 'document';
      }
      const role = container.getAttribute('role');
      if (role) {
        return role;
      }
      if (container.className) {
        return clean(String(container.className)).slice(0, 80);
      }
      return container.tagName.toLowerCase();
    }

    const headings = Array.from(
      document.querySelectorAll('h1, h2, h3, [role="heading"], .page-title, .card-title, .title')
    )
      .filter(isVisible)
      .map((element) => ({
        text: clean(element.textContent),
        selector: cssPath(element),
        region: regionFor(element)
      }))
      .filter((item) => item.text)
      .slice(0, 20);

    const choices = Array.from(
      document.querySelectorAll('a, button, [role="button"], [role="link"], [role="tab"], input[type="submit"]')
    )
      .filter(isVisible)
      .map((element) => ({
        text: clean(element.innerText || element.textContent || element.getAttribute('value')),
        ariaLabel: clean(element.getAttribute('aria-label')),
        title: clean(element.getAttribute('title')),
        href: clean(element.getAttribute('href')),
        role: clean(element.getAttribute('role')) || element.tagName.toLowerCase(),
        tagName: element.tagName.toLowerCase(),
        className: clean(element.className),
        selector: cssPath(element),
        region: regionFor(element),
        top: Math.round(element.getBoundingClientRect().top),
        left: Math.round(element.getBoundingClientRect().left),
        bottom: Math.round(element.getBoundingClientRect().bottom)
      }))
      .filter((item) => item.selector)
      .slice(0, 250);

    const tables = Array.from(document.querySelectorAll('table'))
      .filter(isVisible)
      .map((table) => {
        const headers = Array.from(table.querySelectorAll('thead th, tr th'))
          .filter(isVisible)
          .map((element) => clean(element.textContent))
          .filter(Boolean);

        const rows = Array.from(table.querySelectorAll('tbody tr, tr'))
          .filter(isVisible)
          .map((row) => {
            const cells = Array.from(row.querySelectorAll('td'))
              .filter(isVisible)
              .map((cell) => {
                const anchors = Array.from(cell.querySelectorAll('a[href]'))
                  .filter(isVisible)
                  .map((anchor) => ({
                    text: clean(anchor.innerText || anchor.textContent),
                    href: anchor.href,
                    selector: cssPath(anchor)
                  }));
                const clickables = Array.from(
                  cell.querySelectorAll('a, button, [role="button"], [role="link"], [onclick]')
                )
                  .filter(isVisible)
                  .map((item) => ({
                    text: clean(item.innerText || item.textContent),
                    selector: cssPath(item)
                  }))
                  .filter((item) => item.selector);

                return {
                  text: clean(cell.innerText || cell.textContent),
                  selector: cssPath(cell),
                  anchors,
                  clickables
                };
              });

            const rowText = clean(row.innerText || row.textContent);
            return {
              selector: cssPath(row),
              rowText,
              cells
            };
          })
          .filter((row) => row.cells.length > 0);

        return {
          selector: cssPath(table),
          headers,
          rowCount: rows.length,
          rows
        };
      })
      .filter((table) => table.rowCount > 0)
      .slice(0, 10);

    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"], .modal, .popup, .dialog, .swal2-container')
    )
      .filter(isVisible)
      .map((dialog) => ({
        selector: cssPath(dialog),
        text: clean(dialog.innerText || dialog.textContent).slice(0, 500),
        links: Array.from(dialog.querySelectorAll('a[href]'))
          .filter(isVisible)
          .map((anchor) => ({
            text: clean(anchor.innerText || anchor.textContent),
            href: anchor.href,
            selector: cssPath(anchor)
          })),
        buttons: Array.from(dialog.querySelectorAll('button, [role="button"], a, [onclick]'))
          .filter(isVisible)
          .map((button) => ({
            text: clean(button.innerText || button.textContent || button.getAttribute('aria-label')),
            selector: cssPath(button)
          }))
          .filter((item) => item.selector)
      }))
      .slice(0, 10);

    const forms = {
      usernameInputs: Array.from(
        document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[placeholder*="User"], input[placeholder*="Username"]')
      )
        .filter(isVisible)
        .map((element) => ({
          selector: cssPath(element),
          name: clean(element.getAttribute('name')),
          placeholder: clean(element.getAttribute('placeholder'))
        }))
        .filter((item) => item.selector),
      passwordInputs: Array.from(document.querySelectorAll('input[type="password"]'))
        .filter(isVisible)
        .map((element) => ({
          selector: cssPath(element),
          name: clean(element.getAttribute('name')),
          placeholder: clean(element.getAttribute('placeholder'))
        }))
        .filter((item) => item.selector)
    };

    return {
      title: document.title,
      url: window.location.href,
      headings,
      choices,
      tables,
      dialogs,
      forms
    };
  });

  log(`Page: ${observation.title || '(no title)'} | ${observation.url}`);

  const navChoices = observation.choices
    .filter((choice) => /nav|header|aside/i.test(choice.region))
    .slice(0, 12)
    .map((choice) => choice.text || choice.ariaLabel || choice.title)
    .filter(Boolean);
  if (navChoices.length) {
    log(`Visible navigation choices: ${navChoices.join(' | ')}`);
  }

  if (observation.tables.length) {
    const headerPreview = observation.tables
      .map((table) => `[${table.headers.join(', ')}]`)
      .slice(0, 3)
      .join(' | ');
    log(`Detected table headers: ${headerPreview}`);
  }

  if (options.captureDebug) {
    await captureDebugBundle(page, label, observation);
  }

  return observation;
}

function scoreCourseChoice(choice) {
  const text = (choice.text || choice.ariaLabel || choice.title || '').trim();
  const lower = text.toLowerCase();
  let score = 0;

  if (!text || text.length < 6) score -= 8;
  if (/^my courses$/i.test(text)) score -= 10;
  if (/attendance|profile|results|fees|logout|dashboard|forum|calendar|exam/i.test(lower)) score -= 8;
  if (/nav|header|aside|footer/i.test(choice.region)) score -= 8;
  if (/[A-Z]{1,4}\d{2,}[A-Z0-9]*/.test(text)) score += 8;
  if (text.includes(' - ')) score += 4;
  if (/course|subject/i.test(lower)) score += 4;
  if (/class|lecture/.test(lower)) score -= 2;
  if (choice.href && /course|subject|detail|class/i.test(choice.href)) score += 5;
  if (choice.role === 'a' || choice.role === 'link') score += 1;

  return score;
}

function parseCourseIdentity(rawText, headings, title) {
  const candidates = [...(headings || []).map((item) => item.text), rawText, title].filter(Boolean);

  for (const candidate of candidates) {
    const cleaned = sanitizeName(candidate);
    const match = cleaned.match(/^([A-Z]{1,4}\d{2,}[A-Z0-9]*)\s*[-:]\s*(.+)$/i);
    if (match) {
      return {
        code: sanitizeName(match[1]),
        name: sanitizeName(match[2])
      };
    }
  }

  for (const candidate of candidates) {
    const cleaned = sanitizeName(candidate);
    const token = cleaned.match(/([A-Z]{1,4}\d{2,}[A-Z0-9]*)/i);
    if (token) {
      return {
        code: sanitizeName(token[1]),
        name: sanitizeName(cleaned.replace(token[1], '').replace(/^[-:\s]+/, ''), cleaned)
      };
    }
  }

  return {
    code: 'UNKNOWN',
    name: sanitizeName(rawText || title || 'Course')
  };
}

function selectCourseCandidates(observation) {
  const ranked = observation.choices
    .map((choice) => ({
      ...choice,
      text: choice.text || choice.ariaLabel || choice.title,
      score: scoreCourseChoice(choice)
    }))
    .filter((choice) => choice.score >= 4)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  return ranked.filter((choice) => {
    const key = `${choice.text}::${choice.href}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function chooseMyCoursesTable(observation) {
  let best = null;

  for (const table of observation.tables) {
    const normalizedHeaders = table.headers.map((header) => header.toLowerCase());
    const courseCodeIndex = normalizedHeaders.findIndex((header) => /course\s*code/i.test(header));
    const courseTitleIndex = normalizedHeaders.findIndex((header) => /course\s*title/i.test(header));
    const actionIndex = normalizedHeaders.findIndex((header) => /action/i.test(header));

    if (courseCodeIndex === -1 || courseTitleIndex === -1 || actionIndex === -1) {
      continue;
    }

    const score = table.rowCount + 20;
    if (!best || score > best.score) {
      best = {
        ...table,
        score,
        courseCodeIndex,
        courseTitleIndex,
        courseTypeIndex: normalizedHeaders.findIndex((header) => /course\s*type/i.test(header)),
        statusIndex: normalizedHeaders.findIndex((header) => /status/i.test(header)),
        actionIndex
      };
    }
  }

  return best;
}

function extractCourseCandidatesFromTable(table) {
  return table.rows.map((row) => {
    const courseCode = sanitizeName(row.cells[table.courseCodeIndex]?.text || 'UNKNOWN');
    const courseTitle = sanitizeName(row.cells[table.courseTitleIndex]?.text || 'Course');
    const courseType = table.courseTypeIndex >= 0 ? sanitizeName(row.cells[table.courseTypeIndex]?.text || '') : '';
    const status = table.statusIndex >= 0 ? sanitizeName(row.cells[table.statusIndex]?.text || '') : '';
    const actionCell = row.cells[table.actionIndex];
    const actionControls = [
      ...(actionCell?.clickables || []),
      ...(actionCell?.anchors || [])
    ].filter((item) => item.selector || item.href);

    return {
      source: 'my-courses-table',
      text: `${courseCode} - ${courseTitle}`,
      courseCode,
      courseTitle,
      courseType,
      status,
      rowSelector: row.selector,
      titleCellSelector: row.cells[table.courseTitleIndex]?.selector,
      actionCellSelector: actionCell?.selector,
      actionControls,
      tableSelector: table.selector,
      headerMapping: {
        courseCode: table.headers[table.courseCodeIndex],
        courseTitle: table.headers[table.courseTitleIndex],
        courseType: table.courseTypeIndex >= 0 ? table.headers[table.courseTypeIndex] : null,
        status: table.statusIndex >= 0 ? table.headers[table.statusIndex] : null,
        action: table.headers[table.actionIndex]
      }
    };
  });
}

function detectUnitChoices(observation) {
  const contentChoices = observation.choices
    .filter((choice) => {
      const text = (choice.text || choice.ariaLabel || '').trim();
      if (!text) return false;
      if (/nav|header|aside|footer|dialog|table/i.test(choice.region)) return false;
      if (text.length > 120) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.top !== b.top) return a.top - b.top;
      return a.left - b.left;
    });

  const rows = [];
  for (const choice of contentChoices) {
    const text = (choice.text || choice.ariaLabel || '').trim();
    const normalized = text.toLowerCase();
    let row = rows.find((item) => Math.abs(item.top - choice.top) <= 18);
    if (!row) {
      row = {
        top: choice.top,
        choices: []
      };
      rows.push(row);
    }
    row.choices.push({
      ...choice,
      text,
      normalized
    });
  }

  rows.sort((a, b) => a.top - b.top);

  const topLevelRowIndex = rows.findIndex((row) =>
    row.choices.some((choice) => IGNORED_TOP_LEVEL_COURSE_TABS.has(choice.normalized))
  );

  const ignoredTopTabs = topLevelRowIndex >= 0
    ? rows[topLevelRowIndex].choices
        .map((choice) => choice.text)
        .filter((text) => IGNORED_TOP_LEVEL_COURSE_TABS.has(text.toLowerCase()))
    : [];

  let unitRow = null;
  if (topLevelRowIndex >= 0) {
    for (let index = topLevelRowIndex + 1; index < rows.length; index += 1) {
      const candidateChoices = rows[index].choices.filter(
        (choice) => !IGNORED_TOP_LEVEL_COURSE_TABS.has(choice.normalized)
      );
      if (candidateChoices.length >= 2) {
        unitRow = {
          top: rows[index].top,
          choices: candidateChoices
        };
        break;
      }
    }
  }

  if (!unitRow) {
    const fallbackChoices = contentChoices.filter((choice) =>
      /(unit|module|chapter|lesson)/i.test(choice.text)
    );
    if (fallbackChoices.length) {
      unitRow = {
        top: fallbackChoices[0].top,
        choices: fallbackChoices
      };
    }
  }

  const seen = new Set();
  const units = (unitRow?.choices || [])
    .map((choice, index) => {
      const key = choice.normalized;
      if (seen.has(key)) {
        return null;
      }
      seen.add(key);
      const match = choice.text.match(/(unit|module|chapter|lesson)[\s-]*0*([0-9]+)/i);
      const number = match ? Number(match[2]) : index + 1;
      const unitName = match
        ? sanitizeName(choice.text.replace(match[0], '').replace(/^[-:\s]+/, ''), choice.text)
        : sanitizeName(choice.text);
      return {
        ...choice,
        number,
        dirName: `Unit ${pad2(number)} - ${unitName}`
      };
    })
    .filter(Boolean);

  return {
    ignoredTopTabs,
    units
  };
}

function chooseSlidesTable(observation) {
  let best = null;

  for (const table of observation.tables) {
    const normalizedHeaders = table.headers.map((header) => header.toLowerCase());
    const slideIndex = normalizedHeaders.findIndex((header) => /(slides|slide|pdf|material|notes|ppt)/i.test(header));
    if (slideIndex === -1) {
      continue;
    }

    let score = 10 + table.rowCount;
    if (normalizedHeaders.some((header) => /(class|lecture|topic|title)/i.test(header))) {
      score += 4;
    }
    if (normalizedHeaders.some((header) => /(unit|date)/i.test(header))) {
      score += 1;
    }

    if (!best || score > best.score) {
      best = {
        ...table,
        score,
        slideIndex
      };
    }
  }

  return best;
}

function inferClassInfo(row, headers, slideIndex, rowIndex) {
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const classNumber = row.cells
    .map((cell) => cell.text)
    .find((text, index) => index !== slideIndex && /^\d+$/.test(text));

  let title = '';
  for (let index = 0; index < row.cells.length; index += 1) {
    if (index === slideIndex) continue;
    const header = normalizedHeaders[index] || '';
    const text = row.cells[index].text;
    if (!text) continue;
    if (/(class|title|topic|lecture|session|name)/i.test(header)) {
      title = text;
      break;
    }
  }

  if (!title) {
    title =
      row.cells
        .map((cell) => cell.text)
        .find((text, index) => index !== slideIndex && text && !/^\d+$/.test(text)) ||
      row.rowText ||
      `Class ${pad2(rowIndex + 1)}`;
  }

  const slideCell = row.cells[slideIndex];
  const hasSlides =
    slideCell &&
    (slideCell.anchors.length > 0 ||
      slideCell.clickables.length > 0 ||
      /(slide|pdf|ppt|download|view|open|\d+)/i.test(slideCell.text));

  return {
    classNumber: classNumber || pad2(rowIndex + 1),
    classTitle: sanitizeName(title, `Class ${pad2(rowIndex + 1)}`),
    slideCell,
    hasSlides
  };
}

async function fillFirstVisible(page, locators, value) {
  for (const locator of locators) {
    if (await locator.count().catch(() => 0)) {
      const first = locator.first();
      if (await first.isVisible().catch(() => false)) {
        await first.fill(value);
        return true;
      }
    }
  }
  return false;
}

async function detectLoginState(observation) {
  const hasUsername = observation.forms.usernameInputs.length > 0;
  const hasPassword = observation.forms.passwordInputs.length > 0;
  const signInChoice = observation.choices.find((choice) =>
    /(sign in|login|log in)/i.test(`${choice.text} ${choice.ariaLabel} ${choice.title}`)
  );
  return hasUsername && hasPassword && Boolean(signInChoice);
}

async function loginIfNeeded(page) {
  const observation = await observePage(page, 'login-check');
  if (!(await detectLoginState(observation))) {
    log('Login form not detected. Continuing with existing session.');
    return;
  }

  log('Login page detected. Filling credentials from .env.');
  appendNote('Login', 'Login form detected and credentials will be filled from environment variables.');

  const username = requireEnv('PESU_USERNAME');
  const password = requireEnv('PESU_PASSWORD');

  const usernameFilled = await fillFirstVisible(
    page,
    [
      page.locator('input[name="j_username"]'),
      page.getByLabel(/username/i),
      page.getByPlaceholder(/username/i),
      page.locator('input[type="text"], input[type="email"]')
    ],
    username
  );

  const passwordFilled = await fillFirstVisible(
    page,
    [
      page.locator('input[name="j_password"]'),
      page.getByLabel(/password/i),
      page.getByPlaceholder(/password/i),
      page.locator('input[type="password"]')
    ],
    password
  );

  if (!usernameFilled || !passwordFilled) {
    const failedObservation = await observePage(page, 'login-missing-fields', { captureDebug: true });
    throw new Error(`Login form detected but fields were not reliably locatable. Debug saved for ${failedObservation.url}`);
  }

  await sleep();

  const submitCandidates = [
    page.getByRole('button', { name: /sign in|login|log in/i }),
    page.locator('button[type="submit"], input[type="submit"]'),
    page.locator('button, a').filter({ hasText: /sign in|login|log in/i })
  ];

  let submitted = false;
  for (const locator of submitCandidates) {
    if (await locator.count().catch(() => 0)) {
      const button = locator.first();
      if (await button.isVisible().catch(() => false)) {
        log('Clicking login submit control because the live page identifies it as the sign-in action.');
        await button.click({ timeout: DEFAULT_TIMEOUT });
        submitted = true;
        break;
      }
    }
  }

  if (!submitted) {
    throw new Error('Could not find a visible login submit control');
  }

  await waitForStablePage(page);
  const postLoginObservation = await observePage(page, 'post-login-check');
  if (await detectLoginState(postLoginObservation)) {
    await captureDebugBundle(page, 'login-failed', postLoginObservation);
    appendNote('Login', 'Login attempt did not leave the sign-in page. Stopping clearly as requested.');
    throw new Error('Login failed or the sign-in page remained visible after submit');
  }

  appendNote('Login', 'Login succeeded or an existing session became active after submit.');
}

async function clickChoice(page, choice, reason) {
  log(`Action: ${reason}`);
  log(`Choice: ${choice.text || choice.ariaLabel || choice.title} | region=${choice.region} | selector=${choice.selector}`);

  const locatorFactories = [];
  if (choice.selector) {
    locatorFactories.push(() => page.locator(choice.selector));
  }
  const text = choice.text || choice.ariaLabel || choice.title;
  if (text) {
    locatorFactories.push(() => page.getByRole('link', { name: text, exact: true }));
    locatorFactories.push(() => page.getByRole('button', { name: text, exact: true }));
    locatorFactories.push(() => page.locator('a, button, [role="button"], [role="link"], [role="tab"]').filter({ hasText: text }));
  }

  for (const createLocator of locatorFactories) {
    const locator = createLocator();
    if (await locator.count().catch(() => 0)) {
      const first = locator.first();
      if (await first.isVisible().catch(() => false)) {
        try {
          await first.scrollIntoViewIfNeeded().catch(() => {});
          await sleep();
          await first.click({ timeout: DEFAULT_TIMEOUT });
          await waitForStablePage(page);
          return;
        } catch {
          continue;
        }
      }
    }
  }

  throw new Error(`Unable to click live page choice: ${text || choice.selector}`);
}

function hasClassTable(observation) {
  return observation.tables.some((table) =>
    table.headers.some((header) => /^class$/i.test(header))
  );
}

async function recoverCourseUnitContext(page, course, unit) {
  log(`Navigation recovery: page is ${page.url() || '(unknown)'}. Rebuilding course context for ${course.label} / ${unit.text}.`);

  await page.goto(STUDENT_HOME_URL, {
    waitUntil: 'domcontentloaded',
    timeout: DEFAULT_TIMEOUT
  });
  await waitForStablePage(page);
  await goToMyCourses(page);

  const courses = await discoverCourses(page);
  const matchingCourse = courses.find((candidate) =>
    candidate.courseCode === course.identity.code ||
    candidate.courseTitle === course.identity.name ||
    `${candidate.courseCode} - ${candidate.courseTitle}` === course.label
  );

  if (!matchingCourse) {
    throw new Error(`Could not re-open ${course.label} from My Courses during navigation recovery`);
  }

  await openCourse(page, matchingCourse);
  const refreshedUnits = await discoverUnits(page, course.label);
  const matchingUnit = refreshedUnits.find((candidate) =>
    candidate.text === unit.text ||
    candidate.dirName === unit.dirName ||
    candidate.number === unit.number
  );

  if (!matchingUnit) {
    throw new Error(`Could not re-open unit ${unit.text} inside ${course.label} during navigation recovery`);
  }

  await openUnit(page, matchingUnit, course.label);
  await page.waitForSelector('table', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
  const recoveredObservation = await observePage(
    page,
    `recovered-unit-${sanitizeName(course.label)}-${sanitizeName(unit.text)}`
  );

  if (!hasClassTable(recoveredObservation)) {
    throw new Error(`Recovered ${course.label} / ${unit.text} but did not find a Class table`);
  }

  log('Navigation restored using course reload and unit reopen');
  log('Returned to unit table');
}

async function goToMyCourses(page) {
  const observation = await observePage(page, 'find-my-courses');
  const navChoice = observation.choices.find((choice) =>
    /my courses/i.test(`${choice.text} ${choice.ariaLabel} ${choice.title}`)
  );

  if (navChoice) {
    await clickChoice(
      page,
      navChoice,
      'Navigating to My Courses because it is the visible navigation entry matching the requested destination.'
    );
    rememberSelector('navigation', 'myCourses', {
      selector: navChoice.selector,
      text: navChoice.text,
      reason: 'visible navigation entry'
    });
    return;
  }

  await withRetries('Navigate to My Courses fallback URL', async () => {
    await page.goto(STUDENT_HOME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: DEFAULT_TIMEOUT
    });
    await waitForStablePage(page);
    const retryObservation = await observePage(page, 'find-my-courses-retry');
    const retryNavChoice = retryObservation.choices.find((choice) =>
      /my courses/i.test(`${choice.text} ${choice.ariaLabel} ${choice.title}`)
    );
    if (!retryNavChoice) {
      throw new Error('My Courses navigation entry was not visible from the student home page');
    }
    await clickChoice(
      page,
      retryNavChoice,
      'Navigating to My Courses from the student home page because the direct sidebar entry was required after fallback.'
    );
  });
}

async function discoverCourses(page) {
  const observation = await observePage(page, 'my-courses-page');
  const coursesTable = chooseMyCoursesTable(observation);

  if (coursesTable) {
    const candidates = extractCourseCandidatesFromTable(coursesTable);
    rememberSelector('courseTables', 'myCourses', {
      selector: coursesTable.selector,
      headers: coursesTable.headers,
      reason: 'table with Course Code / Course Title / Action headers'
    });
    withLearnedSelectors((learned) => {
      learned.buckets.courseHeaderMappings ||= {};
      learned.buckets.courseHeaderMappings.myCourses = {
        selector: coursesTable.selector,
        headers: coursesTable.headers,
        mapping: {
          courseCode: coursesTable.headers[coursesTable.courseCodeIndex],
          courseTitle: coursesTable.headers[coursesTable.courseTitleIndex],
          courseType: coursesTable.courseTypeIndex >= 0 ? coursesTable.headers[coursesTable.courseTypeIndex] : null,
          status: coursesTable.statusIndex >= 0 ? coursesTable.headers[coursesTable.statusIndex] : null,
          action: coursesTable.headers[coursesTable.actionIndex]
        },
        learnedAt: now()
      };
    });

    for (const candidate of candidates) {
      log(
        `Course candidate: ${candidate.courseCode} | ${candidate.courseTitle} | ${candidate.courseType || '-'} | ${candidate.status || '-'}`
      );
    }
    appendNote(
      'Courses',
      `Detected ${candidates.length} course rows from the My Courses table: ${candidates.map((item) => `${item.courseCode} ${item.courseTitle}`).join(' | ')}`
    );
    return candidates;
  }

  const candidates = selectCourseCandidates(observation);

  if (!candidates.length) {
    await captureDebugBundle(page, 'no-course-candidates', observation);
    throw new Error('No course candidates were detected on the My Courses page');
  }

  log(`Detected courses: ${candidates.map((item) => item.text).join(' | ')}`);
  appendNote('Courses', `Detected ${candidates.length} course candidates: ${candidates.map((item) => item.text).join(' | ')}`);
  return candidates;
}

async function openCourseFromTableRow(page, courseChoice) {
  log(
    `Action: opening course row ${courseChoice.courseCode} - ${courseChoice.courseTitle} from the My Courses table using Action column reasoning.`
  );

  if (courseChoice.actionControls.length) {
    const primaryControl = courseChoice.actionControls[0];
    log(
      `Choice: ${primaryControl.text || courseChoice.headerMapping.action} | selector=${primaryControl.selector || courseChoice.actionCellSelector}`
    );
    const controlLocator = primaryControl.selector
      ? page.locator(primaryControl.selector).first()
      : page.locator(courseChoice.actionCellSelector).first();
    if (await controlLocator.isVisible().catch(() => false)) {
      await controlLocator.scrollIntoViewIfNeeded().catch(() => {});
      await sleep();
      await controlLocator.click({ timeout: DEFAULT_TIMEOUT });
      await waitForStablePage(page);
      return;
    }
  }

  const observation = await observePage(page, `missing-action-${sanitizeName(courseChoice.courseCode)}`, {
    captureDebug: true
  });
  appendNote(
    'Course Action Fallback',
    `Action control was not visible for ${courseChoice.courseCode} - ${courseChoice.courseTitle}. Captured debug and falling back to title cell or row click.`
  );

  const fallbackSelectors = [
    courseChoice.actionCellSelector,
    courseChoice.titleCellSelector,
    courseChoice.rowSelector
  ].filter(Boolean);

  for (const selector of fallbackSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      log(`Choice: fallback selector ${selector} from course table row.`);
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await sleep();
      await locator.click({ timeout: DEFAULT_TIMEOUT });
      await waitForStablePage(page);
      return;
    }
  }

  throw new Error(
    `Could not open course ${courseChoice.courseCode} - ${courseChoice.courseTitle}; Action control and row fallbacks were unavailable on ${observation.url}`
  );
}

async function openCourse(page, courseChoice) {
  if (courseChoice.source === 'my-courses-table') {
    await openCourseFromTableRow(page, courseChoice);
    const observation = await observePage(page, `course-${sanitizeName(courseChoice.text)}`);
    const identity = parseCourseIdentity(
      `${courseChoice.courseCode} - ${courseChoice.courseTitle}`,
      observation.headings,
      observation.title
    );
    const resolvedIdentity = {
      code: courseChoice.courseCode || identity.code,
      name: courseChoice.courseTitle || identity.name
    };
    const label = `${resolvedIdentity.code} - ${resolvedIdentity.name}`;
    log(`Course identified from live page: ${label}`);
    appendNote('Course Identity', `Resolved course page as ${label} from My Courses table row and page state.`);
    rememberSelector('courses', label, {
      selector: courseChoice.rowSelector,
      text: courseChoice.text,
      reason: 'course row opened successfully from My Courses table'
    });

    return {
      observation,
      identity: resolvedIdentity,
      label,
      directory: path.join(DOWNLOAD_ROOT, sanitizeName(label, resolvedIdentity.name))
    };
  }

  await clickChoice(
    page,
    courseChoice,
    'Opening this course because it scored as a main-content course entry rather than a sidebar navigation item.'
  );

  const observation = await observePage(page, `course-${sanitizeName(courseChoice.text)}`);
  const identity = parseCourseIdentity(courseChoice.text, observation.headings, observation.title);
  const label = `${identity.code} - ${identity.name}`;
  log(`Course identified from live page: ${label}`);
  appendNote('Course Identity', `Resolved course page as ${label} from headings/title.`);
  rememberSelector('courses', label, {
    selector: courseChoice.selector,
    text: courseChoice.text,
    reason: 'course entry opened successfully'
  });

  return {
    observation,
    identity,
    label,
    directory: path.join(DOWNLOAD_ROOT, sanitizeName(label, identity.name))
  };
}

async function discoverUnits(page, courseLabel) {
  const observation = await observePage(page, `units-${sanitizeName(courseLabel)}`);
  const unitDetection = detectUnitChoices(observation);
  const units = unitDetection.units;

  if (!units.length) {
    await captureDebugBundle(page, `no-units-${sanitizeName(courseLabel)}`, observation);
    throw new Error(`No visible unit tabs were detected for ${courseLabel}`);
  }

  if (unitDetection.ignoredTopTabs.length) {
    log(`Top-level course tabs ignored: ${unitDetection.ignoredTopTabs.join(' | ')}`);
  }
  log(`Actual unit tabs detected: ${units.map((unit) => unit.text).join(' | ')}`);
  appendNote('Units', `Detected units for ${courseLabel}: ${units.map((unit) => unit.text).join(' | ')}`);
  return units;
}

async function openUnit(page, unit, courseLabel) {
  log(`Opening actual unit: ${unit.text}`);
  await clickChoice(
    page,
    unit,
    `Opening unit ${unit.text} because it is a visible tab-like control in the course content area.`
  );
  rememberSelector('units', `${courseLabel}::${unit.text}`, {
    selector: unit.selector,
    text: unit.text,
    reason: 'unit opened successfully'
  });
}

function buildCookieHeader(cookies, urlString) {
  const url = new URL(urlString);
  return cookies
    .filter((cookie) => {
      const domain = (cookie.domain || '').replace(/^\./, '');
      const domainMatch = !domain || url.hostname === domain || url.hostname.endsWith(`.${domain}`);
      const pathMatch = url.pathname.startsWith(cookie.path || '/');
      return domainMatch && pathMatch;
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function fetchBufferWithCookies(context, urlString) {
  const cookies = await context.cookies();
  const cookieHeader = buildCookieHeader(cookies, urlString);
  const headers = cookieHeader ? { Cookie: cookieHeader } : {};
  const response = await fetch(urlString, { headers, redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${urlString}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || '',
    finalUrl: response.url
  };
}

async function directDownload(context, urlString, targetPath) {
  const { buffer, contentType, finalUrl } = await fetchBufferWithCookies(context, urlString);
  if (!/pdf|octet-stream|application\/binary/i.test(contentType) && !/\.pdf(?:$|\?)/i.test(finalUrl)) {
    throw new Error(`Direct fetch did not resolve to a PDF-like response: ${finalUrl} (${contentType})`);
  }
  fs.writeFileSync(targetPath, buffer);
}

function buildFilePath(courseDir, unitDir, classIndex, classTitle, assetIndex, assetCount) {
  const baseName = `${pad2(classIndex + 1)} - ${sanitizeName(classTitle)}`;
  const suffix = assetCount > 1 ? ` (Slide ${pad2(assetIndex + 1)})` : '';
  return path.join(courseDir, unitDir, `${baseName}${suffix}.pdf`);
}

function makeProgressKey(courseLabel, unitDir, classTitle, assetLabel) {
  return `${courseLabel}::${unitDir}::${classTitle}::${assetLabel}`;
}

function resolveMaybeRelativeUrl(pageUrl, candidateUrl) {
  if (!candidateUrl) {
    return candidateUrl;
  }
  try {
    return new URL(candidateUrl, pageUrl).toString();
  } catch {
    return candidateUrl;
  }
}

async function collectArtifactHints(page) {
  return page.evaluate(() => {
    function clean(value) {
      return (value || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 4 && rect.height > 4;
    }

    function cssPath(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) {
            selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
        }
        parts.unshift(selector);
        current = parent;
      }
      return parts.join(' > ');
    }

    const visibleDialogs = Array.from(
      document.querySelectorAll('[role="dialog"], .modal, .popup, .dialog, .swal2-container')
    ).filter(isVisible);

    const dialogLinks = visibleDialogs.flatMap((dialog) =>
      Array.from(dialog.querySelectorAll('a[href]'))
        .filter(isVisible)
        .map((anchor) => ({
          href: anchor.href,
          text: clean(anchor.innerText || anchor.textContent),
          selector: cssPath(anchor),
          source: 'dialog-link'
        }))
    );

    const dialogButtons = visibleDialogs.flatMap((dialog) =>
      Array.from(dialog.querySelectorAll('button, [role="button"], a, [onclick]'))
        .filter(isVisible)
        .map((button) => ({
          text: clean(button.innerText || button.textContent || button.getAttribute('aria-label')),
          selector: cssPath(button),
          source: 'dialog-button'
        }))
        .filter((item) => item.selector)
    );

    const pageLinks = Array.from(document.querySelectorAll('a[href]'))
      .filter(isVisible)
      .map((anchor) => ({
        href: anchor.href,
        text: clean(anchor.innerText || anchor.textContent),
        selector: cssPath(anchor),
        source: 'page-link',
        onclick: clean(anchor.getAttribute('onclick'))
      }))
      .filter((item) => /\.pdf(?:$|\?)/i.test(item.href) || /download|slide|pdf|material|loadiframe/i.test(`${item.href} ${item.text} ${item.onclick}`))
      .slice(0, 30);

    const onclickPdfSources = Array.from(document.querySelectorAll('[onclick]'))
      .filter(isVisible)
      .map((element) => {
        const onclick = clean(element.getAttribute('onclick'));
        const match = onclick.match(/loadIframe\(['"]([^'"]+downloadslidecoursedoc[^'"]+)['"]/i) ||
          onclick.match(/['"]([^'"]+\.pdf(?:#[^'"]*)?)['"]/i);
        return {
          text: clean(element.innerText || element.textContent || element.getAttribute('title') || element.getAttribute('aria-label')),
          selector: cssPath(element),
          onclick,
          url: match ? match[1] : ''
        };
      })
      .filter((item) => item.selector && item.url)
      .slice(0, 30);

    const viewerSources = Array.from(document.querySelectorAll('iframe[src], embed[src], object[data]'))
      .filter(isVisible)
      .map((item) => ({
        src: item.getAttribute('src') || item.getAttribute('data'),
        selector: cssPath(item)
      }))
      .filter((item) => item.src)
      .slice(0, 10);

    return {
      url: window.location.href,
      dialogLinks,
      dialogButtons,
      pageLinks,
      viewerSources,
      onclickPdfSources
    };
  });
}

async function detectImmediatePdfSources(page) {
  const hints = await collectArtifactHints(page);
  const sources = [];

  for (const viewer of hints.viewerSources) {
    if (/^iframe/i.test(viewer.selector || '') && viewer.src) {
      sources.push({ src: viewer.src, selector: viewer.selector, source: 'iframe-src' });
    }
  }

  for (const viewer of hints.viewerSources) {
    if (/^embed/i.test(viewer.selector || '') && viewer.src) {
      sources.push({ src: viewer.src, selector: viewer.selector, source: 'embed-src' });
    }
  }

  for (const viewer of hints.viewerSources) {
    if (/^object/i.test(viewer.selector || '') && viewer.src) {
      sources.push({ src: viewer.src, selector: viewer.selector, source: 'object-data' });
    }
  }

  for (const viewer of hints.viewerSources) {
    if ((/\.pdf(?:$|\?)/i.test(viewer.src) || /^blob:/i.test(viewer.src)) &&
      !sources.find((item) => item.src === viewer.src)) {
      sources.push({ src: viewer.src, selector: viewer.selector, source: 'viewer-source' });
    }
  }

  if (/\.pdf(?:$|\?)/i.test(hints.url)) {
    sources.push({ url: hints.url, source: 'page-url' });
  }

  const seen = new Set();
  return sources.filter((item) => {
    const key = item.href || item.src || item.url;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function closeVisibleDialogs(page) {
  const closeCandidates = [
    page.getByRole('button', { name: /close|cancel|done|ok/i }),
    page.locator('[role="dialog"] button, .modal button, .popup button').filter({ hasText: /close|cancel|done|ok|x/i })
  ];
  for (const locator of closeCandidates) {
    if (await locator.count().catch(() => 0)) {
      const first = locator.first();
      if (await first.isVisible().catch(() => false)) {
        await first.click().catch(() => {});
        await waitForStablePage(page);
        return;
      }
    }
  }

  await page.keyboard.press('Escape').catch(() => {});
  await waitForStablePage(page);
}

async function saveBlobFromPage(page, targetPath) {
  const base64 = await page.evaluate(async () => {
    const response = await fetch(window.location.href);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.slice(index, index + chunk));
    }
    return btoa(binary);
  });
  fs.writeFileSync(targetPath, Buffer.from(base64, 'base64'));
}

async function downloadArtifactSources(context, page, sources, courseDir, unitDir, classIndex, classTitle, courseLabel, options = {}) {
  const uniqueSources = [];
  const seen = new Set();

  for (const source of sources) {
    const key = source.href || source.src || source.url || source.text || source.selector;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueSources.push(source);
  }

  let savedCount = 0;
  const totalCount = options.totalCount || uniqueSources.length;
  const startIndex = options.startIndex || 0;

  for (let assetIndex = 0; assetIndex < uniqueSources.length; assetIndex += 1) {
    const source = uniqueSources[assetIndex];
    source.href = resolveMaybeRelativeUrl(page.url(), source.href);
    source.src = source.src && !/^blob:/i.test(source.src) ? resolveMaybeRelativeUrl(page.url(), source.src) : source.src;
    source.url = source.url && !/^blob:/i.test(source.url) ? resolveMaybeRelativeUrl(page.url(), source.url) : source.url;
    const outputIndex = startIndex + assetIndex;
    const targetPath = buildFilePath(courseDir, unitDir, classIndex, classTitle, outputIndex, totalCount);
    const assetLabel = source.href || source.src || source.url || source.text || `asset-${assetIndex + 1}`;
    const key = makeProgressKey(courseLabel, unitDir, classTitle, assetLabel);

    ensureDir(path.dirname(targetPath));

    if (fs.existsSync(targetPath)) {
      log(`Skip existing file: ${targetPath}`);
      withProgress((state) => {
        state.downloaded[key] = {
          status: 'skipped-existing',
          filePath: targetPath
        };
        state.history.push({ key, status: 'skipped-existing', recordedAt: now() });
      });
      savedCount += 1;
      continue;
    }

    if (source.href && /^https?:/i.test(source.href)) {
      await directDownload(context, source.href, targetPath);
      savedCount += 1;
    } else if (source.src && /^https?:/i.test(source.src)) {
      await directDownload(context, source.src, targetPath);
      savedCount += 1;
    } else if (source.src && /^blob:/i.test(source.src)) {
      await saveBlobFromPage(page, targetPath);
      savedCount += 1;
    } else if (source.url && /^https?:/i.test(source.url)) {
      await directDownload(context, source.url, targetPath);
      savedCount += 1;
    } else if (source.url && /^blob:/i.test(source.url)) {
      await saveBlobFromPage(page, targetPath);
      savedCount += 1;
    } else {
      continue;
    }

    withProgress((state) => {
      state.downloaded[key] = {
        status: 'downloaded',
        filePath: targetPath,
        source: assetLabel
      };
      state.history.push({ key, status: 'downloaded', recordedAt: now(), filePath: targetPath });
    });
    log(`Saved PDF: ${targetPath}`);
  }

  if (options.closeDialogsAfter && savedCount > 0) {
    await closeVisibleDialogs(page).catch(() => {});
  }

  return savedCount;
}

async function triggerDownloadByClick(page, context, triggerSelector, debugLabel) {
  const responses = [];
  const responseListener = async (response) => {
    try {
      const headers = await response.allHeaders();
      const contentType = headers['content-type'] || '';
      const url = response.url();
      if (/pdf|octet-stream|application\/binary/i.test(contentType) || /\.pdf(?:$|\?)/i.test(url)) {
        responses.push({ url, contentType });
      }
    } catch {
      return;
    }
  };

  context.on('response', responseListener);
  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null);
  const popupPromise = context.waitForEvent('page', { timeout: 8_000 }).catch(() => null);
  const previousUrl = page.url();
  const trigger = page.locator(triggerSelector).first();

  try {
    if (!(await trigger.isVisible().catch(() => false))) {
      throw new Error(`Trigger is not visible for ${debugLabel}`);
    }
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await sleep();
    await trigger.click({ force: true, timeout: DEFAULT_TIMEOUT });
    await waitForStablePage(page);

    const artifacts = [];
    const download = await downloadPromise;
    if (download) {
      artifacts.push({ download });
    }

    const popup = await popupPromise;
    if (popup) {
      await waitForStablePage(popup);
      artifacts.push({ popup });
    }

    const currentUrl = page.url();
    if (currentUrl !== previousUrl) {
      artifacts.push({ currentUrl });
    }

    if (responses.length) {
      for (const response of responses) {
        artifacts.push({ url: response.url });
      }
    }

    return artifacts;
  } finally {
    context.off('response', responseListener);
  }
}

function detectSlideDetailTabs(observation) {
  const tabTexts = ['av summary', 'live videos', 'slides', 'notes'];
  return observation.choices.filter((choice) => {
    const text = (choice.text || choice.ariaLabel || choice.title || '').trim().toLowerCase();
    return text && tabTexts.some((tab) => text.includes(tab)) && !/nav|header|aside|footer/i.test(choice.region);
  });
}

async function ensureSlidesTabActive(page, observation) {
  const detailTabs = detectSlideDetailTabs(observation);
  if (!detailTabs.length) {
    return observation;
  }

  const slidesTab = detailTabs.find((choice) => /^slides$/i.test(choice.text || '')) ||
    detailTabs.find((choice) => /slides/i.test(choice.text || ''));

  if (slidesTab) {
    const currentObservation = await observePage(page, 'slide-detail-tabs');
    const currentTabs = detectSlideDetailTabs(currentObservation);
    const currentSlidesTab = currentTabs.find((choice) => /^slides$/i.test(choice.text || '')) ||
      currentTabs.find((choice) => /slides/i.test(choice.text || ''));

    const slidesActive = currentSlidesTab &&
      /(active|selected|current)/i.test(`${currentSlidesTab.className || ''} ${currentSlidesTab.ariaLabel || ''} ${currentSlidesTab.title || ''}`);

    if (!slidesActive) {
      await clickChoice(
        page,
        slidesTab,
        'Ensuring the Slides tab is active on the slide detail page before searching for the slide viewer control.'
      );
      return observePage(page, 'slide-detail-slides-tab');
    }
  }

  return observation;
}

async function detectGlyphiconEyeAnchors(page) {
  return page.evaluate(() => {
    function clean(value) {
      return (value || '').replace(/\s+/g, ' ').trim();
    }

    function cssPath(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return null;
      }
      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
        let part = current.nodeName.toLowerCase();
        if (current.classList.length) {
          part += `.${Array.from(current.classList).slice(0, 3).map((name) => CSS.escape(name)).join('.')}`;
        }
        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter((child) => child.nodeName === current.nodeName)
          : [];
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    }

    const anchors = [];
    const pushAnchor = (anchor, reason) => {
      if (!anchor) return;
      const selector = cssPath(anchor);
      if (!selector || anchors.find((item) => item.selector === selector)) return;
      anchors.push({
        selector,
        reason,
        text: clean(anchor.innerText || anchor.textContent),
        onclick: clean(anchor.getAttribute('onclick')),
        className: clean(anchor.className)
      });
    };

    for (const anchor of document.querySelectorAll("a[onclick*='loadIframe']")) {
      pushAnchor(anchor, 'onclick-loadIframe');
    }

    for (const icon of document.querySelectorAll('span.glyphicon.glyphicon-eye-open, .glyphicon-eye-open')) {
      pushAnchor(icon.closest('a'), 'glyphicon-eye-open');
    }

    return anchors;
  });
}

async function waitForIframePdfSource(page) {
  const frame = page.locator("iframe[id^='myIframe']").first();
  await frame.waitFor({ state: 'attached', timeout: DEFAULT_TIMEOUT }).catch(() => {});

  const start = Date.now();
  while (Date.now() - start < DEFAULT_TIMEOUT) {
    const src = await frame.getAttribute('src').catch(() => null);
    if (src) {
      return {
        src: resolveMaybeRelativeUrl(page.url(), src),
        selector: "iframe[id^='myIframe']",
        source: 'iframe-src'
      };
    }
    await sleep(500);
  }

  return null;
}

async function clickBackToUnitsControl(page, reason) {
  const locatorFactories = [
    () => page.locator("a[onclick*='courseContentinfo']").filter({ hasText: /Back to Units/i }),
    () => page.locator("a[onclick*='courseContentinfo']"),
    () => page.locator('a.pull-left').filter({ hasText: /Back to Units/i }),
    () => page.locator('a').filter({ hasText: /Back to Units/i })
  ];

  for (const createLocator of locatorFactories) {
    const locator = createLocator();
    if (await locator.count().catch(() => 0)) {
      const first = locator.first();
      const text = await first.textContent().catch(() => '');
      const onclick = await first.getAttribute('onclick').catch(() => '');
      log(`Action: ${reason}`);
      log(`Choice: ${sanitizeName(text || 'Back to Units')} | onclick=${sanitizeName(onclick || '(none)')}`);
      await first.evaluate((element) => element.click()).catch(async () => {
        await first.click({ force: true, timeout: DEFAULT_TIMEOUT });
      });
      await waitForStablePage(page);
      return true;
    }
  }

  return false;
}

async function waitForUnitTable(page) {
  const start = Date.now();
  while (Date.now() - start < DEFAULT_TIMEOUT) {
    await page.waitForSelector('table', { timeout: 2_000 }).catch(() => {});
    const observation = await observePage(page, 'wait-for-unit-table');
    if (hasClassTable(observation) && observation.tables.some((table) =>
      table.headers.some((header) => /^slides$/i.test(header))
    )) {
      return observation;
    }
    await sleep(700);
  }
  return null;
}

async function returnToUnitTable(page, course, unit) {
  if (page.url() === 'about:blank') {
    log('Navigation error: page became about:blank before return-to-unit-table verification.');
    await recoverCourseUnitContext(page, course, unit);
    return;
  }

  let recoveryMethod = 'Back to Units';
  const usedBackControl = await clickBackToUnitsControl(
    page,
    'Returning to the unit table from the slide detail page.'
  );

  if (!usedBackControl) {
    await captureNamedDebugBundle(page, `missing-back-to-units-${course.label}-${unit.text}`, await observePage(page, 'missing-back-to-units'));
    log('Back to Units button not found. Using browser.goBack() fallback once.');
    recoveryMethod = 'browser.goBack() fallback';
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT }).catch(() => {});
    await waitForStablePage(page);
  } else {
    log('Back to Units control clicked via courseContentinfo selector');
  }

  let recoveredObservation = await waitForUnitTable(page);

  if (recoveredObservation && recoveredObservation.url === 'about:blank') {
    log('Navigation error: page became about:blank after return navigation.');
    await recoverCourseUnitContext(page, course, unit);
    return;
  }

  let restored = Boolean(recoveredObservation);
  if (!restored && usedBackControl) {
    log('Class table not detected after Back to Units. Retrying Back to Units once.');
    const retried = await clickBackToUnitsControl(
      page,
      'Retrying Back to Units because the Class and Slides table did not appear after the first return click.'
    );

    if (retried) {
      recoveredObservation = await waitForUnitTable(page);
      if (recoveredObservation && recoveredObservation.url === 'about:blank') {
        log('Navigation error: page became about:blank after the retry Back to Units click.');
        await recoverCourseUnitContext(page, course, unit);
        return;
      }
      restored = Boolean(recoveredObservation);
    }
  }

  if (!restored) {
    await recoverCourseUnitContext(page, course, unit);
    return;
  }

  log(`Navigation restored using ${recoveryMethod}`);
  log('Returned to unit table');
}

async function savePdfFromViewCandidate(page, context, candidate, course, unit, classInfo, classIndex) {
  if (candidate.reason === 'glyphicon-eye-open') {
    log('Eye icon found via glyphicon-eye-open');
  }
  log('Clicking eye icon via onclick handler');
  await page.locator(candidate.selector).first().click({ force: true, timeout: DEFAULT_TIMEOUT });
  await waitForStablePage(page);

  const iframeSource = await waitForIframePdfSource(page);
  if (iframeSource) {
    log('PDF viewer detected');
    return downloadArtifactSources(
      context,
      page,
      [iframeSource],
      course.directory,
      unit.dirName,
      classIndex,
      classInfo.classTitle,
      course.label
    );
  }

  const immediateSources = await detectImmediatePdfSources(page);
  if (immediateSources.length) {
    log(`PDF detection method succeeded: ${immediateSources.map((item) => item.source).join(' | ')}`);
    log('PDF viewer detected');
    return downloadArtifactSources(
      context,
      page,
      immediateSources,
      course.directory,
      unit.dirName,
      classIndex,
      classInfo.classTitle,
      course.label
    );
  }

  return 0;
}

async function handleSlideDetailPage(page, context, unit, course, classInfo, classIndex) {
  log('Slide detail page opened');
  let observation = await observePage(page, `slide-detail-${sanitizeName(classInfo.classTitle)}`);
  let saved = 0;
  const immediatePdfSources = await detectImmediatePdfSources(page);

  if (immediatePdfSources.length) {
    log(`PDF detection method succeeded: ${immediatePdfSources.map((item) => item.source).join(' | ')}`);
    log(`Eye icon skipped because PDF was already detectable via: ${immediatePdfSources.map((item) => item.source).join(' | ')}`);
    log('PDF viewer detected');
    saved += await downloadArtifactSources(
      context,
      page,
      immediatePdfSources,
      course.directory,
      unit.dirName,
      classIndex,
      classInfo.classTitle,
      course.label
    );
  }

  if (!saved) {
    observation = await ensureSlidesTabActive(page, observation);

    const detailTabs = detectSlideDetailTabs(observation);
    if (detailTabs.length) {
      log(`Slide detail tabs detected: ${detailTabs.map((choice) => choice.text || choice.ariaLabel || choice.title).join(' | ')}`);
    }

    const eyeCandidates = await detectGlyphiconEyeAnchors(page);
    if (eyeCandidates.length) {
      log(`Eye icon candidates found: ${eyeCandidates.map((choice) => choice.selector).join(' | ')}`);
    }
    for (const candidate of eyeCandidates) {
      saved += await savePdfFromViewCandidate(page, context, candidate, course, unit, classInfo, classIndex);
    }
  }

  if (!saved) {
    const label = `no-pdf-after-eye-${course.label}-${unit.text}-${classInfo.classTitle}`;
    const postObservation = await observePage(page, label);
    await captureNamedDebugBundle(page, label, postObservation);
    appendNote(
      'No PDF After Eye',
      `No PDF was captured after clicking the glyphicon eye control for ${course.label} / ${unit.text} / ${classInfo.classTitle}. Debug captured from ${postObservation.url}.`
    );
  }

  await returnToUnitTable(page, course, unit);
  return saved;
}

async function savePlaywrightDownload(download, targetPath) {
  ensureDir(path.dirname(targetPath));
  await download.saveAs(targetPath);
}

async function processArtifactResults(page, context, artifactResults, courseDir, unitDir, classIndex, classTitle, courseLabel) {
  const downloads = [];
  const sources = [];
  const popupPages = [];

  for (const result of artifactResults) {
    if (result.download) {
      downloads.push(result.download);
      continue;
    }

    if (result.popup) {
      const hints = await collectArtifactHints(result.popup);
      sources.push(...hints.dialogLinks, ...hints.pageLinks, ...hints.viewerSources, { url: hints.url });
      popupPages.push(result.popup);
      continue;
    }

    if (result.currentUrl) {
      sources.push({ url: result.currentUrl });
      continue;
    }

    if (result.url) {
      sources.push({ url: result.url });
    }
  }

  const totalCount = downloads.length + sources.length;
  let saved = 0;

  for (let downloadIndex = 0; downloadIndex < downloads.length; downloadIndex += 1) {
    const download = downloads[downloadIndex];
    const targetPath = buildFilePath(courseDir, unitDir, classIndex, classTitle, downloadIndex, totalCount);
    const key = makeProgressKey(courseLabel, unitDir, classTitle, `download:${downloadIndex + 1}`);
    if (!fs.existsSync(targetPath)) {
      await savePlaywrightDownload(download, targetPath);
      withProgress((state) => {
        state.downloaded[key] = {
          status: 'downloaded',
          filePath: targetPath,
          source: 'playwright-download'
        };
        state.history.push({ key, status: 'downloaded', recordedAt: now(), filePath: targetPath });
      });
      log(`Saved PDF: ${targetPath}`);
      saved += 1;
    }
  }

  saved += await downloadArtifactSources(
    context,
    page,
    sources,
    courseDir,
    unitDir,
    classIndex,
    classTitle,
    courseLabel,
    {
      startIndex: downloads.length,
      totalCount
    }
  );

  for (const popup of popupPages) {
    if (!popup.isClosed()) {
      await popup.close().catch(() => {});
    }
  }

  return saved;
}

async function downloadSlidesForRow(page, context, table, row, unit, course, classIndex) {
  await page.waitForSelector('table', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
  if (row.selector) {
    const rowLocator = page.locator(row.selector).first();
    if (await rowLocator.isVisible().catch(() => false)) {
      await rowLocator.scrollIntoViewIfNeeded().catch(() => {});
      await sleep();
    }
  }

  const classInfo = inferClassInfo(row, table.headers, table.slideIndex, classIndex);
  if (!classInfo.hasSlides) {
    return;
  }

  log(`Class ${pad2(classIndex + 1)} | ${classInfo.classTitle}`);
  const slideHeader = table.headers[table.slideIndex];
  log(`Reasoning: using column "${slideHeader}" because table-header reasoning identified it as the slides column.`);

  const triggers = classInfo.slideCell.clickables.filter((item) => item.selector);
  const directSources = classInfo.slideCell.anchors
    .map((anchor) => ({ href: anchor.href, text: anchor.text, selector: anchor.selector }))
    .filter((item) => item.href);

  if (!triggers.length && !directSources.length) {
    log(`No clickable controls found for ${classInfo.classTitle}.`);
    return;
  }

  const primaryTrigger = triggers.find((item) => /slide|pdf|view|open|download|\d+/i.test(item.text)) || triggers[0];
  let saved = 0;

  if (primaryTrigger) {
    log(`Clicking slide trigger for row ${classIndex + 1}`);
    await clickChoice(
      page,
      {
        ...primaryTrigger,
        region: 'table',
        text: primaryTrigger.text || classInfo.slideCell.text || `Slides ${classIndex + 1}`
      },
      'Opening the slide detail page from the Slides column trigger.'
    );
    saved += await handleSlideDetailPage(page, context, unit, course, classInfo, classIndex);
  } else if (directSources.length) {
    log(`No slide trigger control was visible for row ${classIndex + 1}; using direct slide link fallback.`);
    saved += await downloadArtifactSources(
      context,
      page,
      directSources,
      course.directory,
      unit.dirName,
      classIndex,
      classInfo.classTitle,
      course.label
    );
  }

  if (!saved) {
    const observation = await observePage(
      page,
      `no-pdf-after-eye-${sanitizeName(course.label)}-${sanitizeName(unit.text)}-${sanitizeName(classInfo.classTitle)}`,
      { captureDebug: true }
    );
    appendNote(
      'Uncertain Interaction',
      `Could not resolve downloadable slide artifacts after slide detail and eye/view handling for ${course.label} / ${unit.text} / ${classInfo.classTitle}. Debug snapshot captured from ${observation.url}.`
    );
    withProgress((state) => {
      const key = makeProgressKey(course.label, unit.dirName, classInfo.classTitle, 'unresolved');
      state.failed[key] = {
        status: 'unresolved',
        reason: 'No downloadable artifact was found after clicking the slide control'
      };
      state.history.push({ key, status: 'unresolved', recordedAt: now() });
    });
  }
}

async function processUnit(page, context, course, unit) {
  await openUnit(page, unit, course.label);
  await page.waitForSelector('table', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
  const observation = await observePage(page, `unit-${sanitizeName(unit.text)}`);
  let table = chooseSlidesTable(observation);

  if (!table) {
    await captureDebugBundle(page, `no-slide-table-${sanitizeName(course.label)}-${sanitizeName(unit.text)}`, observation);
    appendNote('Table Detection', `No slide table could be inferred for ${course.label} / ${unit.text}.`);
    return;
  }

  log(`Using table "${table.selector}" with headers: ${table.headers.join(' | ')}`);
  rememberSelector('tables', `${course.label}::${unit.text}`, {
    selector: table.selector,
    headers: table.headers,
    reason: 'slides table inferred from header text'
  });

  ensureDir(path.join(course.directory, unit.dirName));

  for (let rowIndex = 0; ; rowIndex += 1) {
    await page.waitForSelector('table', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
    const liveObservation = await observePage(
      page,
      `unit-${sanitizeName(unit.text)}-row-${pad2(rowIndex + 1)}`
    );
    table = chooseSlidesTable(liveObservation);
    if (!table) {
      throw new Error(`Slides table disappeared while processing ${course.label} / ${unit.text}`);
    }

    if (rowIndex >= table.rows.length) {
      break;
    }

    const row = table.rows[rowIndex];
    if (row.selector) {
      const rowLocator = page.locator(row.selector).first();
      if (await rowLocator.isVisible().catch(() => false)) {
        await rowLocator.scrollIntoViewIfNeeded().catch(() => {});
        await sleep();
      }
    }

    await downloadSlidesForRow(page, context, table, row, unit, course, rowIndex).catch(async (error) => {
      log(`Row failure for ${course.label} / ${unit.text} / row ${rowIndex + 1}: ${error.message}`);
      const observationFailure = await observePage(
        page,
        `row-failure-${sanitizeName(course.label)}-${rowIndex + 1}`,
        { captureDebug: true }
      );
      appendNote(
        'Row Failure',
        `Failed while processing ${course.label} / ${unit.text} / row ${rowIndex + 1}. Debug captured at ${observationFailure.url}. Error: ${error.message}`
      );
    });
  }
}

async function returnToMyCourses(page) {
  const observation = await observePage(page, 'return-to-my-courses');
  const backChoice = observation.choices.find((choice) =>
    /my courses/i.test(`${choice.text} ${choice.ariaLabel} ${choice.title}`)
  );

  if (backChoice) {
    await clickChoice(page, backChoice, 'Returning to My Courses through the visible navigation entry.');
    return;
  }

  await goToMyCourses(page);
}

async function run() {
  initFiles();
  if (!process.env.PESU_USERNAME || !process.env.PESU_PASSWORD) {
    throw new Error('PESU_USERNAME and PESU_PASSWORD must both be set in .env');
  }

  log('Starting PESU adaptive browser agent');
  appendNote('Run Start', 'Agent run started with visible Chromium and adaptive page inspection enabled.');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chromium',
    headless: false,
    acceptDownloads: true,
    downloadsPath: TMP_DOWNLOAD_DIR,
    viewport: { width: 1440, height: 960 },
    args: ['--start-maximized']
  });
  context.setDefaultTimeout(DEFAULT_TIMEOUT);

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  try {
    await withRetries('Open PESU Academy', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
      await waitForStablePage(page);
    });

    await loginIfNeeded(page);
    await goToMyCourses(page);

    const initialCourses = await discoverCourses(page);
    for (let courseIndex = 0; courseIndex < initialCourses.length; courseIndex += 1) {
      await returnToMyCourses(page).catch(() => {});
      const refreshedCourses = await discoverCourses(page);
      const courseChoice = refreshedCourses[courseIndex];
      if (!courseChoice) {
        log(`Course index ${courseIndex + 1} no longer exists after refresh. Skipping.`);
        continue;
      }

      const course = await openCourse(page, courseChoice);
      ensureDir(course.directory);

      const units = await discoverUnits(page, course.label);
      for (const unit of units) {
        await processUnit(page, context, course, unit);
      }
    }
  } finally {
    appendNote('Run End', 'Agent run finished.');
    log('Finished PESU adaptive browser agent');
    await context.close().catch(() => {});
  }
}

run().catch((error) => {
  ensureDir(LOG_DIR);
  fs.appendFileSync(LOG_FILE, `[${now()}] Fatal error: ${error.stack || error.message}\n`);
  console.error(error.message);
  process.exitCode = 1;
});

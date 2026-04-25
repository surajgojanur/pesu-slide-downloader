#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT_DIR, '.chromium-profile');
const DOWNLOAD_ROOT = path.join(ROOT_DIR, 'downloads', 'PESU_Academy');
const TMP_DOWNLOAD_DIR = path.join(ROOT_DIR, '.tmp-downloads');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'pesu-download.log');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'screenshots');
const MEMORY_DIR = path.join(ROOT_DIR, 'memory');
const PROGRESS_FILE = path.join(MEMORY_DIR, 'pesu-progress.json');
const BASE_URL = 'https://www.pesuacademy.com/';
const DEFAULT_TIMEOUT = 20_000;
const RETRY_COUNT = 3;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestamp() {
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

function serialPrefix(index) {
  return String(index + 1).padStart(2, '0');
}

function log(message) {
  const line = `[${timestamp()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

async function promptEnter(message) {
  process.stdout.write(`${message}\n`);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise((resolve) => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    return {
      downloaded: {},
      history: [],
      lastUpdated: null,
    };
  }

  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch (error) {
    log(`Progress file was invalid JSON. Starting fresh: ${error.message}`);
    return {
      downloaded: {},
      history: [],
      lastUpdated: null,
    };
  }
}

function saveProgress(progress) {
  progress.lastUpdated = timestamp();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function markProgress(progress, key, value) {
  progress.downloaded[key] = value;
  progress.history.push({
    key,
    ...value,
    recordedAt: timestamp(),
  });
  if (progress.history.length > 5000) {
    progress.history = progress.history.slice(-5000);
  }
  saveProgress(progress);
}

async function withRetries(taskName, fn, options = {}) {
  const retries = options.retries ?? RETRY_COUNT;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      log(`${taskName} failed on attempt ${attempt}/${retries}: ${error.message}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

async function waitForStablePage(page) {
  await Promise.race([
    page.waitForLoadState('networkidle', { timeout: 10_000 }),
    page.waitForLoadState('domcontentloaded', { timeout: 10_000 }),
  ]).catch(() => {});
}

async function takeErrorScreenshot(page, label) {
  try {
    const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${sanitizeName(label, 'error')}.png`;
    const target = path.join(SCREENSHOT_DIR, fileName);
    await page.screenshot({ path: target, fullPage: true });
    log(`Saved error screenshot: ${target}`);
  } catch (error) {
    log(`Failed to save screenshot: ${error.message}`);
  }
}

async function gotoWithRetries(page, url, label) {
  await withRetries(`Navigate ${label}`, async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
    await waitForStablePage(page);
  });
}

async function clickLocatorWithRetries(locator, label) {
  await withRetries(`Click ${label}`, async () => {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: DEFAULT_TIMEOUT });
  });
}

async function waitForLoginIfNeeded(page) {
  const signInVisible = await page.getByRole('button', { name: /sign in/i }).isVisible().catch(() => false);
  const usernameVisible = await page
    .locator('input[name="j_username"], input[placeholder*="Username"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (signInVisible || usernameVisible) {
    log('Login page detected.');
    await promptEnter('Please log in manually, then press Enter in terminal.');
    await waitForStablePage(page);
  }
}

async function clickMyCourses(page) {
  const selectors = [
    () => page.getByRole('link', { name: /my courses/i }).first(),
    () => page.getByRole('button', { name: /my courses/i }).first(),
    () => page.locator('a:has-text("My Courses"), button:has-text("My Courses"), [role="tab"]:has-text("My Courses")').first(),
    () => page.locator('a[href*="course"], a[href*="Courses"], a[href*="mycourse"]').filter({ hasText: /my courses/i }).first(),
  ];

  for (const getLocator of selectors) {
    const locator = getLocator();
    if (await locator.isVisible().catch(() => false)) {
      await clickLocatorWithRetries(locator, 'My Courses');
      await waitForStablePage(page);
      return true;
    }
  }

  return false;
}

async function ensureOnMyCourses(page) {
  const title = await page.title().catch(() => '');
  const url = page.url();
  if (/my.?courses/i.test(title) || /my.?courses/i.test(url) || /getMyCourses/i.test(url)) {
    return;
  }

  const clicked = await clickMyCourses(page);
  if (clicked) {
    return;
  }

  const candidateUrls = [
    'https://www.pesuacademy.com/Academy/student/getMyCourses',
    'https://www.pesuacademy.com/Academy/student/myCourses',
    'https://www.pesuacademy.com/Academy/myCourses',
  ];

  for (const url of candidateUrls) {
    try {
      await gotoWithRetries(page, url, 'My Courses fallback');
      return;
    } catch (error) {
      log(`My Courses fallback failed for ${url}: ${error.message}`);
    }
  }
}

async function discoverCourses(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 40 && rect.height > 18;
    };

    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const candidates = [];
    const seen = new Set();

    const selectors = [
      'a[href]',
      'button',
      '[role="link"]',
      '.course a',
      '.course-card a',
      '.subject a',
      '.card a',
      'tr',
      '.mat-row',
      '.list-group-item',
    ];

    const elements = Array.from(document.querySelectorAll(selectors.join(',')));
    for (const element of elements) {
      if (!isVisible(element)) continue;
      if (element.closest('nav, header, footer, .navbar, .sidebar, .menu')) continue;

      const anchor = element.matches('a[href]') ? element : element.querySelector('a[href]');
      const text = clean(element.innerText || anchor?.innerText || element.textContent);
      const href = anchor?.href || '';
      const lower = `${text} ${href}`.toLowerCase();

      if (text.length < 6) continue;
      if (!/(course|subject|class|section|semester|academ|pesu|[a-z]{2}\d{2}[a-z]{2,}|[a-z]{3}\d{3,})/i.test(lower)) continue;
      if (/sign in|logout|faq|forgot|forum|profile|timetable|attendance|results/.test(lower)) continue;

      const key = `${text}::${href}`;
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({
        text,
        href,
      });
    }

    return candidates;
  });
}

function parseCourseIdentity(text, href) {
  const cleanText = sanitizeName(text);
  const directMatch = cleanText.match(/^([A-Z0-9]{6,})\s*[-:]\s*(.+)$/i);
  if (directMatch) {
    return {
      code: sanitizeName(directMatch[1]),
      name: sanitizeName(directMatch[2]),
      label: `${sanitizeName(directMatch[1])} - ${sanitizeName(directMatch[2])}`,
      href,
      rawText: cleanText,
    };
  }

  const tokenMatch = cleanText.match(/([A-Z]{1,4}\d{2,}[A-Z0-9]*)/i);
  if (tokenMatch) {
    const code = sanitizeName(tokenMatch[1]);
    const name = sanitizeName(cleanText.replace(tokenMatch[1], '').replace(/^[-:\s]+/, ''), cleanText);
    return {
      code,
      name,
      label: `${code} - ${name}`,
      href,
      rawText: cleanText,
    };
  }

  return {
    code: 'UNKNOWN',
    name: cleanText,
    label: cleanText,
    href,
    rawText: cleanText,
  };
}

async function resolveCourseList(page) {
  const candidates = await withRetries('Discover course list', async () => {
    const result = await discoverCourses(page);
    if (!result.length) {
      throw new Error('No visible course candidates found on My Courses page');
    }
    return result;
  });

  const courses = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const course = parseCourseIdentity(candidate.text, candidate.href);
    if (seen.has(course.label)) continue;
    seen.add(course.label);
    courses.push(course);
  }

  return courses;
}

async function navigateToCourse(page, course) {
  log(`Course: ${course.label}`);
  if (course.href && /^https?:/i.test(course.href)) {
    await gotoWithRetries(page, course.href, `course ${course.label}`);
    return;
  }

  await ensureOnMyCourses(page);
  const escaped = course.rawText.replace(/"/g, '\\"');
  const locator = page.locator(
    [
      `a:has-text("${escaped}")`,
      `button:has-text("${escaped}")`,
      `tr:has-text("${escaped}") a`,
      `tr:has-text("${escaped}") button`,
      `.card:has-text("${escaped}") a`,
      `.course:has-text("${escaped}") a`,
    ].join(', ')
  ).first();

  await clickLocatorWithRetries(locator, `course ${course.label}`);
  await waitForStablePage(page);
}

async function discoverUnits(page) {
  const units = await page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 12;
    };
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const selectors = [
      '[role="tab"]',
      '.nav-tabs a',
      '.nav-tabs button',
      '.tab a',
      '.tab button',
      '.tabs a',
      '.tabs button',
      '.mat-tab-label',
      'a[href*="unit"]',
    ];

    const items = [];
    const seen = new Set();

    for (const element of document.querySelectorAll(selectors.join(','))) {
      if (!isVisible(element)) continue;
      const text = clean(element.innerText || element.textContent);
      if (!text) continue;

      const lowered = text.toLowerCase();
      if (!/(unit|module|chapter|lesson)/.test(lowered)) continue;
      const key = text;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({ text });
    }

    return items;
  });

  if (!units.length) {
    return [{ text: 'Unit 01' }];
  }

  return units;
}

function parseUnitIdentity(text, index) {
  const cleanText = sanitizeName(text, `Unit ${serialPrefix(index)}`);
  const match = cleanText.match(/(Unit|Module|Chapter|Lesson)\s*0*([0-9]+)/i);
  const unitNumber = match ? Number(match[2]) : index + 1;
  let unitName = cleanText;

  if (match) {
    unitName = cleanText.replace(match[0], '').replace(/^[-:\s]+/, '').trim() || cleanText;
  }

  return {
    index,
    number: unitNumber,
    text: cleanText,
    dirName: `Unit ${String(unitNumber).padStart(2, '0')} - ${sanitizeName(unitName, cleanText)}`,
  };
}

async function activateUnit(page, unit) {
  const escaped = unit.text.replace(/"/g, '\\"');
  const locator = page.locator(
    [
      `[role="tab"]:has-text("${escaped}")`,
      `.nav-tabs a:has-text("${escaped}")`,
      `.nav-tabs button:has-text("${escaped}")`,
      `.mat-tab-label:has-text("${escaped}")`,
      `a:has-text("${escaped}")`,
      `button:has-text("${escaped}")`,
    ].join(', ')
  ).first();

  if (await locator.isVisible().catch(() => false)) {
    await clickLocatorWithRetries(locator, `unit ${unit.text}`);
    await waitForStablePage(page);
  }
}

async function readClassRows(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 40 && rect.height > 10;
    };

    const headerMap = new Map();
    const table = document.querySelector('table');
    if (table) {
      const headers = Array.from(table.querySelectorAll('thead th, tr th'));
      headers.forEach((header, index) => {
        headerMap.set(index, clean(header.textContent).toLowerCase());
      });
    }

    const rows = [];
    const tableRows = Array.from(document.querySelectorAll('table tbody tr, table tr, .mat-row'));
    for (const row of tableRows) {
      if (!isVisible(row)) continue;
      const cells = Array.from(row.querySelectorAll('td, .mat-cell'));
      if (!cells.length) continue;

      const cellTexts = cells.map((cell) => clean(cell.innerText || cell.textContent));
      const text = clean(row.innerText || row.textContent);
      if (!text) continue;

      let title = '';
      let slideHref = '';
      let slideText = '';

      cells.forEach((cell, index) => {
        const header = headerMap.get(index) || '';
        const link = cell.querySelector('a[href], button, [role="button"], [onclick]');
        const cellText = cellTexts[index];

        if (!title && header && /(class|topic|title|lecture|session|name)/.test(header) && cellText) {
          title = cellText;
        }

        if (!slideHref && (/(slides|slide|ppt|material|pdf|notes)/.test(header) || /\.(pdf|ppt|pptx)$/i.test(cellText))) {
          const anchor = cell.querySelector('a[href]');
          if (anchor?.href) {
            slideHref = anchor.href;
            slideText = clean(anchor.innerText || anchor.textContent) || cellText;
          } else if (link) {
            slideText = cellText || clean(link.innerText || link.textContent);
          }
        }
      });

      if (!title) {
        title = cellTexts.find((cell) => cell && !/^\d+$/.test(cell) && !/^(yes|no|na|n\/a)$/i.test(cell)) || text;
      }

      const directAnchor = row.querySelector('a[href*=".pdf"], a[href*="slide"], a[href*="Slides"], a[href*="material"], a[href*="download"]');
      if (!slideHref && directAnchor?.href) {
        slideHref = directAnchor.href;
        slideText = clean(directAnchor.innerText || directAnchor.textContent);
      }

      const hasSlideTrigger = Boolean(slideHref || row.querySelector('a[href], button, [role="button"], [onclick]'));
      rows.push({
        rowText: text,
        classTitle: title,
        slideHref,
        slideText,
        hasSlideTrigger,
      });
    }

    return rows.filter((row) => row.hasSlideTrigger);
  });
}

function buildCookieHeader(cookies, urlString) {
  const url = new URL(urlString);
  const applicable = cookies.filter((cookie) => {
    const domain = cookie.domain?.replace(/^\./, '');
    const domainMatch = !domain || url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    const pathMatch = url.pathname.startsWith(cookie.path || '/');
    return domainMatch && pathMatch;
  });

  return applicable.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function fetchBufferWithContextCookies(context, urlString) {
  const cookies = await context.cookies();
  const headers = {};
  const cookieHeader = buildCookieHeader(cookies, urlString);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const response = await fetch(urlString, {
    method: 'GET',
    headers,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${urlString}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';
  return { buffer, contentType, finalUrl: response.url };
}

async function saveDownloadObject(download, targetPath) {
  await download.saveAs(targetPath);
}

async function saveBlobFromPage(page, targetPath) {
  const base64 = await page.evaluate(async () => {
    const response = await fetch(window.location.href);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
    }
    return btoa(binary);
  });

  fs.writeFileSync(targetPath, Buffer.from(base64, 'base64'));
}

async function tryDirectSave(context, href, targetPath) {
  if (!href || !/^https?:/i.test(href)) {
    return false;
  }

  const { buffer, contentType, finalUrl } = await fetchBufferWithContextCookies(context, href);
  if (!buffer.length) {
    return false;
  }

  if (!/pdf|octet-stream|application\/binary/i.test(contentType) && !/\.pdf(?:$|\?)/i.test(finalUrl) && !/download/i.test(finalUrl)) {
    return false;
  }

  fs.writeFileSync(targetPath, buffer);
  return true;
}

async function handlePopupOrPage(openedPage, context, targetPath, options = {}) {
  const closeWhenDone = options.closeWhenDone ?? true;
  await openedPage.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT }).catch(() => {});
  await waitForStablePage(openedPage);
  const url = openedPage.url();

  if (/^https?:/i.test(url)) {
    try {
      const saved = await tryDirectSave(context, url, targetPath);
      if (saved) {
        if (closeWhenDone && !openedPage.isClosed()) {
          await openedPage.close().catch(() => {});
        }
        return true;
      }
    } catch (error) {
      log(`Popup direct save failed for ${url}: ${error.message}`);
    }
  }

  if (/^blob:/i.test(url)) {
    await saveBlobFromPage(openedPage, targetPath);
    if (closeWhenDone && !openedPage.isClosed()) {
      await openedPage.close().catch(() => {});
    }
    return true;
  }

  const embeddedPdf = await openedPage
    .locator('embed[type*="pdf"], iframe[src*=".pdf"], iframe[src*="blob:"]')
    .first()
    .count()
    .catch(() => 0);

  if (embeddedPdf) {
    const frameSrc = await openedPage.locator('embed[type*="pdf"], iframe').first().getAttribute('src').catch(() => null);
    if (frameSrc && /^https?:/i.test(frameSrc)) {
      const saved = await tryDirectSave(context, frameSrc, targetPath);
      if (saved) {
        if (closeWhenDone && !openedPage.isClosed()) {
          await openedPage.close().catch(() => {});
        }
        return true;
      }
    }
    if (frameSrc && /^blob:/i.test(frameSrc)) {
      await saveBlobFromPage(openedPage, targetPath);
      if (closeWhenDone && !openedPage.isClosed()) {
        await openedPage.close().catch(() => {});
      }
      return true;
    }
  }

  return false;
}

async function triggerSlideCapture(page, context, linkLocator, fallbackHref, targetPath) {
  try {
    const saved = await tryDirectSave(context, fallbackHref, targetPath);
    if (saved) {
      return { method: 'direct-fetch' };
    }
  } catch (error) {
    log(`Direct fetch failed, falling back to UI flow: ${error.message}`);
  }

  const downloadPromise = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null);
  const popupPromise = context.waitForEvent('page', { timeout: 8_000 }).catch(() => null);
  const previousUrl = page.url();

  await linkLocator.scrollIntoViewIfNeeded().catch(() => {});
  await linkLocator.click({ timeout: DEFAULT_TIMEOUT, force: true });

  const download = await downloadPromise;
  if (download) {
    await saveDownloadObject(download, targetPath);
    return { method: 'download-event' };
  }

  const popup = await popupPromise;
  if (popup) {
    const handled = await handlePopupOrPage(popup, context, targetPath);
    if (handled) {
      return { method: 'popup' };
    }
  }

  const currentUrl = page.url();
  if ((/^https?:/i.test(currentUrl) || /^blob:/i.test(currentUrl)) && currentUrl !== previousUrl) {
    const handled = await handlePopupOrPage(page, context, targetPath, { closeWhenDone: false });
    if (handled) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT }).catch(() => {});
      await waitForStablePage(page);
      return { method: 'same-tab' };
    }
  }

  throw new Error('No download, popup, or PDF view was captured');
}

async function findRowLocator(page, rowIdentifier) {
  const escaped = rowIdentifier.replace(/"/g, '\\"');
  const selectors = [
    `table tbody tr:has-text("${escaped}")`,
    `table tr:has-text("${escaped}")`,
    `.mat-row:has-text("${escaped}")`,
    `tr:has-text("${escaped}")`,
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      return locator;
    }
  }

  throw new Error(`Could not relocate table row for class "${rowIdentifier}"`);
}

async function processClassRow(page, context, courseDir, unitDir, classInfo, classIndex, progress, courseLabel, unitLabel) {
  const safeTitle = sanitizeName(classInfo.classTitle, `Class ${serialPrefix(classIndex)}`);
  const fileName = `${serialPrefix(classIndex)} - ${safeTitle}.pdf`;
  const targetDir = path.join(courseDir, unitDir);
  const targetPath = path.join(targetDir, fileName);
  const progressKey = `${courseLabel}::${unitLabel}::${safeTitle}`;

  ensureDir(targetDir);

  if (fs.existsSync(targetPath)) {
    log(`  Class ${serialPrefix(classIndex)}: ${safeTitle} -> SKIP (already exists)`);
    markProgress(progress, progressKey, {
      status: 'skipped-existing',
      filePath: targetPath,
    });
    return false;
  }

  log(`  Class ${serialPrefix(classIndex)}: ${safeTitle} -> START`);

  const rowLocator = await findRowLocator(page, classInfo.rowText || classInfo.classTitle);
  const linkLocator = rowLocator
    .locator('a[href], button, [role="button"], [onclick]')
    .filter({ hasText: /slide|pdf|ppt|material|download|open|view/i })
    .first();

  const finalLinkLocator = (await linkLocator.count().catch(() => 0))
    ? linkLocator
    : rowLocator.locator('a[href], button, [role="button"], [onclick]').first();

  const result = await withRetries(`Download ${safeTitle}`, async () => {
    const capture = await triggerSlideCapture(page, context, finalLinkLocator, classInfo.slideHref, targetPath);
    if (!fs.existsSync(targetPath)) {
      throw new Error('Target file was not created');
    }
    return capture;
  });

  markProgress(progress, progressKey, {
    status: 'downloaded',
    filePath: targetPath,
    method: result.method,
  });
  log(`  Class ${serialPrefix(classIndex)}: ${safeTitle} -> SAVED (${result.method})`);
  return true;
}

async function processUnit(page, context, courseDir, unitText, unitIndex, progress, courseLabel) {
  const unit = parseUnitIdentity(unitText, unitIndex);
  log(` Unit ${String(unit.number).padStart(2, '0')}: ${unit.text}`);
  await activateUnit(page, unit);

  const rows = await withRetries(`Read rows for ${unit.text}`, async () => {
    const data = await readClassRows(page);
    if (!data.length) {
      throw new Error(`No class rows found for ${unit.text}`);
    }
    return data;
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    try {
      await processClassRow(page, context, courseDir, unit.dirName, row, rowIndex, progress, courseLabel, unit.dirName);
      await waitForStablePage(page);
    } catch (error) {
      log(`  Class failure in ${unit.dirName} for "${row.classTitle}": ${error.message}`);
      await takeErrorScreenshot(page, `${courseLabel}-${unit.dirName}-${row.classTitle}`);
      markProgress(progress, `${courseLabel}::${unit.dirName}::${sanitizeName(row.classTitle)}`, {
        status: 'failed',
        error: error.message,
      });
    }
  }
}

async function main() {
  ensureDir(PROFILE_DIR);
  ensureDir(DOWNLOAD_ROOT);
  ensureDir(TMP_DOWNLOAD_DIR);
  ensureDir(LOG_DIR);
  ensureDir(SCREENSHOT_DIR);
  ensureDir(MEMORY_DIR);
  if (!fs.existsSync(PROGRESS_FILE)) {
    saveProgress(loadProgress());
  }

  log('Starting PESU Academy slide downloader');
  const progress = loadProgress();

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chromium',
    headless: false,
    acceptDownloads: true,
    downloadsPath: TMP_DOWNLOAD_DIR,
    viewport: { width: 1440, height: 960 },
    args: ['--start-maximized'],
  });

  context.setDefaultTimeout(DEFAULT_TIMEOUT);

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  try {
    await gotoWithRetries(page, BASE_URL, 'PESU Academy');
    await waitForLoginIfNeeded(page);
    await ensureOnMyCourses(page);
    await waitForStablePage(page);

    const courses = await resolveCourseList(page);
    log(`Discovered ${courses.length} course candidates`);

    for (const course of courses) {
      try {
        await navigateToCourse(page, course);
        const courseDirName = sanitizeName(course.label, course.name);
        const courseDir = path.join(DOWNLOAD_ROOT, courseDirName);
        ensureDir(courseDir);

        const units = await discoverUnits(page);
        for (let i = 0; i < units.length; i += 1) {
          await processUnit(page, context, courseDir, units[i].text, i, progress, course.label);
        }
      } catch (error) {
        log(`Course failure for ${course.label}: ${error.message}`);
        await takeErrorScreenshot(page, course.label);
      } finally {
        await ensureOnMyCourses(page).catch(() => {});
      }
    }
  } finally {
    saveProgress(progress);
    log('Finished PESU Academy slide downloader');
    await context.close().catch(() => {});
  }
}

main().catch(async (error) => {
  ensureDir(LOG_DIR);
  ensureDir(SCREENSHOT_DIR);
  fs.appendFileSync(LOG_FILE, `[${timestamp()}] Fatal error: ${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});

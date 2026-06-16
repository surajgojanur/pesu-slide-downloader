# Technical Documentation — PESU Academy Slide Downloader

This document is the deep reference for developers working on the codebase. For
user-facing setup and usage, see [README.md](./README.md).

- [1. Architecture Overview](#1-architecture-overview)
- [2. Runtime Lifecycle](#2-runtime-lifecycle)
- [3. Module Breakdown](#3-module-breakdown)
  - [3.1 `src/core/downloader.js`](#31-srccoredownloaderjs)
  - [3.2 `src/core/browserResolver.js`](#32-srccorebrowserresolverjs)
  - [3.3 `src/core/unitTools.js`](#33-srccoreunittoolsjs)
  - [3.4 `src/core/progressStore.js`](#34-srccoreprogressstorejs)
  - [3.5 `src/core/logger.js`](#35-srccoreloggerjs)
  - [3.6 `src/core/fileUtils.js`](#36-srccorefileutilsjs)
  - [3.7 `src/core/pesuAgent.js`](#37-srccorepesuagentjs)
  - [3.8 `src/cli/index.js`](#38-srccliindexjs)
  - [3.9 `src/desktop/`](#39-srcdesktop)
  - [3.10 `scripts/`](#310-scripts)
- [4. Data Flow](#4-data-flow)
- [5. The "Wrong Unit" Problem & Verified Activation](#5-the-wrong-unit-problem--verified-activation)
- [6. PDF Source Detection Strategies](#6-pdf-source-detection-strategies)
- [7. Persistent State & File Layout](#7-persistent-state--file-layout)
- [8. IPC Contract (Desktop)](#8-ipc-contract-desktop)
- [9. Configuration Reference](#9-configuration-reference)
- [10. Testing Strategy](#10-testing-strategy)
- [11. Packaging](#11-packaging)
- [12. Known Issues & TODOs](#12-known-issues--todos)

---

## 1. Architecture Overview

The system is a **layered** Node.js application. A single browser-agnostic core
engine is reused by two front-ends (Electron desktop and CLI) plus legacy scripts.

```text
┌───────────────────────────┐   ┌──────────────────────────┐
│  Electron Desktop          │   │  CLI                     │
│  src/desktop/main.js       │   │  src/cli/index.js        │
│  + preload + renderer      │   │  (dotenv + arg parsing)  │
└─────────────┬─────────────┘   └────────────┬─────────────┘
              │  createPESUAgent({...defaults})            │
              └──────────────┬───────────────┘
                             ▼
                 src/core/pesuAgent.js
                 (factory → run / requestStop)
                             ▼
                 src/core/downloader.js
                 runPESUDownloader(options)
        ┌────────────────────┼─────────────────────────────┐
        ▼                    ▼                              ▼
 browserResolver.js     unitTools.js (pure)        progressStore.js
 (Chromium binary)      logger.js · fileUtils.js   (ledger + events)
        ▼
   Playwright → persistent Chromium context → PESU Academy
```

**Design principles**

- **Adaptive, not hard-coded.** Rather than committing to fixed CSS selectors,
  the engine `observePage()`s the live DOM (headings, clickable choices, tables,
  dialogs, forms) and *reasons* about which elements are courses / units / slide
  triggers. Successful selectors are cached to `memory/pesu-learned-selectors.json`.
- **Prove, don't assume.** Because PESU is a single-page app with deceptive
  state (sticky "active" classes, "Back to Units" resetting to Unit 1), the
  engine verifies the loaded unit by content fingerprint before saving.
- **Single global runtime.** `downloader.js` holds one module-level `runtime`
  object per run; `runPESUDownloader` throws if a run is already active.

---

## 2. Runtime Lifecycle

`runPESUDownloader(options)` (in `downloader.js`) is the orchestrator:

1. **`buildRuntime(options)`** — validates `username`/`password`, resolves all
   paths (downloads, logs, memory, debug, profile, temp), resolves the Chromium
   launch config via `browserResolver`, and builds the `logger` and
   `progressStore`. Returns the `runtime` singleton.
2. **`initFiles()`** — creates directories and seeds `pesu-progress.json`,
   `pesu-learned-selectors.json`, and `pesu-notes.md` if missing.
3. **Launch** `chromium.launchPersistentContext(profileDir, …)` with
   `acceptDownloads`, a temp downloads dir, and a maximized 1440×960 viewport.
4. **`loginIfNeeded(page)`** — detects a login form and fills/submits credentials,
   or continues with the persisted session.
5. **`goToMyCourses` → `discoverCourses`** — find the *My Courses* table.
6. For each course index: re-discover courses (the DOM is stale after navigation),
   `openCourse`, `discoverUnits`, build a `unitPlan` with normalized identities.
7. For each unit: **`processUnit`** — verified open, slide-table detection,
   per-row download loop, duplicate-source guard.
8. **Summarize** counts, persist progress, close the context, reset `runtime`.

Cancellation: `requestStop()` flips `runtime.stopRequested`; `throwIfStopRequested(stage)`
is checked at every course/unit/row/asset boundary to unwind cleanly.

---

## 3. Module Breakdown

### 3.1 `src/core/downloader.js`

The heart of the system (~2600 lines). Responsibilities grouped by concern:

**Runtime & utilities**
- `buildRuntime`, `getRuntime`, `getPaths`, `getProgressStore` — runtime accessors.
- `requestStop`, `throwIfStopRequested`, `sleep` — cancellation & pacing.
- `withRetries(taskName, fn)` — generic 3-attempt retry with backoff.
- `log`, `appendNote(section, message)` — logging + append to `pesu-notes.md`.
- `rememberSelector` / `withLearnedSelectors` — persist working selectors (capped at 12 per label).

**Page observation**
- `observePage(page, label, {captureDebug})` — the core sensor. Runs an in-page
  `evaluate()` that extracts visible **headings**, **choices** (links/buttons/tabs
  with geometry + region), **tables** (headers, rows, cells, anchors, clickables),
  **dialogs**, and login **forms**. Returns a structured `observation`.
- `captureDebugBundle` / `captureNamedDebugBundle` — save `.png` + `.html` + `.json`
  diagnostic triples to `debug/`.
- `waitForStablePage` — race `networkidle` vs `domcontentloaded` then a delay.

**Login**
- `detectLoginState`, `loginIfNeeded`, `fillFirstVisible` — locate and fill the
  username/password fields (`j_username`/`j_password` and label/placeholder
  fallbacks), submit, and verify the login left the sign-in page.

**Course discovery**
- `chooseMyCoursesTable` / `extractCourseCandidatesFromTable` — preferred path:
  find a table with *Course Code / Course Title / Action* headers.
- `selectCourseCandidates` / `scoreCourseChoice` — heuristic fallback that scores
  link/button text (course-code regex, ` - ` separators, penalizing nav items).
- `parseCourseIdentity` — extract `{code, name}` from text/headings/title.
- `openCourse` / `openCourseFromTableRow` — click into a course (Action control →
  title cell → row fallbacks).

**Unit discovery & verified activation** (see §5)
- `detectUnitChoices` — cluster content-area choices into rows by vertical
  position, skip the ignored top-level tabs, and parse the unit row.
- `discoverUnits` — wraps detection with logging and debug capture.
- `getActiveUnitState` — read any element marked `active`/`aria-selected` to learn
  which tab the SPA *claims* is active.
- `headingMatchesUnit`, `waitForUnitActivation`, `openUnitVerified`,
  `ensureUnitActive` — the verification machinery.

**Slide table & class parsing**
- `chooseSlidesTable` — score tables by a *Slides/PDF/Material/Notes* header.
- `inferClassInfo(row, headers, slideIndex, rowIndex)` — derive class number,
  title, the slide cell, and whether the row `hasSlides`.

**PDF acquisition** (see §6)
- `collectArtifactHints`, `detectImmediatePdfSources` — scan iframes/embeds/objects,
  dialog/page links, and `onclick="loadIframe('…downloadslidecoursedoc…')"` handlers.
- `detectGlyphiconEyeAnchors`, `savePdfFromViewCandidate`, `handleSlideDetailPage`,
  `ensureSlidesTabActive` — the slide-detail "eye icon → iframe src" flow.
- `waitForIframePdfSource` — poll `iframe[id^='myIframe']` for its `src`.
- `directDownload`, `fetchBufferWithCookies`, `buildCookieHeader`,
  `saveBlobFromPage`, `savePlaywrightDownload` — actual byte retrieval, reusing the
  browser's session cookies for authenticated `fetch`.
- `triggerDownloadByClick`, `processArtifactResults` — handle download events,
  popups, and same-tab navigations produced by a click.
- `downloadArtifactSources` — de-duplicate sources, build target paths, skip
  existing files, write PDFs, record progress.

**Navigation recovery**
- `clickBackToUnitsControl`, `waitForUnitTable`, `returnToUnitTable`,
  `recoverCourseUnitContext` — return to the class table after a slide, with
  `about:blank`/failure recovery that re-opens the course and unit from scratch.

**Top-level loop**
- `processUnit` — the per-unit driver (verify activation → detect table → row loop
  → duplicate-source guard).
- `downloadSlidesForRow` — per-row driver (trigger → slide detail → save → record).
- `runPESUDownloader` — the exported entrypoint.

**Test hooks** — `module.exports.__test` exposes `setRuntime`/`clearRuntime`/
`processUnit`/`discoverUnits`/`openUnitVerified`/`ensureUnitActive` so the
simulation test can drive real navigation logic without a browser.

### 3.2 `src/core/browserResolver.js`

Resolves which Chromium executable Playwright should launch, in priority order:

1. **Bundled** — `playwright-browsers/` in the app root (dev) or
   `resourcesPath/playwright-browsers` (packaged), if it contains a `chromium-*`
   dir and a valid executable. `requirePlaywright(root)` sets
   `PLAYWRIGHT_BROWSERS_PATH` accordingly.
2. **Playwright default cache** — the standard install location.
3. **System Chromium/Chrome** — platform-specific path probing (Linux paths +
   `command -v`, macOS app bundles, Windows Program Files).

Throws `BROWSER_NOT_INSTALLED_MESSAGE` (code `PLAYWRIGHT_BROWSER_MISSING`) if none
are found. Returns `{ browserRoot, chromium, executablePath, source }`.

### 3.3 `src/core/unitTools.js`

Pure, dependency-light helpers (only Node `crypto`), exhaustively unit-tested:

- `SPEED_PRESETS` — `{fast:250, normal:800, slow:1400, safe:2200}`.
- `IGNORED_UNIT_TABS` — top-level course tabs that are never content units.
- `normalizeUnitIdentity(text)` → `{raw, number, keyword, label, normalized, isUnit, isIgnored}`.
  Handles `Unit 1`, `Unit 01`, `unit-2`, `UNIT_3`, `UNIT IV` (roman), `Module/Chapter/Lesson N`.
- `romanToInt(roman)` — roman numeral parser.
- `findUnitByIdentity(units, intended)` — match a discovered unit by number, then normalized label.
- `pickFingerprintTable` / `fingerprintSlidesTable(observation)` → `{hash, rowCount, rowTexts, sourceKeys, isEmpty}`.
- `fingerprintsDiffer(prev, cur)` — hash comparison.
- `parseSpeedOption({speed, delayMs})` → `{actionDelayMs, label, source}`; `delayMs` (0–60000) overrides `speed`; invalid input throws.
- `sourceSetFingerprint(sources)` / `isDuplicateSourceSet(prevKeys, curKeys)` — detect two units resolving to identical PDF URL sets.

### 3.4 `src/core/progressStore.js`

`createProgressStore({progressFile, onProgress})` maintains an in-memory `summary`
(`downloaded`/`skipped`/`failed`) and a persisted ledger (`downloaded`, `failed`,
`history`, `lastUpdated`). Methods:

- `recordDownloaded(key, value)` — increments `skipped` for `skipped-existing`, else `downloaded`; persists & emits.
- `recordFailed(key, value)` — increments `failed`; persists & emits.
- `note(message, extra)` — emit a progress event without changing counts.
- `snapshot()` → `{counts, progress}`.

Every mutation calls `persist()` (writes JSON) and `emit()` (invokes the
`onProgress` callback the desktop main process forwards to the renderer).

### 3.5 `src/core/logger.js`

`createLogger({logFile, onLog, secrets})` returns `{log, error}`. Each `emit`
timestamps the line, **redacts** any configured secrets (username/password) by
string replacement, appends to the log file, mirrors to `console`, and invokes the
optional `onLog` callback for the UI.

### 3.6 `src/core/fileUtils.js`

Small shared helpers: `ensureDir`, `now` (ISO timestamp),
`sanitizeName(value, fallback)` (strips control & filesystem-illegal characters),
`loadJson(file, fallback)`, `saveJson(file, value)`.

### 3.7 `src/core/pesuAgent.js`

`createPESUAgent(defaults)` → `{ requestStop, run(overrides) }`. A thin factory
that merges constructor defaults with per-run overrides and calls
`runPESUDownloader`. This is the only core surface the front-ends touch.

### 3.8 `src/cli/index.js`

CLI entrypoint. Loads `.env` via dotenv, parses flags (`parseArgs`), resolves the
speed via `parseSpeedOption`, builds an agent with `workspaceDir = repo root`, and
runs it, printing a final `downloaded/skipped/failed` summary. Exits non-zero on
invalid speed or runtime error.

### 3.9 `src/desktop/`

- **`main.js`** — Electron main process. Creates the `BrowserWindow` (context
  isolation on, node integration off, custom preload). Registers IPC handlers:
  `pesu:get-default-output-dir`, `pesu:choose-output-dir`, `pesu:open-output-dir`,
  `pesu:start`, `pesu:stop`. On start it validates inputs, builds an agent
  (`workspaceDir = app.getPath('userData')`, `isPackaged`, browser path from
  app resources), wires `onLog`/`onProgress` to renderer channels, awaits the run,
  and pushes a final `pesu:run-state`.
- **`preload.js`** — exposes a minimal, safe `window.pesuDesktop` API via
  `contextBridge`: `chooseOutputDir`, `getDefaultOutputDir`, `openOutputDir`,
  `startDownload`, `stopDownload`, and `onLog`/`onProgress`/`onRunState`
  subscriptions (each returns an unsubscribe function).
- **`renderer/`** — framework-free UI. `renderer.js` wires the form, speed select
  (with a custom-delay field), Start/Stop/Open buttons, live log list, and the
  three counters, reacting to `onLog`/`onProgress`/`onRunState` events.

### 3.10 `scripts/`

- **`install-playwright-chromium.js`** — `npx playwright install chromium` with
  `PLAYWRIGHT_BROWSERS_PATH` pointed at `./playwright-browsers`. Runs on `postinstall`.
- **`pesu-agent.js`** — legacy wrapper that runs the core with env credentials and fixed defaults.
- **`pesu-download-slides.js`** — the **original standalone prototype** (854 lines).
  Self-contained: prompts for *manual* login, has its own course/unit/row discovery
  and download logic, saves error screenshots. Superseded by `src/core` but kept
  for reference; invoked by `npm run pesu` / `pesu:debug`.

---

## 4. Data Flow

End-to-end for a single class PDF:

```text
observePage()                       → structured observation of the live DOM
   │
chooseSlidesTable(observation)      → the table whose header looks like "Slides"
   │
inferClassInfo(row, …)              → { classNumber, classTitle, slideCell, hasSlides }
   │  (hasSlides)
downloadSlidesForRow()
   ├─ click slide trigger ──► handleSlideDetailPage()
   │     ├─ detectImmediatePdfSources()      (iframe/embed/object/url)
   │     ├─ ensureSlidesTabActive()
   │     └─ detectGlyphiconEyeAnchors() → click eye → waitForIframePdfSource()
   │              └─ downloadArtifactSources()
   │                     ├─ resolve relative URLs
   │                     ├─ skip if file exists  → progress: skipped-existing
   │                     ├─ http(s)  → directDownload() (cookie-authed fetch)
   │                     ├─ blob:    → saveBlobFromPage()
   │                     └─ write Course/Unit/NN - Title.pdf → progress: downloaded
   └─ returnToUnitTable()           → "Back to Units" (+ recovery fallbacks)
```

Events stream out continuously: `logger.log` → `onLog` → renderer log list;
`progressStore` mutations → `onProgress` → renderer counters/message.

---

## 5. The "Wrong Unit" Problem & Verified Activation

**Problem.** PESU Academy is a single-page app. Switching units loads content via
AJAX, and the "Back to Units" control returns to the table but **resets the active
unit to Unit 1**. Worse, a unit tab can keep its `active` CSS class even after the
content reverts — so trusting the tab class would silently save Unit 1's slides
into the Unit 2/3/4 folders. This was the original, reported bug.

**Solution — three independent signals, content is king:**

1. **Fresh discovery every transition.** `openUnitVerified` re-runs `discoverUnits`
   on each attempt so post-AJAX stale selectors are never reused.
2. **Fingerprint the table.** Before navigating, the current slide table is
   fingerprinted (`fingerprintSlidesTable`: row count + visible row text + slide
   source URLs/onclick handlers → a hash).
3. **`waitForUnitActivation`** blocks until at least one reliable signal proves the
   intended unit is active:
   - the active tab/`aria-selected` element matches the intended unit number, **or**
   - a heading/breadcrumb names the unit, **or**
   - the slide-table fingerprint **changed** from the previous unit.
   For unit transitions it requires **both** a content change **and** a unit signal
   (a sticky active class alone is rejected).
4. **`ensureUnitActive`** is called before reading **every row**, because "Back to
   Units" resets to Unit 1 between rows. It re-asserts the intended unit using the
   known fingerprint as the source of truth (the tab class is only a fallback when
   no baseline exists). On retry it first clicks a *different* unit to break any
   "already active, do nothing" short-circuit.
5. **Duplicate-source guard.** After a unit completes, if its set of source URLs
   exactly matches the previous unit's (`isDuplicateSourceSet`), a high-confidence
   wrong-unit failure is recorded.

If activation can't be proven after retries, the run captures a
`*-unit-activation-failed-*` debug bundle and **fails that unit loudly** rather
than saving possibly-wrong content. `tests/simulation.test.js` reproduces the bug
condition and proves the guard holds, including the adversarial sticky-tab case.

---

## 6. PDF Source Detection Strategies

PESU exposes slide PDFs in several ways; the downloader tries them in order:

1. **Immediate viewer sources** — visible `iframe[src]`, `embed[src]`, `object[data]`, or a `.pdf`/`blob:` page URL (`detectImmediatePdfSources`).
2. **`loadIframe(...)` onclick handlers** — anchors with `onclick` referencing `downloadslidecoursedoc` or a `.pdf`, and the "eye" glyphicon (`a[onclick*='loadIframe']`, `.glyphicon-eye-open`). Clicking populates `iframe[id^='myIframe']`, whose `src` is then polled (`waitForIframePdfSource`).
3. **Direct anchors** in the slide cell (`cell.anchors`).
4. **Click-driven artifacts** — a click may yield a Playwright `download` event, a popup `page`, or a same-tab navigation (`triggerDownloadByClick` → `processArtifactResults`).

Retrieval:
- **`http(s)`** sources are fetched with `fetch` plus a `Cookie` header rebuilt
  from the browser context's cookies (`buildCookieHeader`), validating the response
  is PDF-like by content-type or `.pdf` URL.
- **`blob:`** sources are read inside the page (`fetch` → `arrayBuffer` → base64)
  and written to disk (`saveBlobFromPage`).
- **Playwright downloads** are saved via `download.saveAs`.

Filenames: `buildFilePath` → `NN - <Class Title>.pdf`, with a ` (Slide NN)` suffix
when a single class yields multiple assets. Existing files short-circuit to
`skipped-existing`.

---

## 7. Persistent State & File Layout

| Path | Purpose | Lifecycle |
| --- | --- | --- |
| `memory/pesu-progress.json` | Ledger: `downloaded`, `failed`, `history`, `lastUpdated` | Read/written each run |
| `memory/pesu-learned-selectors.json` | Cached working selectors per bucket/label (capped 12) | Appended each run |
| `memory/pesu-notes.md` | Append-only operator notes (login, courses, units, failures) | Appended each run |
| `logs/pesu-download.log` | Timestamped, credential-redacted log | Appended |
| `debug/*-{png,html,json}` | Diagnostic bundles for uncertain/failed steps | Per incident |
| `.chromium-profile/` | Persistent Chromium profile (keeps the session) | Persistent |
| `.tmp-downloads/` | Playwright temp download dir | Transient |
| `downloads/PESU_Academy/` (or chosen dir) | Final organised PDFs | Output |
| `playwright-browsers/` | Vendored Chromium bundle | Installed once |

In the desktop app the working dir is `app.getPath('userData')`, so `memory/`,
`logs/`, etc. live under the per-user app data directory rather than the repo.
The CLI and scripts use the repo root.

> Note: the checked-in `memory/*` files contain real run history from development
> (course names, slide UUIDs, absolute paths under `/home/god/codex-browser-automation/...`).
> They are diagnostic artifacts, not release payload, and are excluded from builds.

---

## 8. IPC Contract (Desktop)

Renderer → Main (`ipcRenderer.invoke`, exposed as `window.pesuDesktop`):

| Channel | Args | Returns |
| --- | --- | --- |
| `pesu:get-default-output-dir` | — | default output path string |
| `pesu:choose-output-dir` | — | chosen dir or `null` |
| `pesu:open-output-dir` | `outputDir` | `{ok}` or `{ok:false, error}` |
| `pesu:start` | `{username, password, outputDir, speed\|delayMs}` | final `counts` (throws on error) |
| `pesu:stop` | — | `{ok}` or `{ok:false, error}` |

Main → Renderer (`webContents.send`, subscribed via preload):

| Channel | Payload |
| --- | --- |
| `pesu:log` | `{level, line, message, timestamp}` |
| `pesu:progress` | `{counts, message?, item?, status?, outputDir}` |
| `pesu:run-state` | `{running, outputDir, success?, counts?, error?}` |

Only one run may be active (`activeRun` guard). `pesu:stop` calls
`agent.requestStop()`.

---

## 9. Configuration Reference

`runPESUDownloader(options)` / `createPESUAgent(defaults).run(overrides)` accept:

| Option | Meaning |
| --- | --- |
| `username`, `password` | **Required.** PESU credentials. |
| `outputDir` | Download root (default `downloads/PESU_Academy`). |
| `workspaceDir` | Base for `logs/`, `memory/`, `debug/`, `.chromium-profile/`, `.tmp-downloads/`. |
| `headless` | Launch Chromium headless (default `false`). |
| `actionDelayMs` | Inter-action delay; usually from `parseSpeedOption`. |
| `speedLabel` | Human-readable speed string for logs. |
| `isPackaged`, `appRoot`, `resourcesPath`, `playwrightBrowsersPath` | Passed to `browserResolver`. |
| `onLog`, `onProgress` | Event callbacks for the UI. |
| `logDir`, `memoryDir`, `debugDir`, `profileDir`, `tempDownloadDir`, `progressFile`, `learnedSelectorsFile`, `notesFile`, `logFile` | Fine-grained path overrides. |

Environment variables: see the [README env table](./README.md#environment-variables).

---

## 10. Testing Strategy

`npm test` runs two browser-free suites:

- **`tests/unit.test.js`** (19 cases) — exercises `unitTools` pure functions:
  unit identity parsing (arabic/roman/keyword/ignored), `findUnitByIdentity`,
  fingerprint equality/difference/emptiness, `parseSpeedOption` (presets, default,
  override, validation), and duplicate-source detection.
- **`tests/simulation.test.js`** (4 cases) — builds an in-memory state machine
  that reproduces PESU's SPA behaviour (AJAX unit swaps, eye→iframe PDF, and the
  "Back to Units resets to Unit 1" bug, plus an adversarial `stickyTab` mode), wraps
  it in mock Playwright `page`/`context`/`locator` objects, then drives the **real**
  `discoverUnits` / `processUnit` / `openUnitVerified` / `ensureUnitActive` code via
  the `__test` hooks. It asserts every unit folder receives exactly that unit's
  slides, even with a lying active tab, and that the bug path was actually exercised.

A fetch stub writes the source URL as the file's bytes, so the test can read each
saved "PDF" and prove which unit's slide landed where. There is no CI workflow
checked in; run `npm test` locally.

---

## 11. Packaging

electron-builder config lives in `package.json` under `build`:

- **appId** `com.pesu.downloader`, **productName** "PESU Academy Slide Downloader", output to `dist/`.
- **files** include `src/**`, `scripts/**`, `package.json`, `package-lock.json`; exclude runtime dirs and `.env`.
- **extraResources** copies `playwright-browsers/` into the app so Chromium ships with the build.
- **asarUnpack** keeps `playwright`/`playwright-core` outside the asar (they spawn binaries).
- Targets: Linux `AppImage`/`deb`, macOS `dmg`, Windows `nsis`. `build:*` scripts run the Chromium install first.

Linux AppImage is validated; Windows/macOS are configured but need runtime
validation (and macOS signing).

---

## 12. Known Issues & TODOs

Derived from code comments, `appendNote`/log history, and behaviour:

- **No course/unit selection.** Every run processes the entire account; there's no
  way to target specific courses or units yet (top item on the roadmap).
- **UI-structure coupling.** Detection depends on PESU's current DOM; viewer or
  table changes can break it. Mitigated by adaptive observation but not eliminated.
- **Video-only / non-standard units** log "No slide table could be inferred" and
  are skipped (seen in `memory/pesu-notes.md` for several real courses).
- **Transient `fetch failed` / `about:blank` navigation** errors appear in run
  history; `recoverCourseUnitContext` handles many but not all. Slower speeds help.
- **`scripts/pesu-download-slides.js` is stale** — a parallel, unmaintained
  implementation that can drift from `src/core`. Consider removing or clearly
  deprecating it.
- **Checked-in `memory/*` run artifacts** contain personal run data (course names,
  slide UUIDs, machine-specific absolute paths). Consider gitignoring them or
  shipping empty seeds.
- **Stop is cooperative,** not immediate — it unwinds at the next stage boundary.
- **No automated CI**; tests must be run manually.
- The desktop **password field is cleared on success** but not on failure.

---

*Last reviewed against the codebase on 2026-06-16.*

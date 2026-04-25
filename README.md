# PESU Academy Slide Downloader

## Overview

PESU Academy Slide Downloader is a desktop application and automation engine for downloading slide PDFs from PESU Academy into a structured local archive.

This project exists to remove the repetitive, error-prone manual workflow of opening each course, navigating units, opening slide viewers, and saving PDFs one by one. The primary audience is non-technical PESU students who need a simple desktop interface: enter credentials, choose an output folder, start the run, and monitor progress.

The current release provides a working Linux desktop build path and a shared Playwright core that also powers CLI and legacy script entrypoints.

## Features

- Automated login to PESU Academy with runtime-provided credentials.
- Automatic course discovery from the student course view.
- Dynamic unit detection based on the live PESU UI structure.
- Slide-to-PDF extraction using Playwright browser automation.
- Organized course and unit folder structure on disk.
- Resume behavior through skip-existing-file detection.
- Local desktop UI for non-technical users.
- Cross-platform packaging configuration:
  Linux is validated through AppImage.
  Windows and macOS packaging are configured for later testing.

## Architecture

### Core

The system is centered on a Playwright automation engine that drives Chromium, logs into PESU Academy, discovers courses and units, resolves slide artifacts, and saves PDFs to the filesystem.

Key core responsibilities:

- `browserResolver`: selects the correct Chromium binary for development and packaged Electron builds.
- `downloader`: orchestrates login, course traversal, unit traversal, slide extraction, skip logic, logging, progress tracking, and debug bundle capture.
- Supporting utilities: logging, progress persistence, path handling, and agent orchestration.

### Layers

- `src/core`: runtime logic, downloader pipeline, browser resolution, progress, and logging.
- `src/cli`: command-line interface that invokes the core downloader directly.
- `src/desktop`: Electron main process, preload bridge, and renderer UI.

### Data Flow

`UI -> Core -> Browser -> PESU -> PDF -> Filesystem`

More concretely:

1. The Electron UI collects username, password, and output directory.
2. The Electron main process calls `runPESUDownloader(...)`.
3. The core downloader resolves Chromium through `browserResolver`.
4. Playwright automates PESU Academy and identifies downloadable slide artifacts.
5. PDFs are written to the local filesystem using the course and unit hierarchy.
6. Logs and progress events are streamed back to the UI.

## Project Structure

### `src/core/`

Core automation and runtime services.

- `browserResolver.js`: development vs packaged Chromium resolution.
- `downloader.js`: primary Playwright pipeline and PESU traversal logic.
- `pesuAgent.js`: small orchestration wrapper around the downloader.
- `logger.js`: structured log emission with credential redaction.
- `progressStore.js`: progress persistence and UI-facing progress events.
- `fileUtils.js`: shared filesystem and serialization helpers.

### `src/desktop/`

Electron desktop application.

- `main.js`: Electron main process, IPC, folder picker, open-folder action, downloader invocation.
- `preload.js`: `contextBridge` API surface exposed to the renderer.
- `renderer/`: HTML, CSS, and client-side UI logic.

### `src/cli/`

CLI entrypoint for developer or power-user usage.

- `index.js`: argument parsing and invocation of the core downloader.

### `scripts/`

Operational helper scripts.

- `pesu-agent.js`: legacy wrapper preserved for compatibility.
- `install-playwright-chromium.js`: installs the managed Playwright Chromium bundle.

### `memory/`

Runtime memory and diagnostic state produced by the downloader.

- learned selectors
- progress history
- operator notes

These files are useful during debugging, but they are not part of the release payload.

## Installation

### Linux AppImage

1. Download the latest AppImage artifact.
2. Make it executable:

```bash
chmod +x "PESU Academy Slide Downloader-<version>.AppImage"
```

3. Run it:

```bash
./"PESU Academy Slide Downloader-<version>.AppImage"
```

### Developer Setup

1. Install dependencies:

```bash
npm install
```

2. Install the managed Playwright Chromium bundle:

```bash
npm run playwright:install
```

3. Start the Electron app in development mode:

```bash
npm run desktop
```

The Playwright browser dependency is required. The project installs and uses a managed Chromium bundle so packaged builds do not rely on a separately installed system browser.

## Usage

1. Open the desktop application.
2. Enter PESU username and password.
3. Choose the download folder.
4. Click `Start Download`.
5. Monitor logs, counts, and progress in the UI.
6. Open the output folder when the run completes.

For developer workflows, the CLI and legacy wrapper remain available:

```bash
npm run cli -- --headless
npm run pesu:agent
```

## Output Format

Downloads are written into the existing PESU hierarchy:

```text
downloads/PESU_Academy/<Course>/<Unit>/<PDFs>
```

Typical structure:

```text
downloads/
  PESU_Academy/
    UQ25CA651B - Algorithms Analysis and Design/
      Unit 01/
        01 Introduction.pdf
        02 Recurrence Relations.pdf
```

The downloader skips files that already exist, which enables restart and resume behavior without re-downloading completed PDFs.

## Security

- Credentials are not stored permanently by the application.
- Username and password are used only for the active run.
- No downloader data is sent to external services beyond direct communication with PESU Academy.
- Execution is local to the user machine.
- Logs redact runtime credentials if they appear in emitted messages.

## Current Status

- Linux: fully working, with AppImage build validated.
- Windows: packaging is configured and requires runtime validation.
- macOS: packaging is configured and requires signing and runtime validation.

## Limitations

- The downloader depends on the current PESU Academy UI structure.
- Internet access is required for login, navigation, and PDF retrieval.
- Browser automation can break if PESU changes page structure, selectors, or viewer behavior.
- Some edge cases still rely on adaptive heuristics rather than PESU-provided stable APIs.

## Roadmap

### A. Course Selection UI

- Fetch all courses immediately after login.
- Display course checklists in the desktop UI.
- Allow users to select only specific courses.
- Support targeted downloads instead of full-account runs.

### B. Unit Selection

- Add per-unit checkbox selection.
- Allow partial downloads inside a selected course.
- Support resuming only selected incomplete units.

### C. UI Improvements

- Add a true progress bar.
- Add a visible stop button wired to cancellation.
- Add retry actions for failed downloads.

### D. Performance

- Introduce controlled parallel downloads where safe.
- Reduce unnecessary navigation and page reloads.
- Optimize repeated table and artifact detection.

### E. Packaging

- Produce polished Windows `.exe` installers.
- Produce signed macOS `.dmg` builds.
- Add proper icons, metadata, and branding assets.

### F. Reliability

- Expand retry and recovery logic.
- Improve PDF source detection across viewer variations.
- Strengthen navigation recovery when the PESU UI changes mid-run.

## Contributing

Contributions should preserve the current separation of concerns:

- `src/core` for automation and runtime logic
- `src/desktop` for Electron integration and UI
- `src/cli` for command-line workflows

Recommended contribution workflow:

1. Install dependencies and the managed Playwright browser.
2. Reproduce the issue using the desktop or CLI entrypoint.
3. Keep changes localized to the correct layer.
4. Validate syntax and at least one runtime path before opening a pull request.

## Disclaimer

This project is intended for educational use by PESU students. It automates actions that a user could otherwise perform manually through the PESU Academy interface. Users are responsible for operating it in a manner consistent with institutional policies and platform usage expectations.

# PESU Academy Slide Downloader (Agent-Based)

This project automates downloading slide PDFs from PESU Academy using Playwright.

## Features
- Logs in using `.env`
- Navigates all courses automatically
- Detects dynamic unit structures
- Clicks slide → eye icon → extracts PDF
- Saves PDFs in structured folders
- Skips duplicates
- Debug + retry system

## Setup

```bash
npm install
npx playwright install
Configure

Create .env:

PESU_USERNAME=your_username
PESU_PASSWORD=your_password
Run
npm run pesu:agent
Output
downloads/PESU_Academy/<Course>/<Unit>/<PDFs>
Notes
Uses persistent Chromium profile
Handles iframe PDF extraction
Does NOT store credentials

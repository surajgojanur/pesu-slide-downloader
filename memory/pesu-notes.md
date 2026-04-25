# PESU Downloader Notes

## Assumptions

- Unauthenticated landing page is `https://www.pesuacademy.com/`
- Logged-in navigation exposes a visible `My Courses` entry as a link, button, tab, or navigable fallback URL
- Course pages expose unit navigation through tabs or tab-like controls
- Unit content includes at least one visible table containing class rows
- The slides column may expose:
  - a direct PDF or download URL
  - a popup/tab containing a PDF URL
  - a browser PDF viewer using an HTTP URL or `blob:` URL

## Selector Strategy

### Login detection

- `button` with text matching `Sign In`
- `input[name="j_username"]`
- `input[placeholder*="Username"]`

### My Courses

- role-based link/button matching `My Courses`
- generic `a`, `button`, or tab-like element containing `My Courses`
- fallback URLs:
  - `/Academy/student/getMyCourses`
  - `/Academy/student/myCourses`
  - `/Academy/myCourses`

### Course discovery

- visible elements from:
  - `a[href]`
  - `button`
  - `[role="link"]`
  - `.course a`
  - `.course-card a`
  - `.subject a`
  - `.card a`
  - `tr`
  - `.mat-row`
  - `.list-group-item`
- excludes obvious navigation/sidebar content
- prefers items that look course-like based on text or href content

### Unit discovery

- `[role="tab"]`
- `.nav-tabs a`
- `.nav-tabs button`
- `.tab a`
- `.tab button`
- `.tabs a`
- `.tabs button`
- `.mat-tab-label`
- `a[href*="unit"]`

### Class rows

- first visible table on page
- row scanning through `table tbody tr`, `table tr`, `.mat-row`
- title inferred from headers like `Class`, `Topic`, `Title`, `Lecture`, `Session`, `Name`
- slide link inferred from headers like `Slides`, `Slide`, `PPT`, `Material`, `PDF`, `Notes`
- row-level fallback on anchors with href fragments like `slide`, `material`, `download`, `.pdf`

## Download Strategy

1. Try direct authenticated fetch if a direct slide href is available
2. Otherwise click the row’s slide trigger and wait for:
   - Playwright `download` event
   - popup/new tab
   - same-tab PDF navigation
3. If a PDF is rendered as a `blob:` URL, fetch the blob from the browser page and write it to disk

## Known Risk Areas

- Course discovery may need tightening once real logged-in DOM is observed
- If the site uses nested iframes for the slide viewer, locator strategy may need a frame-aware update
- If multiple tables exist per unit, row discovery may need to target a more specific course-content container

## Run Start
- 2026-04-24T20:16:27.305Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:16:30.902Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:16:34.925Z: Login attempt did not leave the sign-in page. Stopping clearly as requested.

## Run End
- 2026-04-24T20:16:34.925Z: Agent run finished.

## Run Start
- 2026-04-24T20:17:15.938Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:17:19.079Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:17:22.913Z: Login succeeded or an existing session became active after submit.

## Run End
- 2026-04-24T20:17:26.677Z: Agent run finished.

## Run Start
- 2026-04-24T20:19:36.806Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:19:40.796Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:19:45.186Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:19:48.594Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:19:51.921Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:19:53.048Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:19:55.566Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:19:56.416Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Course Units | Unit 1 | Unit 2 | Unit 3 | Unit 4

## Courses
- 2026-04-24T20:20:12.352Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:20:13.441Z: Action control was not visible for UQ25CA641BC1 - Network Security. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:20:15.962Z: Resolved course page as UQ25CA641BC1 - Network Security from My Courses table row and page state.

## Units
- 2026-04-24T20:20:16.835Z: Detected units for UQ25CA641BC1 - Network Security: Course Units | Unit 1: Introduction to Network Security | Unit-2: Cryptography | Unit-3: Network Security Application | Unit 4: System Security

## Table Detection
- 2026-04-24T20:20:27.231Z: No slide table could be inferred for UQ25CA641BC1 - Network Security / Unit-3: Network Security Application.

## Table Detection
- 2026-04-24T20:20:30.042Z: No slide table could be inferred for UQ25CA641BC1 - Network Security / Unit 4: System Security.

## Courses
- 2026-04-24T20:20:33.368Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:20:34.525Z: Action control was not visible for UQ25CA651B - Algorithms Analysis and Design. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:20:37.093Z: Resolved course page as UQ25CA651B - Algorithms Analysis and Design from My Courses table row and page state.

## Units
- 2026-04-24T20:20:37.972Z: Detected units for UQ25CA651B - Algorithms Analysis and Design: Course Units

## Courses
- 2026-04-24T20:20:43.923Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:20:45.023Z: Action control was not visible for UQ25CA652B - Data Communication and Networking. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:20:47.561Z: Resolved course page as UQ25CA652B - Data Communication and Networking from My Courses table row and page state.

## Units
- 2026-04-24T20:20:48.446Z: Detected units for UQ25CA652B - Data Communication and Networking: Course Units

## Courses
- 2026-04-24T20:20:54.372Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:20:55.472Z: Action control was not visible for UQ25CA653B - Artificial Intelligence and Machine Learning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:20:58.054Z: Resolved course page as UQ25CA653B - Artificial Intelligence and Machine Learning from My Courses table row and page state.

## Units
- 2026-04-24T20:20:58.938Z: Detected units for UQ25CA653B - Artificial Intelligence and Machine Learning: Course Units | Unit1: AI Landscape | Unit 2: Supervised Learning | Unit3: Advanced ML and Ensemble Intelligence | Unit4: Unsupervised Learning & Reinforcement Learning

## Table Detection
- 2026-04-24T20:21:09.419Z: No slide table could be inferred for UQ25CA653B - Artificial Intelligence and Machine Learning / Unit3: Advanced ML and Ensemble Intelligence.

## Table Detection
- 2026-04-24T20:21:12.225Z: No slide table could be inferred for UQ25CA653B - Artificial Intelligence and Machine Learning / Unit4: Unsupervised Learning & Reinforcement Learning.

## Courses
- 2026-04-24T20:21:15.533Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:21:16.657Z: Action control was not visible for UQ25CA654B - Web Application Frameworks - I. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:21:19.199Z: Resolved course page as UQ25CA654B - Web Application Frameworks - I from My Courses table row and page state.

## Units
- 2026-04-24T20:21:20.067Z: Detected units for UQ25CA654B - Web Application Frameworks - I: Course Units | Unit 1: Website Designing | Unit 2: React Components | Unit 3: React State, Routing, and Bootstrap Integration | Unit 4: REST APIs, Form Validation, and MongoDB

## Table Detection
- 2026-04-24T20:21:30.503Z: No slide table could be inferred for UQ25CA654B - Web Application Frameworks - I / Unit 3: React State, Routing, and Bootstrap Integration.

## Table Detection
- 2026-04-24T20:21:33.299Z: No slide table could be inferred for UQ25CA654B - Web Application Frameworks - I / Unit 4: REST APIs, Form Validation, and MongoDB.

## Run End
- 2026-04-24T20:21:33.299Z: Agent run finished.

## Run Start
- 2026-04-24T20:27:28.361Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:27:32.745Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:27:37.029Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:27:40.459Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:27:43.789Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:27:44.946Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:27:47.498Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:27:48.365Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Row Failure
- 2026-04-24T20:28:05.723Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 1. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Trigger is not visible for Number Systems Types of numbers, Divisibility rules

## Row Failure
- 2026-04-24T20:28:09.894Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Trigger is not visible for Number Systems HCF and LCM

## Row Failure
- 2026-04-24T20:28:14.077Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 3. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Trigger is not visible for Number Systems Square root and cube root

## Row Failure
- 2026-04-24T20:28:18.264Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 4. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Trigger is not visible for Arithmetic Average and its applications

## Row Failure
- 2026-04-24T20:28:22.420Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 5. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Trigger is not visible for Arithmetic Ratio and proportions and variation

## Row Failure
- 2026-04-24T20:28:26.583Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 6. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Trigger is not visible for Arithmetic Percentage

## Row Failure
- 2026-04-24T20:28:30.750Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 7. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Trigger is not visible for Arithmetic Profit, loss, and discount

## Run End
- 2026-04-24T20:28:30.780Z: Agent run finished.

## Run Start
- 2026-04-24T20:33:18.632Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:33:22.672Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:33:27.277Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:33:30.719Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:33:34.066Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:33:35.253Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:33:37.793Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:33:38.674Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## No PDF After Eye
- 2026-04-24T20:33:48.148Z: No PDF was captured after clicking eye/view candidates for UQ25CA601B - Aptitude and Reasoning / Unit 1 / Number Systems Types of numbers, Divisibility rules. Debug captured from https://www.pesuacademy.com/Academy/s/studentProfilePESU.

## Uncertain Interaction
- 2026-04-24T20:33:51.790Z: Could not resolve downloadable slide artifacts after slide detail and eye/view handling for UQ25CA601B - Aptitude and Reasoning / Unit 1 / Number Systems Types of numbers, Divisibility rules. Debug snapshot captured from https://www.pesuacademy.com/Academy/s/studentProfilePESU.

## Row Failure
- 2026-04-24T20:33:55.953Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 1. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:34:00.120Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:34:04.284Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 3. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Unable to click live page choice: 2

## Row Failure
- 2026-04-24T20:34:08.466Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 4. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:34:12.648Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 5. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:34:16.853Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 6. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:34:21.070Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 7. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU. Error: Unable to click live page choice: 1

## Run End
- 2026-04-24T20:34:21.124Z: Agent run finished.

## Run Start
- 2026-04-24T20:37:02.011Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:37:05.402Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:37:09.457Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:37:12.891Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:37:16.226Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:37:17.418Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:37:19.957Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:37:20.834Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## No PDF After Eye
- 2026-04-24T20:37:30.451Z: No PDF was captured after clicking eye/view candidates for UQ25CA601B - Aptitude and Reasoning / Unit 1 / Number Systems Types of numbers, Divisibility rules. Debug captured from https://www.pesuacademy.com/Academy/s/studentProfilePESU.

## Uncertain Interaction
- 2026-04-24T20:37:35.021Z: Could not resolve downloadable slide artifacts after slide detail and eye/view handling for UQ25CA601B - Aptitude and Reasoning / Unit 1 / Number Systems Types of numbers, Divisibility rules. Debug snapshot captured from https://www.pesuacademy.com/Academy/s/studentProfilePESU.

## No PDF After Eye
- 2026-04-24T20:37:42.023Z: No PDF was captured after clicking eye/view candidates for UQ25CA601B - Aptitude and Reasoning / Unit 1 / Number Systems HCF and LCM. Debug captured from https://www.pesuacademy.com/Academy/s/studentProfilePESU.

## Row Failure
- 2026-04-24T20:37:46.334Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at https://www.pesuacademy.com/Academy/. Error: Navigation recovery did not restore the unit table with a Class header

## Row Failure
- 2026-04-24T20:37:48.118Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 3. Debug captured at https://www.pesuacademy.com/Academy/. Error: Unable to click live page choice: 2

## Row Failure
- 2026-04-24T20:37:49.817Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 4. Debug captured at https://www.pesuacademy.com/Academy/. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:37:51.561Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 5. Debug captured at https://www.pesuacademy.com/Academy/. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:37:53.316Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 6. Debug captured at https://www.pesuacademy.com/Academy/. Error: Unable to click live page choice: 1

## Run Start
- 2026-04-24T20:38:37.413Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:38:40.966Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:38:45.138Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:38:48.620Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:38:51.956Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:38:53.109Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:38:55.655Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:38:56.516Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Row Failure
- 2026-04-24T20:39:22.543Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at about:blank. Error: Navigation recovery did not restore the unit table with a Class header

## Row Failure
- 2026-04-24T20:39:23.464Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 3. Debug captured at about:blank. Error: Unable to click live page choice: 2

## Row Failure
- 2026-04-24T20:39:24.365Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 4. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:39:25.265Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 5. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:39:26.163Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 6. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:39:27.082Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 7. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Run End
- 2026-04-24T20:39:27.101Z: Agent run finished.

## Run Start
- 2026-04-24T20:40:10.735Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:40:14.990Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:40:19.014Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:40:22.464Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:40:25.823Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:40:26.988Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:40:29.538Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:40:30.418Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Row Failure
- 2026-04-24T20:40:53.021Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at about:blank. Error: Navigation recovery did not restore the unit table with a Class header

## Row Failure
- 2026-04-24T20:40:53.921Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 3. Debug captured at about:blank. Error: Unable to click live page choice: 2

## Row Failure
- 2026-04-24T20:40:54.828Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 4. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:40:55.755Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 5. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:40:56.656Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 6. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:40:57.554Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 7. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Run End
- 2026-04-24T20:40:57.567Z: Agent run finished.

## Run Start
- 2026-04-24T20:45:30.471Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:45:34.129Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:45:37.933Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:45:41.352Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:45:44.690Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:45:45.863Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:45:48.394Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:45:49.291Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Row Failure
- 2026-04-24T20:46:16.331Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at about:blank. Error: Navigation recovery did not restore the unit table with a Class header

## Row Failure
- 2026-04-24T20:46:17.229Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 3. Debug captured at about:blank. Error: Unable to click live page choice: 2

## Row Failure
- 2026-04-24T20:46:18.126Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 4. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:46:19.048Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 5. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:46:19.949Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 6. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Row Failure
- 2026-04-24T20:46:20.844Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 7. Debug captured at about:blank. Error: Unable to click live page choice: 1

## Run End
- 2026-04-24T20:46:20.858Z: Agent run finished.

## Run Start
- 2026-04-24T20:51:07.862Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:51:11.279Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:51:15.207Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:51:18.628Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:51:21.966Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:51:23.127Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:51:25.663Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:51:26.521Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Row Failure
- 2026-04-24T20:52:16.292Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at https://www.pesuacademy.com/Academy/student/getMyCourses. Error: No course candidates were detected on the My Courses page

## Run End
- 2026-04-24T20:52:37.155Z: Agent run finished.

## Run Start
- 2026-04-24T20:58:47.747Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T20:58:51.027Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T20:58:54.993Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T20:58:58.469Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T20:59:01.835Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T20:59:02.994Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T20:59:05.587Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T20:59:06.449Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Row Failure
- 2026-04-24T20:59:56.275Z: Failed while processing UQ25CA601B - Aptitude and Reasoning / Unit 1 / row 2. Debug captured at https://www.pesuacademy.com/Academy/student/getMyCourses. Error: No course candidates were detected on the My Courses page

## Run End
- 2026-04-24T21:00:17.082Z: Agent run finished.

## Run Start
- 2026-04-24T21:02:11.356Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T21:02:14.669Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T21:02:19.608Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T21:02:24.001Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T21:02:27.338Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T21:02:28.568Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T21:02:31.109Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T21:02:31.977Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Run Start
- 2026-04-24T21:04:56.863Z: Agent run started with visible Chromium and adaptive page inspection enabled.

## Login
- 2026-04-24T21:05:00.355Z: Login form detected and credentials will be filled from environment variables.

## Login
- 2026-04-24T21:05:07.856Z: Login succeeded or an existing session became active after submit.

## Courses
- 2026-04-24T21:05:11.291Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Courses
- 2026-04-24T21:05:14.644Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T21:05:15.804Z: Action control was not visible for UQ25CA601B - Aptitude and Reasoning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T21:05:18.316Z: Resolved course page as UQ25CA601B - Aptitude and Reasoning from My Courses table row and page state.

## Units
- 2026-04-24T21:05:19.188Z: Detected units for UQ25CA601B - Aptitude and Reasoning: Unit 1 | Unit 2 | Unit 3 | Unit 4

## Courses
- 2026-04-24T21:10:00.993Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T21:10:01.972Z: Action control was not visible for UQ25CA641BC1 - Network Security. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T21:10:04.448Z: Resolved course page as UQ25CA641BC1 - Network Security from My Courses table row and page state.

## Units
- 2026-04-24T21:10:05.286Z: Detected units for UQ25CA641BC1 - Network Security: Unit 1: Introduction to Network Security | Unit-2: Cryptography | Unit-3: Network Security Application | Unit 4: System Security

## Table Detection
- 2026-04-24T21:16:14.512Z: No slide table could be inferred for UQ25CA641BC1 - Network Security / Unit-3: Network Security Application.

## Table Detection
- 2026-04-24T21:16:37.110Z: No slide table could be inferred for UQ25CA641BC1 - Network Security / Unit 4: System Security.

## Courses
- 2026-04-24T21:16:40.436Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T21:16:41.410Z: Action control was not visible for UQ25CA651B - Algorithms Analysis and Design. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T21:16:43.914Z: Resolved course page as UQ25CA651B - Algorithms Analysis and Design from My Courses table row and page state.

## Units
- 2026-04-24T21:16:44.761Z: Detected units for UQ25CA651B - Algorithms Analysis and Design: Introduction, Analysis Framework and Sorting Techniques | Searching and Graph Problems

## Courses
- 2026-04-24T21:26:30.920Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T21:26:31.872Z: Action control was not visible for UQ25CA652B - Data Communication and Networking. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T21:26:34.358Z: Resolved course page as UQ25CA652B - Data Communication and Networking from My Courses table row and page state.

## Units
- 2026-04-24T21:26:35.215Z: Detected units for UQ25CA652B - Data Communication and Networking: Introduction to Computer Networks and Application Layer Protocols | Video Processing and Transport Layer | Network Layer Addressing and Routing

## Table Detection
- 2026-04-24T21:33:43.789Z: No slide table could be inferred for UQ25CA652B - Data Communication and Networking / Network Layer Addressing and Routing.

## Courses
- 2026-04-24T21:33:47.104Z: Detected 6 course rows from the My Courses table: UQ25CA601B Aptitude and Reasoning | UQ25CA641BC1 Network Security | UQ25CA651B Algorithms Analysis and Design | UQ25CA652B Data Communication and Networking | UQ25CA653B Artificial Intelligence and Machine Learning | UQ25CA654B Web Application Frameworks - I

## Course Action Fallback
- 2026-04-24T21:33:48.033Z: Action control was not visible for UQ25CA653B - Artificial Intelligence and Machine Learning. Captured debug and falling back to title cell or row click.

## Course Identity
- 2026-04-24T21:33:50.538Z: Resolved course page as UQ25CA653B - Artificial Intelligence and Machine Learning from My Courses table row and page state.

## Units
- 2026-04-24T21:33:51.396Z: Detected units for UQ25CA653B - Artificial Intelligence and Machine Learning: Unit1: AI Landscape | Unit 2: Supervised Learning | Unit3: Advanced ML and Ensemble Intelligence

## No PDF After Eye
- 2026-04-24T21:37:46.287Z: No PDF was captured after clicking the glyphicon eye control for UQ25CA653B - Artificial Intelligence and Machine Learning / Unit1: AI Landscape / Practice Datasets. Debug captured from https://www.pesuacademy.com/Academy/s/studentProfilePESU#.

## Uncertain Interaction
- 2026-04-24T21:37:49.300Z: Could not resolve downloadable slide artifacts after slide detail and eye/view handling for UQ25CA653B - Artificial Intelligence and Machine Learning / Unit1: AI Landscape / Practice Datasets. Debug snapshot captured from https://www.pesuacademy.com/Academy/s/studentProfilePESU#.

## Row Failure
- 2026-04-24T21:41:16.956Z: Failed while processing UQ25CA653B - Artificial Intelligence and Machine Learning / Unit 2: Supervised Learning / row 17. Debug captured at https://www.pesuacademy.com/Academy/s/studentProfilePESU#. Error: fetch failed

## Run End
- 2026-04-24T21:41:37.777Z: Agent run finished.

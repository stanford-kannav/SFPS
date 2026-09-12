# Stanford Public School — SFPS Management System

**Render-ready release: v32.3.1**

A responsive, family-friendly school management application built with **Node.js 24 + Express** and a **JSON/XML/YAML file database**. This edition is built as a normal Render Web Service, not a serverless function. No PostgreSQL, Python runtime, SQLite/better-sqlite3, or JWT secret is required.

## Requirements

- Node.js 24.19.0 (Render-ready)
- npm

## Install and activate the database

```powershell
cd D:\SFPS\stanford-public-school
npm install
npm run db:check
npm run db:init
npm run db:seed
npm test
npm start
```

Open `http://localhost:3000`.

The database is stored in three synchronized formats:

```text
JSON  = primary writable data
XML   = synchronized mirror
YAML  = synchronized mirror
```

For Render production, the application writes to the persistent disk at `/opt/render/project/src/.sfps-data/database` and profile uploads at `/opt/render/project/src/.sfps-data/uploads/profiles`. The first start copies the bundled seed data to the persistent disk when those files do not yet exist.

## Excel data

The deployment package does not include the original staff workbook because it can contain plaintext credentials. The deployment database and seed data contain password hashes only.

To import a compatible workbook locally:

```powershell
node src/db/import-excel.js "path\to\workbook.xlsx"
```

Passwords are converted to salted scrypt hashes before storage.

## Included SFPS systems

- Owner / Sub-Owner / Manager / Teacher / Parent / Student roles
- Exact staff IDs from the supplied Excel workbook
- Responsive authentication and parent registration
- Optional camera face capture during parent registration
- Parent accounts linked to up to 5 students
- Automatic student linkage from a new parent account
- Student directory
- Teacher directory
- Teacher class assignments
- Class-teacher assignment
- Owner / Sub-Owner / Manager Developer Console
- Administrator-controlled teacher work permissions
- Owner-controlled teacher attendance registry
- Student attendance
- Teacher attendance check-in/check-out
- Teacher syllabus creation and progress tracking
- School-wide syllabus view for management/Sankar Sir
- Homework
- Results
- Fees
- Parent/student views
- Ajeet Sir's protected AI seat-planning workspace, also available to owner@principle and owner@director
- Classroom capacity and two-side-bench configuration
- Class population counts
- Ajeet's seat-planning prompt
- AI-assisted seating generation
- Seat-plan PDF export
- YT — Your Teacher, available to authenticated users through Gemini only
- Top-right profile menu
- Fast, real tab switching with root-level module rendering
- Responsive desktop/tablet/mobile UI
- Stanford Public School logo
- Authentication flow reference image from the supplied PNG

## YT — Your Teacher

Gemini is the **only external AI provider** in this finalized build.

Create `.env` from `.env.example` and add:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
```

The Gemini API key stays server-side and is never placed in browser JavaScript. The `/api/yt/chat` route is the only application route that calls Gemini.

For Render, add `GEMINI_API_KEY` and `GEMINI_MODEL` in the Web Service environment-variable settings. Do not commit `.env`.

The integration uses Google's official `@google/genai` JavaScript SDK.

## Administrator controls

Sign in as:

```text
owner@principle
```

The production owner passwords are supplied securely through `SFPS_OWNER_PASSWORD` and `SFPS_DIRECTOR_PASSWORD`; they are never committed to the repository.

The **Developer Console** is available only to the two owner-level developer accounts and lets them:

1. Give/remove individual work access for teachers.
2. Make a teacher the class teacher of a specific class without a section field.
3. Enable/disable the teacher attendance registry.
4. Enable/disable Ajeet Sir's seat-planning system.
5. Review the administrator audit log.

Seat Planning is server-protected for `ajeet@sir`, `owner@principle`, and `owner@director`; the owner-controlled master switch is enabled by default in the fresh database and can be disabled by an owner administrator. `owner@director` has the same administrator-level application access as `owner@principle`.

## Project structure

```text
stanford-public-school/
├── data/
│   ├── json/
│   ├── xml/
│   ├── yaml/
│   └── SFPS T.D OP.xlsx
├── public/
│   ├── assets/
│   │   └── SFPS-Authentication-Flow.png
│   ├── css/
│   ├── js/
│   ├── dashboard.html
│   ├── developer-console.html
│   ├── login.html
│   └── index.html
├── src/
│   ├── db/
│   │   ├── database.js
│   │   ├── init.js
│   │   ├── check.js
│   │   ├── seed.js
│   │   ├── reset.js
│   │   └── import-excel.js
│   ├── middleware/
│   │   └── auth.js
│   ├── security/
│   │   └── password.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── students.js
│   │   ├── teachers.js
│   │   ├── academic.js
│   │   ├── seatPlanner.js
│   │   ├── access.js
│   │   ├── developer-console.js
│   │   └── yt.js
│   └── server.js
├── .env.example
├── package.json
└── README.md
```


## Complete syllabus planner

Teachers can create a complete syllabus for their assigned classes with:

- Class and subject
- Total chapters
- Total chapters taught
- Chapter allocation for **Periodic 1 → Periodic 2 → Term 1 → Periodic 3 → Periodic 4 → Term 2 (Final)**
- Details and completion/progress notes
- Last taught date
- Time Period Remaining
- Automatic remaining-day calculation when academic period end dates are configured

`owner@principle` and manager accounts can configure the six academic-period start/end dates. Teachers can select their teaching classes and then create syllabus plans only for those classes. Sankar Sir's manager view receives the school-wide syllabus overview.


## Official SFPS Classes
LKG, NUR, UKG, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10. There are exactly 13 classes and no class sections.


## v24 family, diary and attendance controls

- Teacher Diary replaces the Homework tab in the dashboard UI. Entries contain Date, Class, Period, Subject, C.W (Written), H.W (Written), and optional notes.
- Head Teach is a teacher-only tab. A teacher selects one class they teach as their changeable Class Teacher assignment.
- Teacher ID login never displays the class selector. The class selector is only revealed when the entered account is confirmed as a Student ID.
- Parent accounts can switch between linked Student IDs from a live dropdown. Attendance, Syllabus, Teacher Diary, Results, and Fees follow the selected child.
- Attendance Control is restricted to owner, sub-owner, and manager roles. It can declare holidays and turn all attendance/register systems OFF or ON.
- Sunday, declared holidays, and global attendance OFF are enforced server-side.
- The database remains the Node.js JSON/XML/YAML file database.

## V30 Parent ID workflow
Parent IDs are created only by the two Developer accounts (`owner@principle` and `owner@director`) from the **Parent IDs** tab. The Create form supports a parent photo, parent name/ID/password, WhatsApp number, parent age, and 1–5 students. Every student receives a Developer-issued ID/password and requires a name, photo, age, SFPS class and optional roll number. Uploaded images are stored under `public/uploads/profiles/` and referenced from the JSON records; JSON is the authoritative store and YAML mirrors are generated automatically.

Parents cannot create their own accounts from the public login page. They can log in only with the Parent ID and password issued by a Developer. Student accounts are created as part of the same Parent ID workflow.

For web deployments, browser/OS security permission prompts (especially geolocation and file selection) are controlled by the platform and cannot legally be replaced by application UI. SFPS uses in-app permission screens before requesting those platform permissions.




### Render persistent-disk note

SFPS does not crash if an existing Render Web Service has no persistent disk attached. If `SFPS_DATA_DIR` or `SFPS_UPLOAD_DIR` points to a non-writable location, SFPS logs a warning and temporarily falls back to `/tmp`. This keeps the service online, but data in `/tmp` is not persistent.

For production persistence, attach the Render disk configured by `render.yaml` at `/opt/render/project/src/.sfps-data`, or configure the existing service with a writable persistent-disk mount. Render persistent disks require a paid compatible service; Free Web Services do not support them.

## Render deployment

This release is designed for a normal Render **Web Service** running the Express server directly.

Files:

```text
render.yaml
src/server.js
src/app.js
src/storage.js
```

The included Blueprint configures:

- Node.js 24.19.0
- Express Web Service
- `0.0.0.0` binding
- `/api/health` health check
- `/opt/render/project/src/.sfps-data` persistent disk
- JSON database at `/opt/render/project/src/.sfps-data/database`
- profile uploads at `/opt/render/project/src/.sfps-data/uploads/profiles`
- Gemini-only YT configuration
- owner password bootstrap variables

### Render Blueprint

Connect this repository to Render and choose **New → Blueprint**, or create a Web Service from the repository. Render supports Node.js/Express Web Services directly. A persistent disk is required if the JSON/YAML/XML files and uploaded profiles must survive restarts and deploys.

### Required Render environment variables

```text
NODE_VERSION=24.19.0
NODE_ENV=production
HOST=0.0.0.0
SFPS_DATA_DIR=/opt/render/project/src/.sfps-data/database
SFPS_UPLOAD_DIR=/opt/render/project/src/.sfps-data/uploads/profiles
SFPS_SESSION_SECRET=<random 32+ character secret>
SFPS_OWNER_PASSWORD=<your chosen owner password>
SFPS_DIRECTOR_PASSWORD=<your chosen director password>
GEMINI_API_KEY=<your Google Gemini API key>
GEMINI_MODEL=gemini-3.8-flash
```

The two owner passwords are not stored in the repository. If they are supplied as environment variables, SFPS securely hashes them into the persistent JSON user record during startup.

### Render deployment commands

If deploying as a Web Service manually:

```text
Runtime: Node
Build Command: npm install --no-audit --no-fund
Start Command: npm start
Health Check Path: /api/health
Node Version: 24.19.0
```

Attach a persistent disk mounted at:

```text
/var/data
```

The included `render.yaml` already describes this configuration.

### Local verification

```powershell
cd D:\SFPS\stanford-public-school
npm install
npm run db:check
npm run db:init
npm run db:seed
npm test
npm run verify
npm start
```

Then open:

```text
http://localhost:3000
```

For Render, use the `onrender.com` URL shown on the Web Service page.

### Important persistence rule

A Render Web Service has an ephemeral filesystem by default. SFPS therefore explicitly uses the persistent disk mount for the school database and uploaded profile images. Without that disk, local file changes would disappear after a restart or deploy.

# SFPS v27.0.0 Upgrade

## Changes
- Syllabus module retained and hardened for real persistence through the Node.js JSON/XML/YAML database.
- Seat Planning is available to `ajeet@sir`, `owner@principle`, and `owner@director` when the school Seat Planning setting is enabled.
- Owner/director administrator permissions are aligned for administrator routes.
- `owner@director` receives the same administrator-level route access as `owner@principle`.
- Display titles are derived from the UID suffix: `@sir` -> Sir, `@mam` -> Mam, `@miss` -> Miss.
- Added `Ashish` / `ashish@sir` to the seed data.
- Developer Console now includes account-management APIs for creating users, changing staff passwords, removing non-owner users, creating parent+student pairs, and removing students.
- Staff directory now exposes password/remove controls to authorized administrators.
- Teacher creation no longer asks for a class; class-teacher assignment remains in Head Teach.
- Canonical SFPS classes remain exactly: LKG, NUR, UKG, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.

## Database
Run:

```powershell
npm install
npm run db:init
npm run db:seed
npm run db:check
npm start
```

Database formats remain JSON, XML and YAML under `data/`.

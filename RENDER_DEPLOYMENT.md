# SFPS Render Deployment Guide — v32.3.1

## 1. Create the service

Use Render **New → Blueprint** and select the repository containing `render.yaml`.

The Blueprint creates one Node.js Web Service and one persistent disk.

## 2. Secrets

Render will ask for values marked `sync: false`:

```text
SFPS_SESSION_SECRET
SFPS_OWNER_PASSWORD
SFPS_DIRECTOR_PASSWORD
GEMINI_API_KEY
```

Use a random session secret of at least 32 characters. Never commit these values.

## 3. Persistent storage

The Blueprint mounts:

```text
/var/data
```

SFPS stores:

```text
/opt/render/project/src/.sfps-data/database/json
/opt/render/project/src/.sfps-data/database/xml
/opt/render/project/src/.sfps-data/database/yaml
/opt/render/project/src/.sfps-data/uploads/profiles
```

On the first startup, missing database files are copied from the bundled seed data. Existing files on the persistent disk are preserved.

## 4. Health check

Render checks:

```text
GET /api/health
```

A healthy response reports the JSON/XML/YAML database and its data path.

## 5. Login

The login endpoint accepts JSON and standard URL-encoded form bodies. The browser login page sends:

```json
{
  "uid": "...",
  "password": "...",
  "classId": 0
}
```

Teacher/staff accounts do not require a class. Student accounts require the selected class to match their stored class.

## 6. Start command

```text
npm start
```

The server binds to `0.0.0.0` and the Render-provided `PORT` value (default 10000).

## 7. Gemini YT

Set `GEMINI_API_KEY` and optionally keep the default:

```text
GEMINI_MODEL=gemini-3.8-flash
```

The API key is server-side only.


### Render persistent-disk note

SFPS does not crash if an existing Render Web Service has no persistent disk attached. If `SFPS_DATA_DIR` or `SFPS_UPLOAD_DIR` points to a non-writable location, SFPS logs a warning and temporarily falls back to `/tmp`. This keeps the service online, but data in `/tmp` is not persistent.

For production persistence, attach the Render disk configured by `render.yaml` at `/opt/render/project/src/.sfps-data`, or configure the existing service with a writable persistent-disk mount. Render persistent disks require a paid compatible service; Free Web Services do not support them.

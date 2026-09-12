SFPS v32.2.1 FINAL NETLIFY BUILD

Validation performed:
- Node --check: all 29 JavaScript files passed.
- Static HTML asset references: all referenced local CSS/JS/image files exist.
- SFPS smoke test: passed.
- Database check: passed.
- Database seed: passed.
- Canonical classes: 13.
- Seeded users: 19.
- YT external AI provider: Gemini only.
- Real Gemini SDK: @google/genai.
- Gemini key: server-side environment variable only.
- Netlify Function adapter: netlify/functions/api.js.
- Netlify API rewrite: /api/* -> /.netlify/functions/api/:splat.
- Netlify function bundle includes deployment JSON data.
- Original staff workbook/plaintext credential source is intentionally excluded from the deploy package.
- No .env file is included.

Important:
Netlify Functions use ephemeral storage. SFPS copies initial JSON data to /tmp/sfps-data for runtime writes. Permanent production persistence requires a durable storage/database adapter.

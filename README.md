# Job Search Agent — Backend API

A **Fastify + TypeScript** API that powers the Job Search Agent PWA. It takes a natural-language (or voice) job search request, turns it into structured search criteria with OpenAI, fetches matching jobs from multiple job platforms, scores them against a candidate's resume profile, and returns a ranked list.

This is the **backend** half of the project. The client app lives in a sibling repo: `job-search-agent-pwa-frontend`.

## What this service does

1. Accepts a free-text prompt (e.g. "remote senior backend roles in the UAE paying above X") plus a target platform and result count.
2. Loads a static resume/candidate profile (`src/resume-profile.json`) and, via OpenAI (`gpt-4o-mini`-style chat completion), turns the prompt into structured `SearchCriteria` (role, skills, country, remote, salary minimum). Falls back to a local heuristic if `OPENAI_API_KEY` is unset or the call fails.
3. Fetches jobs for the requested platform:
   - **Naukri Gulf** / **GulfTalent** — scraped live with **Playwright** (Firefox headless), since these platforms have no public API. Falls back to the alternate platform if one returns zero results.
   - **Greenhouse**, **Lever**, **Ashby**, **Workable** — fetched via each platform's public job-board API, for a configured list of companies (`config/job-sources.json`).
   - "All"/unspecified platform runs both Playwright-based scrapers together.
   - If everything returns zero jobs, falls back to static mock data (`src/data/mock-jobs.ts`).
4. Deduplicates by URL and scores each job against the resume profile (role match, must-have/core/nice-to-have skill coverage, leadership, domain experience, location, salary presence — weighted per `matchScoringWeights` in the resume profile; jobs containing excluded keywords score 0).
5. Sorts by match score, trims to the requested count, and optionally filters out jobs already seen in a prior search (`excludeSeen`, tracked in `src/seen-jobs.json`).
6. Also transcribes voice recordings (OpenAI Whisper) and extracts a likely platform/country from the transcript, and gates the search feature behind a shared password.

## Tech stack

- **Node.js** + **TypeScript**, `tsx` for dev watch mode
- **Fastify 5** (`@fastify/cors`, `@fastify/multipart` for audio uploads, 25MB limit)
- **OpenAI SDK** — chat completions for search-criteria extraction, Whisper for transcription
- **Playwright** (Firefox) — scraping Naukri Gulf and GulfTalent
- **Zod** — environment variable validation
- No database — persistence is flat JSON files on disk

## API endpoints

| Method | Path                    | Description                                                      |
|--------|--------------------------|--------------------------------------------------------------------|
| GET    | `/health`                | Health check                                                      |
| POST   | `/api/access/verify`     | Verify the shared search password (`{ password }`)                |
| POST   | `/api/job-search`        | Run a search (`{ platform, country?, count, prompt?, excludeSeen? }`) → `{ searchCriteria, jobs[] }` |
| GET    | `/api/profile`           | Full resume/candidate profile                                     |
| GET    | `/api/profile/summary`   | Resume summary (`title`, `experience`, `skills`)                  |
| POST   | `/api/transcribe`        | Upload audio (multipart `audio` field) → transcript + guessed country/platform |

## Project structure

```
src/
  controllers/   request handlers (access, health, job-search, profile, transcribe)
  routes/        Fastify route registration + JSON schema validation, one file per feature
  services/      business logic: openai, resume, transcription, match-score, seen-jobs,
                  naukrigulf, gulftalent
  providers/     API-based job-board providers: greenhouse/, lever/, ashby/, workable/
  mcp/           job-search-mcp.ts — orchestrates scrapers/providers, dedup, scoring, seen-jobs
  config/        env.ts (zod-validated env), platform.config.ts (platform → allowed countries)
  types/         TypeScript types per domain
  utils/         platform-routing.ts, transcript-extraction.ts
  data/          mock-jobs.ts — static fallback listings
  resume-profile.json   the candidate profile used for search-criteria generation and scoring
  seen-jobs.json         tracks previously-returned jobs for dedup (`excludeSeen`)
config/
  job-sources.json       company slugs per API provider (Greenhouse, Lever, Ashby, Workable)
debug/                   scraped HTML/screenshots dumped here for troubleshooting
```

## Running locally

```bash
npm install
npm run dev      # tsx watch src/server.ts, default port 4000
```

Other scripts:

```bash
npm run dev:debug        # dev with Node inspector
npm run dev:debug:brk    # dev with Node inspector, break on start
npm run build             # tsc compile to dist/
npm start                 # node dist/server.js (run built output)
```

### Environment variables

Create a `.env` file in the repo root:

```
NODE_ENV=development
HOST=0.0.0.0
PORT=4000
CORS_ORIGIN=*
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_WHISPER_MODEL=whisper-1
OPENAI_WHISPER_LANGUAGE=en
JOBPASSWORD=your-shared-search-password
```

| Variable                  | Purpose                                                      | Default        |
|----------------------------|---------------------------------------------------------------|----------------|
| `NODE_ENV`                | Environment mode                                              | `development`  |
| `HOST`                    | Bind address                                                   | `0.0.0.0`      |
| `PORT`                    | Port to listen on                                              | `4000`         |
| `CORS_ORIGIN`             | Allowed CORS origin(s)                                         | `*`            |
| `OPENAI_API_KEY`          | Enables OpenAI-based criteria extraction & transcription. Optional — the app falls back to heuristics without it | — |
| `OPENAI_MODEL`            | Chat model used for criteria extraction                       | `gpt-4o-mini`  |
| `OPENAI_WHISPER_MODEL`    | Model used for voice transcription                             | `whisper-1`    |
| `OPENAI_WHISPER_LANGUAGE` | Expected transcription language                                 | `en`           |
| `JOBPASSWORD`             | Shared secret required to unlock the search feature. Optional — `/api/access/verify` returns 503 if unset | — |

Note: env loading also reads `.env.example` as a fallback source of defaults (see `src/config/env.ts`) — don't rely on that for real secrets, it's only meant for local scaffolding.

## Job platforms

| Platform     | How jobs are fetched                          |
|--------------|--------------------------------------------------|
| Naukri Gulf  | Playwright scraping (no public API)             |
| GulfTalent   | Playwright scraping (no public API)             |
| Greenhouse   | Public API, configured companies in `config/job-sources.json` |
| Lever        | Public API, configured companies                 |
| Ashby        | Public API, configured companies                 |
| Workable     | Public API (no companies configured by default)  |

## Notes

- There is no traditional database; all state (resume profile, seen-jobs, company source lists) lives in JSON files checked into or generated alongside the repo.
- Playwright scraping runs synchronously per-request; Fastify's request/connection timeouts are raised to 180s in `app.ts` to accommodate slow scrapes.
- No deployment config (Dockerfile, etc.) is currently checked into this repo.

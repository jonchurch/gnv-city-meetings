# Civic Meetings Pipeline – PRD (Horizon 1 MVP)

## 1 Purpose

Establish a robust, single‑node pipeline that ingests Gainesville City Commission meeting assets, enriches them with agenda‑based chapter markers and machine‑generated transcripts, and publishes them to YouTube (phase 1) and local storage for future use. This MVP replaces the brittle cron script with an idempotent, observable workflow that can reliably back‑fill historical meetings and serve as the foundation for later multi‑city expansion and custom video hosting.

## 2 Background & Context

* Current solution: hourly cron job that polls the public calendar, downloads new videos, extracts agenda chapters, and uploads unedited video + description to YouTube. State tracking is flat‑file based, causing duplicate work and race conditions when downloads exceed one polling interval.
* Planned roadmap: Horizon 2 (cloud scale, multi‑city), Horizon 3 (self‑hosted streaming platform). This PRD covers only Horizon 1.

## 3 Goals

1. **Reliability** – No duplicate downloads, skipped meetings, or orphaned states.
2. **Idempotency & Re‑startability** – Pipeline can be stopped/restarted without manual cleanup.
3. **Observability** – Operator can answer “What’s running? What failed?” via logs & metrics.
4. **Back‑fill Support** – CLI can enqueue hundreds of past meetings without starving live traffic.
5. **Low Ops Overhead** – Runs on a single VM + one GPU workstation; no Kubernetes required.

## 4 Non‑Goals

* Multi‑city ingestion (handled in Horizon 2).
* Custom video streaming (handled in Horizon 3).
* Full‑text or vector search endpoints.

## 5 Assumptions

* Meeting videos remain publicly downloadable without authentication.
* A single RTX 4090 workstation is available for diarization jobs.
* Daily volume ≤ 3 meetings; historical backlog ≤ 500 meetings.

## 6 User Stories

|  ID  | As a…             | I want…                                               | So that…                              |
| ---- | ----------------- | ----------------------------------------------------- | ------------------------------------- |
|  U1  | Pipeline operator | Clear dashboard of meeting states                     | I can detect and fix failures quickly |
|  U2  | Content publisher | Reliable YouTube uploads with correct chapter markers | Viewers can navigate meetings easily  |
|  U3  | Developer         | CLI to enqueue historical meetings                    | I can back‑fill without editing code  |

## 7 Functional Requirements

### 7.1 Discovery Service

* Polls calendar hourly via systemd timer.
* Acquires exclusive lock to prevent concurrent runs.
* Inserts new meetings into `meetings` table with state `DISCOVERED`.

### 7.2 Processing Worker

* Listens to BullMQ queue `processMeeting`.
* Steps executed sequentially:

  1. Download video, agenda, transcript → object store `raw/`.
  2. Parse agenda HTML → `description.txt`.
  3. Upload to YouTube, attach description.
  4. Enqueue `diarize.<meetingId>` job.

### 7.3 GPU Worker (Diarization)

* Runs on RTX 4090 host.
* Generates diarized transcript (`.jsonl`) with speaker labels.
* Stores output in `derived/` and updates meeting state to `DIARIZED`.

### 7.4 Back‑fill CLI

* `node backfill.js --from 2019-01-01`
* Inserts rows in batches of N (‑‑batch‑size), respecting queue length threshold.

### 7.5 Observability

* JSON logs (Vector → Loki).
* Prometheus metrics exported by workers (`meetings_processed_total`, `queue_jobs_failed`).
* Grafana dashboard with:

  * Meetings by state (bar chart)
  * Queue depth over time
  * Error rate per step

## 8 Non‑Functional Requirements

| Category        | Requirement                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Performance     | Pipeline must process a newly discovered meeting within 6 hours end‑to‑end (assuming 2‑hour video length). |
| Reliability     | 99% of meetings processed without manual intervention; retries with exponential back‑off.                  |
| Scalability     | Able to handle up to 20 meetings/day on same hardware.                                                     |
| Security        | API keys (YouTube, Redis) stored in `.env` (local) and 1Password (prod).                                   |
| Maintainability | All pipeline steps written as independent, testable functions.                                             |

## 9 Open Questions

1. Where to store speaker‑embedding model artefacts? (object store vs Git‑tracked)
2. YouTube quota limits—do we need upload rate throttling now?
3. File naming conventions for raw vs derived artefacts—finalise before back‑fill.

## 10 Risks & Mitigations

| Risk                                        | Impact              | Likelihood | Mitigation                                                   |
| ------------------------------------------- | ------------------- | ---------- | ------------------------------------------------------------ |
| Calendar HTML changes                       | Discovery fails     | Medium     | Write scraper tests; alert if parser finds 0 events for 24 h |
| GPU node downtime                           | Diarization backlog | Low        | Fallback to CPU worker with slower throughput                |
| Large historical upload burst hits YT quota | PRD goals missed    | Medium     | Implement exponential back‑off & daily quota check           |

## 11 Success Metrics

* <3% duplicate or missed meetings in first month.
* Mean time‑to‑publish ≤ 4 hours from `DISCOVERED` state.
* <1 manual intervention per 30 days.

## 12 Dependencies

* Redis (BullMQ)
* Vector + Loki + Grafana docker stack
* WhisperX Docker image on RTX 4090 host

## 13 Timeline / Milestones

| Date       | Milestone                             |
| ---------- | ------------------------------------- |
|  T+1 day   | Schema + discovery timer in prod      |
|  T+3 days  | BullMQ queue & serial worker deployed |
|  T+5 days  | GPU diarization worker live           |
|  T+7 days  | Grafana dashboard & alerting          |
|  T+10 days | Historical back‑fill begun            |

---

## Appendix A · Current Implementation Baseline

The codebase at project start comprises **one Node.js CLI script** (`index.js`) and a companion **`youtube-uploader.js`** module.

### Overview of Current Flow

1. **Discovery (cron‑invoked)**

   * POST to `MeetingsCalendarView.aspx/GetAllMeetings` for a date range.
   * Filter `HasVideo` meetings; skip those marked *processed* in JSON manifest.
2. **Processing** (sequential, in‑process)

   * Scrape meeting agenda page for bookmark JSON.
   * Persist agenda JSON and YouTube description text to flat files.
   * `yt-dlp` download to `downloads/`.
   * Upload to YouTube via OAuth2; record URL in manifest.
3. **State Tracking**

   * Flat‑file manifest `downloads/processed-meetings.json` with `{ id, success, youtubeUrl, uploaded }` per meeting.
4. **Config & Secrets**

   * `.env` provides Google OAuth creds, optional `YTDLP_PATH`.

### Observed Pain Points

| Pain                  | Symptom                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| Non‑idempotent cron   | Long video download > 1 h causes next cron tick to double‑process meeting |
| Back‑fill duplication | `--force` inserts duplicates into manifest; no per‑step state granularity |
| Lack of retries       | Network/YouTube errors require manual rerun                               |
| Limited observability | Only console logs; no aggregated metrics                                  |

These issues motivate Horizon 1 goals: introduce a real state machine, job queue, and structured logs while keeping a single‑node footprint.

## 14 Immediate Implementation Priorities

Below is a concrete, week‑zero checklist tailored to the current single‑script codebase you shared. Tackle items top‑to‑bottom; each unlocks the next while keeping the diff small and testable.

| Priority                                                   | Task                                                                                                                         | Why now?                                                                                | Est. Effort |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- |
| P0                                                         | **Create `meetings.db` (SQLite)** with one table: `meetings(id TEXT PK, state TEXT, title TEXT, date TEXT, updated_at TEXT)` | Gives a *single source of truth*; lets us delete the brittle `processed-meetings.json`. | 1–2 h       |
| P1                                                         | **Split current script into two CLI commands**                                                                               |                                                                                         |             |
| `discover.js` → inserts/updates rows (`DISCOVERED`)        |                                                                                                                              |                                                                                         |             |
| `process.js` → takes `id` arg, runs download→agenda→upload | Makes code paths idempotent and testable; mirrors future queue architecture.                                                 | 2–3 h                                                                                   |             |
| P2                                                         | **Add a BullMQ queue + Redis (Docker)**; wrap `process.js` as the worker; change `discover.js` to `queue.add(id)`            | Eliminates cron collision and parallel‑safe retries with *minimal* code churn.          | 2 h         |
| P3                                                         | **Replace flat‑file output paths with deterministic object‑store helpers**                                                   |                                                                                         |             |
| `pathFor('raw', id)`, `pathFor('derived', id)`             | Locks in naming convention before back‑fill; future S3 move is one‑line change.                                              | 1 h                                                                                     |             |
| P4                                                         | **Instrument structured JSON logging** (`console.log(JSON.stringify({...}))`) with `meeting_id`, `step`, `state`             | Enables immediate grep debugging; feeds straight into Loki later.                       | 1 h         |
| P5                                                         | **Systemd timer** for `discover.js` with `flock -n /tmp/meeting.lock`                                                        | Prevents double discovery runs without introducing Temporal yet.                        | 0.5 h       |
| P6                                                         | **Back‑fill CLI**: `node discover.js --from 2019-01-01 --enqueue-only`                                                       | Reuses discovery logic; lets queue throttle backlog automatically.                      | 1 h         |
| P7                                                         | **GPU diarization job skeleton** (queue name `diarize` routes to RTX host; just logs for now)                                | Creates plumbing so adding WhisperX later is copy‑paste.                                | 1 h         |
| P8                                                         | **Delete `--force` flag path & manifest logic** once above is stable                                                         | Removes the last JSON‑file dependency; simplifies mental model.                         | 0.5 h       |

➡️ *Deliverable*: by the end of P4 you have a **reliable, restartable, observable** pipeline still running on one VM—but now it’s event‑driven and DB‑backed, ready for WhisperX and future cloud moves.



<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
  <h1 align="center">Betting Engine (Pool Based)</h1>
</p>

## Description

A modular, event-driven betting engine architecture designed for transparency and automation. It features:
1.  **Multi-Sport Data Ingestion**: Dynamic scraping of real-time sports data (Flashscore) for Football, Tennis, Basketball, and more using Playwright.
2.  **AI-Powered Market Maker**: Uses Large Language Models (OpenRouter) to identify sport contexts and generate relevant, open-ended pool markets (e.g., "Set Winner" for Tennis).
3.  **Automated Lifecycle**: 
    *   **Locking**: Automatically locks markets when the event starts (driven by Cron jobs).
    *   **Resulting (Oracle)**: Monitors live scores and asks the AI to settle markets (Win/Loss/Void) once the match finishes.
4.  **Consensus Oracle Pattern**: (In Progress) Verification across multiple independent sources to ensure trustless resolution.

## Architecture

*   **Backend**: NestJS (Monorepo)
*   **Database**: SQLite (Dev) / PostgreSQL (Prod) via Prisma ORM
*   **Scraping**: Playwright & Puppeteer
*   **AI**: OpenRouter (Unified API for GPT-4o, Claude, Llama 3)
*   **Job Scheduling**: @nestjs/schedule (Cron Jobs)

## Modules

*   `ScraperModule`: Handles multi-sport scraping and creates `Event` records.
*   `LlmModule`: The "Brain" – Generates markets and acts as the Judge/Oracle for results.
*   `MarketModule`: The "Clock" – Manages the state of events (`SCHEDULED` -> `IN_PLAY` -> `FINISHED`) and Markets (`OPEN` -> `LOCKED` -> `RESULTED`).

## Project Setup

```bash
# Install dependencies
$ npm install

# Initialize Database (SQLite)
$ npx prisma generate
$ npx prisma db push
```

**Environment Variables**:
Ensure you have a `.env` file with:
```env
DATABASE_URL="file:./dev.db"
OPENROUTER_API_KEY="sk-..."
```

## Running the App

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev
```

## How to Verify (Local Implementation)

1.  **Start the Server**: `npm run start`
2.  **Trigger Ingestion**:
    *   Use the API to scrape live data.
    *   **Single Sport**: `GET /scraper/test?sport=tennis` (or football, basketball, etc.)
    *   **All Sports**: `GET /scraper/test-all` (Iterates through top 6 sports)
3.  **Check Logs**:
    *   Watch for "Found X matches", "Generating markets...", "Saved Event...".
    *   Wait 1 minute for the **Scheduler**.
    *   **Locking**: If `startTime` < Now, logs will show "Locked markets for Event...".
    *   **Resulting**: If match status is "Finished", logs will show "Oracle decision..." and "Markets Resulted Successfully".

## Features Implemented

*   [x] **Multi-Sport Scraper**: Robust parsing of Flashscore for various sports.
*   [x] **AI Market Generation**: Dynamic market creation + sport detection.
*   [x] **Market Lifecycle**: Automated Locking (Cron).
*   [x] **AI Oracle**: Automated Resulting/Settlement of markets based on final scores.
*   [x] **Type Safety**: Strict TypeScript + ESLint + Prettier workflow.

## Roadmap (Upcoming)

*   [ ] **Phase 5: Betting & Wallet**
    *   User Authentication (JWT).
    *   Wallet Management (Deposit/Withdraw keys).
    *   Bet Placement Logic (Pool calculations).
*   [ ] **Phase 6: Frontend Client**
    *   Next.js Dashboard for users to view odds and place bets.
*   [ ] **Phase 7: Advanced Oracle**
    *   Multi-source verification (BBC, ESPN) to cross-check results before paying out.

## API Endpoints

*   `GET /scraper/ingest`: Scrape default sport (Football).
*   `GET /scraper/ingest?sport=[name]`: Scrape specific sport (e.g. `tennis`, `cricket`).
*   `GET /scraper/ingest-all`: Scrape all configured sports.

## License

Attributes to NestJS (MIT).

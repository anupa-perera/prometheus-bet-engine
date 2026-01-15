
<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
  <h1 align="center">Betting Engine (Pool Based)</h1>
</p>

## Description

A modular, event-driven betting engine capable of:
1.  **Ingesting Data**: Scraping real-time sports data (e.g. Flashscore) using Playwright.
2.  **AI Market Generation**: Using OpenRouter (LLM) to identify sports and generate open-ended pool markets (without fixed odds).
3.  **Market Lifecycle**: Automatically opening and locking markets based on match start times.
4.  **Consensus Oracle**: Verifying results using multiple sources (Score Sites + News) for decentralized resolution (In Progress).

## Architecture

*   **Backend**: NestJS (Monorepo)
*   **Database**: SQLite (Dev) / PostgreSQL (Prod) via Prisma ORM
*   **Scraping**: Playwright
*   **AI**: OpenRouter (GPT-4o / Claude 3.5 / Open Source Models)
*   **Scheduling**: @nestjs/schedule (Cron Jobs)

## Modules

*   `ScraperModule`: Handles data ingestion from external sites.
*   `LlmModule`: Interfaces with OpenRouter for intelligence (Market Gen, Oracle).
*   `MarketModule`: Manages market lifecycle (Locking, Resulting).

## Project Setup

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev
```

## Features Implemented

*   [x] **Playwright Scraper**: Extracts Team Names, Time, and Status from Flashscore.
*   [x] **AI Integration**: Generates context-aware betting markets (e.g. "Match Result", "First Goal Scorer") based on scraped match data.
*   [x] **Centralized Config**: Constants for URLs and Types.
*   [x] **Standard Code Style**: Prettier + ESLint + Husky Hooks.
*   [x] **Market Scheduler**: Auto-locks markets when match starts.

## API Endpoints

*   `GET /scraper/test`: Triggers a scrape of Flashscore and generates AI markets for the first match found (Debug/Test).

## License

Attributes to NestJS (MIT).

import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import { PrismaService } from '../prisma.service';
import { LlmService } from '../llm/llm.service';
import { MatchData } from '../common/types';
import { EXTERNAL_URLS } from '../common/constants';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private prisma: PrismaService,
    private llmService: LlmService,
  ) {}

  // Helper to parse 'Today, 23:00' or dates
  private parseTime(timeStr: string): Date {
    const now = new Date();
    // Simplified parsing logic for demo:
    // If it says "Finished" or "After Pen", assume it started in the past (e.g. 2 hours ago)
    if (
      timeStr.includes('Finished') ||
      timeStr.includes('After') ||
      timeStr.includes('Live')
    ) {
      return new Date(now.getTime() - 2 * 60 * 60 * 1000);
    }
    // If it has a time like "23:00", assume it's today
    if (timeStr.includes(':')) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date;
    }
    return now;
  }

  async inspectFlashscoreSelectors() {
    this.logger.log('Starting Flashscore Inspection...');
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true }); // Headless false if debugging visually
      const page: Page = await browser.newPage();

      this.logger.log('Navigating to Flashscore...');
      await page.goto(EXTERNAL_URLS.FLASHSCORE_BASE, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait for the main event list
      try {
        await page.waitForSelector('.event__match', { timeout: 10000 });
        this.logger.log('Found .event__match elements!');
      } catch {
        this.logger.warn(
          'Could not find .event__match, dumping body to check structure...',
        );
      }

      // extract first few matches
      const matches = await page.evaluate(() => {
        const elements = document.querySelectorAll('.event__match');
        return Array.from(elements)
          .slice(0, 5)
          .map((el) => {
            try {
              // Selectors identified by Browser Agent
              const homeEl =
                el.querySelector('.event__participant--home') ||
                el.querySelector('.event__homeParticipant');
              const awayEl =
                el.querySelector('.event__participant--away') ||
                el.querySelector('.event__awayParticipant');
              const timeEl = el.querySelector('.event__time');
              const statusEl = el.querySelector('.event__stage');

              return {
                home: homeEl?.textContent?.trim() || 'Unknown Home',
                away: awayEl?.textContent?.trim() || 'Unknown Away',
                time:
                  timeEl?.textContent?.trim() ||
                  statusEl?.textContent?.trim() ||
                  new Date().toISOString(),
                source: 'flashscore',
                raw: el.innerHTML.substring(0, 100), // Keep debug info
              };
            } catch {
              return {
                home: 'Error',
                away: 'Error',
                time: 'Error',
                source: 'error',
                raw: '',
              };
            }
          });
      });

      this.logger.log(`Found ${matches.length} matches:`);
      this.logger.log(JSON.stringify(matches, null, 2));

      // Select the first match for LLM testing
      const matchToProcess: MatchData =
        matches.length > 0
          ? {
              homeTeam: matches[0].home || 'Unknown Home',
              awayTeam: matches[0].away || 'Unknown Away',
              startTime: matches[0].time || new Date().toISOString(),
              source: 'flashscore-scraped',
            }
          : {
              homeTeam: 'Test Home Team',
              awayTeam: 'Test Away Team',
              startTime: new Date().toISOString(),
              source: 'test-dummy',
            };

      this.logger.log(
        `Testing LLM with Match: ${matchToProcess.homeTeam} vs ${matchToProcess.awayTeam}`,
      );
      const aiMarkets = await this.llmService.generateMarkets(matchToProcess);

      // --- PERSISTENCE LAYER ---
      // We must save this to DB so the Scheduler can act on it
      const eventId = `test-${Date.now()}`; // fast unique ID for demo
      const parsedStartTime = this.parseTime(matchToProcess.startTime);

      const savedEvent = await this.prisma.event.create({
        data: {
          externalId: eventId,
          homeTeam: matchToProcess.homeTeam,
          awayTeam: matchToProcess.awayTeam,
          startTime: parsedStartTime,
          projectedEnd: new Date(
            parsedStartTime.getTime() + 2 * 60 * 60 * 1000,
          ), // +2h
          status: 'SCHEDULED', // Force SCHEDULED so we can test Locking logic
          markets: {
            create: aiMarkets.map((m) => ({
              name: m.name,
              status: 'OPEN',
            })),
          },
        },
        include: { markets: true },
      });

      this.logger.log(
        `Saved Event [${savedEvent.id}] with ${savedEvent.markets.length} markets to DB.`,
      );

      return {
        scrapedMatches: matches,
        llmResult: aiMarkets,
        savedEvent,
      };
    } catch (error) {
      this.logger.error('Inspection failed', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  async findMatchResult(
    homeTeam: string,
    awayTeam: string,
  ): Promise<MatchData | null> {
    this.logger.log(`Searching for result: ${homeTeam} vs ${awayTeam}`);

    // reusing the inspection logic for MVP (getting top 5 matches)
    // in prod this would search specifically or go to the event link
    const inspection = await this.inspectFlashscoreSelectors();

    const relevantMatch = inspection.scrapedMatches.find(
      (m) =>
        m.home.includes(homeTeam) ||
        m.away.includes(awayTeam) || // Simplify matching for demo
        homeTeam.includes(m.home) ||
        awayTeam.includes(m.away),
    );

    if (relevantMatch) {
      return {
        homeTeam: relevantMatch.home,
        awayTeam: relevantMatch.away,
        startTime: relevantMatch.time, // This might be "Finished" or "2-1"
        source: `Flashscore Scraped: ${relevantMatch.raw}`,
      };
    }

    return null;
  }
}

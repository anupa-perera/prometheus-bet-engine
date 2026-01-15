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

  async inspectFlashscoreSelectors(sport: string = 'football') {
    this.logger.log(`Starting Flashscore Inspection for sport: ${sport}...`);
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page: Page = await browser.newPage();

      const url =
        sport === 'football'
          ? EXTERNAL_URLS.FLASHSCORE_BASE
          : `${EXTERNAL_URLS.FLASHSCORE_BASE}${sport}/`;

      this.logger.log(`Navigating to ${url}...`);
      await page.goto(url, {
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

      if (matches.length === 0) {
        this.logger.warn('No matches found to process.');
        throw new Error('No matches found.');
      }

      // Select the first match for LLM testing (Production: Iterate all or queue them)
      const matchToProcess: MatchData = {
        homeTeam: matches[0].home || 'Unknown Home',
        awayTeam: matches[0].away || 'Unknown Away',
        startTime: matches[0].time || new Date().toISOString(),
        source: 'flashscore-scraped',
        sport: sport,
      };

      this.logger.log(
        `Testing LLM with Match: ${matchToProcess.homeTeam} vs ${matchToProcess.awayTeam}`,
      );
      // Pass sport context to generating markets (TODO: Update LLM Service to use it if needed)
      const aiMarkets = await this.llmService.generateMarkets(matchToProcess);

      // --- PERSISTENCE LAYER ---
      // composite ID: team vs team - date
      const sanitize = (s: string) =>
        s.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const parsedStartTime = this.parseTime(matchToProcess.startTime);
      const eventId = `${sanitize(matchToProcess.homeTeam)}-vs-${sanitize(matchToProcess.awayTeam)}-${parsedStartTime.toISOString().split('T')[0]}`;

      const savedEvent = await this.prisma.event.upsert({
        where: { externalId: eventId },
        update: {
          status: 'IN_PLAY', // Update status if re-scraped (simplified logic)
          // We don't overwrite markets to avoid destroying existing state
        },
        create: {
          externalId: eventId,
          homeTeam: matchToProcess.homeTeam,
          awayTeam: matchToProcess.awayTeam,
          startTime: parsedStartTime,
          projectedEnd: new Date(
            parsedStartTime.getTime() + 2 * 60 * 60 * 1000,
          ), // +2h
          status: 'SCHEDULED',
          sport: sport,
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

  async scrapeAllSports() {
    // Full list of sports discovered from Flashscore menu
    const sports = [
      'football',
      'tennis',
      'basketball',
      'hockey',
      'cricket',
      'baseball',
      'rugby-union',
      'american-football',
      'aussie-rules',
      'badminton',
      'bandy',
      'beach-soccer',
      'beach-volleyball',
      'boxing',
      'cycling',
      'darts',
      'esports',
      'field-hockey',
      'floorball',
      'futsal',
      'golf',
      'handball',
      'horse-racing',
      'kabaddi',
      'mma',
      'motorsport',
      'netball',
      'pesapallo',
      'rugby-league',
      'snooker',
      'table-tennis',
      'volleyball',
      'water-polo',
      'winter-sports',
    ];

    const results = [];

    for (const sport of sports) {
      try {
        this.logger.log(`Starting scrape for sport: ${sport}`);
        const result = await this.inspectFlashscoreSelectors(sport);
        results.push({
          sport,
          success: true,
          count: result.scrapedMatches.length,
        });
      } catch (error) {
        this.logger.error(`Failed to scrape sport: ${sport}`, error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({ sport, success: false, error: errorMessage });
      }
    }
    return results;
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

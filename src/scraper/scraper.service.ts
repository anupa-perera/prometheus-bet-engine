import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { LlmService } from '../llm/llm.service';
import { MatchData, MarketData } from '../common/types';
import { EXTERNAL_URLS } from '../common/constants';

export interface ScrapedMatch {
  home: string;
  away: string;
  time: string;
  source: string;
  raw?: string;
}

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
    // 1. Check for finished/live markers
    if (
      timeStr.includes('Finished') ||
      timeStr.includes('After') ||
      timeStr.includes('Live') ||
      timeStr.includes('FT') ||
      timeStr.includes('Pen') ||
      timeStr.includes('AET')
    ) {
      return new Date(now.getTime() - 2 * 60 * 60 * 1000);
    }

    // 2. Check for scores (e.g. "2 - 1") which implies it's in progress or finished
    if (/\d+\s*[-:]\s*\d+/.test(timeStr)) {
      return new Date(now.getTime() - 60 * 60 * 1000); // Assume it started 1h ago
    }

    // 3. Time format "HH:mm"
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const date = new Date();
        date.setHours(parts[0], parts[1], 0, 0);
        return date;
      }
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

      // extract matches
      const matches = await page.evaluate(() => {
        const elements = document.querySelectorAll('.event__match');
        return Array.from(elements)
          .slice(0, 15) // Process up to 15 matches instead of just 5
          .map((el): ScrapedMatch | null => {
            try {
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
                  '',
                source: 'flashscore',
              };
            } catch {
              return null;
            }
          })
          .filter((m) => m !== null);
      });

      this.logger.log(
        `Found ${matches.length} matches for ${sport}. Processing...`,
      );

      const processedResults = [];

      for (const match of matches) {
        if (!match) continue;

        const matchToProcess: MatchData = {
          homeTeam: match.home,
          awayTeam: match.away,
          startTime: match.time || new Date().toISOString(),
          source: 'flashscore-scraped',
          sport: sport,
        };

        const parsedStartTime = this.parseTime(matchToProcess.startTime);
        const sanitize = (s: string) =>
          s.replace(/[^a-z0-9]/gi, '').toLowerCase();

        // Use a more stable ID: team names only (for today) or team names + date
        // To avoid drift, we truncate the date and DONT use the "2 hours ago" transient time in the key
        const dateKey = parsedStartTime.toISOString().split('T')[0];
        const eventId = `${sanitize(matchToProcess.homeTeam)}-vs-${sanitize(matchToProcess.awayTeam)}-${dateKey}`;

        // Generate AI markets only if it's a new event or we really need them
        // For production efficiency, skip LLM if event exists
        const existingEvent = await this.prisma.event.findUnique({
          where: { externalId: eventId },
        });

        let aiMarkets: MarketData[] = [];
        if (!existingEvent) {
          this.logger.log(
            `New event found: ${matchToProcess.homeTeam} vs ${matchToProcess.awayTeam}. Generating markets...`,
          );
          aiMarkets = await this.llmService.generateMarkets(matchToProcess);
        }

        const savedEvent = await this.prisma.event.upsert({
          where: { externalId: eventId },
          update: {
            // Only update status if it's currently SCHEDULED
            status: matchToProcess.startTime.includes(':')
              ? 'SCHEDULED'
              : 'IN_PLAY',
          },
          create: {
            externalId: eventId,
            homeTeam: matchToProcess.homeTeam,
            awayTeam: matchToProcess.awayTeam,
            startTime: parsedStartTime,
            projectedEnd: new Date(
              parsedStartTime.getTime() + 2 * 60 * 60 * 1000,
            ),
            status: matchToProcess.startTime.includes(':')
              ? 'SCHEDULED'
              : 'IN_PLAY',
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

        processedResults.push(savedEvent);
      }

      return {
        scrapedMatches: matches,
        count: processedResults.length,
        sports: sport,
      };
    } catch (error) {
      this.logger.error('Inspection failed', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scrapeAllSports() {
    this.logger.log('Running Scheduled Ingestion for all sports...');
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
    const scrapedMatches = inspection.scrapedMatches;

    const relevantMatch = scrapedMatches.find(
      (m) =>
        m.home.toLowerCase().includes(homeTeam.toLowerCase()) ||
        m.away.toLowerCase().includes(awayTeam.toLowerCase()) ||
        homeTeam.toLowerCase().includes(m.home.toLowerCase()) ||
        awayTeam.toLowerCase().includes(m.away.toLowerCase()),
    );

    if (relevantMatch) {
      return {
        homeTeam: relevantMatch.home,
        awayTeam: relevantMatch.away,
        startTime: relevantMatch.time, // This might be "Finished" or "2-1"
        source: `Flashscore Scraped: ${relevantMatch.home} ${relevantMatch.time} ${relevantMatch.away}`,
      };
    }

    return null;
  }
}

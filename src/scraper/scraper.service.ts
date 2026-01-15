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
        // Flashscore usually has a generic wrapper. Let's wait for ANY text to appear or specific known classes.
        // Modern Flashscore uses classes like .event__match
        await page.waitForSelector('.event__match', { timeout: 10000 });
        this.logger.log('Found .event__match elements!');
      } catch {
        this.logger.warn(
          'Could not find .event__match, dumping body to check structure...',
        );
        // If we fail, let's just grab the page title and maybe some body text to see what loaded
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

      return {
        scrapedMatches: matches,
        llmResult: aiMarkets,
      };
    } catch (error) {
      this.logger.error('Inspection failed', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }
}

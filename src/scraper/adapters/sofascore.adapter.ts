import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { MatchData } from '../../common/types';
import { IDataSource } from '../interfaces/data-source.interface';

@Injectable()
export class SofaScoreAdapter implements IDataSource {
  private readonly logger = new Logger(SofaScoreAdapter.name);
  name = 'SofaScore';

  async findMatch(
    homeTeam: string,
    awayTeam: string,
    _date?: Date,
  ): Promise<MatchData | null> {
    this.logger.log(
      `[SofaScore] Searching for ${homeTeam} vs ${awayTeam} (Date: ${_date ? _date.toISOString() : 'Any'})...`,
    );
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // 1. Go to Homepage
      await page.goto('https://www.sofascore.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // 2. Search
      // Note: Selectors found during inspection
      // Click search input (approximate location or generic selector)
      // SofaScore often has a search icon to click first, or just typing triggers it.
      // Based on inspection, we clicked coords. Let's try typing mostly.

      // Fallback: Direct search URL if UI interaction is flaky
      // https://www.sofascore.com/search?q=Real%20Madrid%20Barcelona
      await page.goto(
        `https://www.sofascore.com/search?q=${encodeURIComponent(homeTeam + ' ' + awayTeam)}`,
        { waitUntil: 'networkidle' },
      );

      // 3. Find the correct result in the list
      const results = await page.$$('div[data-testid="search-result-event"]');
      let foundLink: string | null = null;

      const normalize = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hReq = normalize(homeTeam);
      const aReq = normalize(awayTeam);

      for (const res of results) {
        const text = (await res.innerText()).toLowerCase();
        if (
          (text.includes(hReq) || hReq.includes(normalize(text))) &&
          (text.includes(aReq) || aReq.includes(normalize(text)))
        ) {
          const link = await res.$('a');
          if (link) {
            foundLink = await link.getAttribute('href');
            break;
          }
        }
      }

      if (!foundLink) {
        this.logger.warn(
          `[SofaScore] No matching results found for ${homeTeam} vs ${awayTeam}`,
        );
        return null;
      }

      await page.goto(`https://www.sofascore.com${foundLink}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForLoadState('domcontentloaded');

      // 4. Extract Details using Inspection Selectors
      // Home: h1 bdi:nth-of-type(1)
      // Away: h1 bdi:nth-of-type(2)
      // Score: span[class*="textStyle_display.extraLarge"]

      // Wait for score to appear
      try {
        await page.waitForSelector('h1', { timeout: 10000 });
      } catch {
        this.logger.warn('[SofaScore] Match detail page load failed');
        return null; // Page structure mismatch
      }

      const matchData = await page.evaluate(() => {
        const homeEl = document.querySelector('h1 bdi:nth-of-type(1)');
        const awayEl = document.querySelector('h1 bdi:nth-of-type(2)');
        const scores = document.querySelectorAll(
          'span[class*="textStyle_display.extraLarge"]',
        );
        const statusEl = document.querySelector('div[class*="ai_center"]'); // Text like "Finished"

        const homeText = homeEl?.textContent?.trim() || '';
        const awayText = awayEl?.textContent?.trim() || '';
        const homeScore = scores[0]?.textContent?.trim() || '0';
        const awayScore = scores[1]?.textContent?.trim() || '0';
        const statusText = statusEl?.textContent?.trim() || '';

        return {
          home: homeText,
          away: awayText,
          score: `${homeScore}-${awayScore}`,
          status: statusText,
        };
      });

      this.logger.log(
        `[SofaScore] Found: ${matchData.home} ${matchData.score} ${matchData.away} (${matchData.status})`,
      );

      return {
        homeTeam: matchData.home,
        awayTeam: matchData.away,
        startTime: new Date().toISOString(), // We mostly care about result here
        source: `SofaScore: ${matchData.score} (${matchData.status})`,
        sport: 'football', // generic for now
      };
    } catch (error) {
      this.logger.error('[SofaScore] Scrape failed', error);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }
}

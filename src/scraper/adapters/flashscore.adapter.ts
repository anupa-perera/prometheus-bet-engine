import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { MatchData } from '../../common/types';
import { IDataSource } from '../interfaces/data-source.interface';
import { EXTERNAL_URLS } from '../../common/constants';

@Injectable()
export class FlashscoreAdapter implements IDataSource {
  private readonly logger = new Logger(FlashscoreAdapter.name);
  name = 'Flashscore';

  async findMatch(
    homeTeam: string,
    awayTeam: string,
    _date?: Date,
  ): Promise<MatchData | null> {
    this.logger.log(
      `[Flashscore] Searching for ${homeTeam} vs ${awayTeam} (Date: ${_date ? _date.toISOString() : 'Any'})...`,
    );
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Use the generic search flow
      // Or if we know the sport, we could go direct. Defaulting to football search.
      await page.goto(EXTERNAL_URLS.FLASHSCORE_BASE, {
        waitUntil: 'domcontentloaded',
      });

      // Click search (verified selector)
      const searchButton = '#search-window';
      // Fallback if ID changes, try class
      const searchButtonFallback = '.searchIcon';

      try {
        await page.click(searchButton);
      } catch {
        await page.click(searchButtonFallback);
      }

      // Type query into the correct input
      await page.fill('.searchInput__input', `${homeTeam} ${awayTeam}`);
      await page.keyboard.press('Enter');

      // Wait for results
      await page.waitForSelector('.searchResult', {
        timeout: 10000,
      });

      // Click first match result
      const matchSelector = '.searchResult';
      await page.click(matchSelector);

      // Switch to new tab if it opens one, or wait for navigation
      // Flashscore search usually opens in same modal or redirects?
      // Actually inspection says it lists matches.

      await page.waitForLoadState('domcontentloaded');

      // Extract details
      const details = await page.evaluate<{
        home: string;
        away: string;
        score: string;
        status: string;
      } | null>(() => {
        const homeEl = document.querySelector(
          '.duelParticipant__home .participant__participantName',
        );
        const awayEl = document.querySelector(
          '.duelParticipant__away .participant__participantName',
        );
        const scoreEl = document.querySelector('.detailScore__wrapper');
        const statusEl = document.querySelector(
          '.fixedHeaderDetail__status, .detailScore__status',
        ); // Added fallback

        if (!homeEl || !awayEl || !scoreEl) return null;

        return {
          home: homeEl.textContent?.trim() || '',
          away: awayEl.textContent?.trim() || '',
          score: scoreEl.textContent?.trim() || '0-0',
          status: statusEl?.textContent?.trim() || 'Unknown',
        };
      });

      if (!details) {
        return null;
      }

      this.logger.log(
        `[Flashscore] Found: ${details.home} ${details.score} ${details.away}`,
      );

      return {
        homeTeam: details.home,
        awayTeam: details.away,
        startTime: new Date().toISOString(),
        source: `Flashscore: ${details.score} (${details.status})`,
        sport: 'football',
        status: details.status === 'Finished' ? 'FINISHED' : 'IN_PLAY',
      };
    } catch (error: any) {
      this.logger.error('[Flashscore] Scrape failed', error);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }
}

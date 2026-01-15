import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { MatchData } from '../../common/types';
import { IDataSource } from '../interfaces/data-source.interface';

@Injectable()
export class BBCAdapter implements IDataSource {
  private readonly logger = new Logger(BBCAdapter.name);
  name = 'BBC Sport';

  async findMatch(
    homeTeam: string,
    awayTeam: string,
    _date?: Date,
  ): Promise<MatchData | null> {
    this.logger.log(
      `[BBC] Searching for ${homeTeam} vs ${awayTeam} (Date: ${_date ? _date.toISOString() : 'Any'})...`,
    );
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // 1. Go to Search
      // BBC Search is global usually: https://www.bbc.co.uk/search?q=Real+Madrid+vs+Barcelona
      // But let's try the football scores page or use site search.
      // Search is often easier.
      const query = `${homeTeam} ${awayTeam}`;
      await page.goto(
        `https://www.bbc.co.uk/search?q=${encodeURIComponent(query)}&filter=sport`,
        { waitUntil: 'domcontentloaded' },
      );

      // 2. Extract first result link that looks like a match report
      // Links usually contain /sport/football/
      // And headlines often match.
      const matchLink = await page.evaluate<string | undefined>(() => {
        // Explicitly cast the NodeList to unknown then to the specific array type we want
        const elements = document.querySelectorAll(
          'a[href*="/sport/football/"]',
        );
        const links: HTMLAnchorElement[] = [];
        elements.forEach((el) => links.push(el as HTMLAnchorElement));

        const found = links.find(
          (l) =>
            !l.href.includes('scores-fixtures') && !l.href.includes('tables'),
        );
        return found ? found.href : undefined;
      });

      if (!matchLink) {
        this.logger.warn('[BBC] No match report found in search');
        return null;
      }

      await page.goto(matchLink, { waitUntil: 'domcontentloaded' });

      // 3. scrape details using verified selectors
      const details = await page.evaluate<{
        home: string | undefined;
        away: string | undefined;
        score: string;
        status: string;
      } | null>(() => {
        const homeEl = document.querySelector(
          'div[class*="HomeTeam"] span[class*="MobileValue"]',
        );
        const awayEl = document.querySelector(
          'div[class*="AwayTeam"] span[class*="MobileValue"]',
        );
        const homeScore = document.querySelector('div[class*="HomeScore"]');
        const awayScore = document.querySelector('div[class*="AwayScore"]');
        const status = document.querySelector(
          'div[class*="MatchProgressWrapper"], div[class*="StyledPeriod"]',
        );

        if (!homeEl || !awayEl || !homeScore || !awayScore) return null;

        return {
          home: homeEl.textContent?.trim(),
          away: awayEl.textContent?.trim(),
          score: `${homeScore.textContent?.trim()}-${awayScore.textContent?.trim()}`,
          status: status?.textContent?.trim() || 'Unknown',
        };
      });

      if (!details) {
        this.logger.warn('[BBC] Match report page structure mismatch');
        return null;
      }

      this.logger.log(
        `[BBC] Found: ${details.home} ${details.score} ${details.away} (${details.status})`,
      );

      return {
        homeTeam: details.home || homeTeam,
        awayTeam: details.away || awayTeam,
        startTime: new Date().toISOString(),
        source: `BBC: ${details.score} (${details.status})`,
        sport: 'football',
        status:
          details.status.includes('FT') || details.status.includes('Full')
            ? 'FINISHED'
            : 'IN_PLAY',
      };
    } catch (error: any) {
      this.logger.error('[BBC] Scrape failed', error);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { MatchData } from '../../common/types';
import { IDataSource } from '../interfaces/data-source.interface';

@Injectable()
export class LiveScoreAdapter implements IDataSource {
  private readonly logger = new Logger(LiveScoreAdapter.name);
  name = 'LiveScore';

  async findMatch(
    homeTeam: string,
    awayTeam: string,
    _date?: Date,
    browserInstance?: Browser,
  ): Promise<MatchData | null> {
    this.logger.log(
      `[LiveScore] Searching for ${homeTeam} vs ${awayTeam} (Date: ${_date ? _date.toISOString() : 'Any'})...`,
    );
    let browser: Browser | null = null;
    try {
      if (browserInstance) {
        browser = browserInstance;
      } else {
        browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
      }
      const page = await browser.newPage();

      // Use mirror site as main site often blocks bots
      const baseUrl = 'https://www.livescores.com';
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Direct search mostly works via query params on these sites
      await page.goto(`${baseUrl}/search/?q=${encodeURIComponent(homeTeam)}`, {
        waitUntil: 'networkidle',
      });

      // Look for a match link containing both team names approx
      // Selectors on livescores.com mirror:
      // Rows usually have links. We'll search for text.
      const matchLink = await page.evaluate(
        function ({ home, away }) {
          const links = Array.from(document.querySelectorAll('a'));

          return links.find(function (l) {
            const hReq = home.toLowerCase().replace(/[^a-z0-9]/g, '');
            const aReq = away.toLowerCase().replace(/[^a-z0-9]/g, '');
            const text = l.innerText.toLowerCase();
            return text.includes(hReq) && text.includes(aReq);
          })?.href;
        },
        { home: homeTeam, away: awayTeam },
      );

      if (!matchLink) {
        this.logger.warn('[LiveScore] No match link found in search results');
        return null;
      }

      await page.goto(matchLink, { waitUntil: 'domcontentloaded' });

      // Extract details
      // On mirror sites, classes are often obfuscated (e.g. .Se, .Te).
      // We will use text-based heuristics for robustness.
      const matchData = await page.evaluate(function () {
        const text = document.body.innerText;
        // Simple regex to find score like "2 - 1" or "2 : 1" near the top
        const scoreMatch = text.match(/(\d+)\s*[-:]\s*(\d+)/);
        const statusMatch = text.match(/(FT|Full Time|Finished)/i);

        // Find team names (assuming they are h1 or similar large text)
        const h1 = document.querySelector('h1')?.innerText || '';

        return {
          rawHeader: h1,
          score: scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : '?',
          status: statusMatch ? statusMatch[0] : 'Unknown',
        };
      });

      this.logger.log(
        `[LiveScore] Found: ${matchData.rawHeader} -> ${matchData.score}`,
      );

      return {
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        startTime: new Date().toISOString(),
        source: `LiveScore: ${matchData.score} (${matchData.status})`,
        sport: 'football',
        status:
          matchData.status.includes('FT') ||
          matchData.status.includes('Full') ||
          matchData.status.includes('Finished')
            ? 'FINISHED'
            : 'IN_PLAY',
      };
    } catch (error) {
      this.logger.error('[LiveScore] Scrape failed', error);
      return null;
    } finally {
      if (!browserInstance && browser) await browser.close();
    }
  }
}

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
      const matchLink = await page.evaluate(
        ({ home, away }) => {
          const elements = document.querySelectorAll(
            'a[href*="/sport/football/"]',
          );
          const links: HTMLAnchorElement[] = [];
          elements.forEach((el) => links.push(el as HTMLAnchorElement));

          const normalize = (s: string) =>
            s.toLowerCase().replace(/[^a-z0-9]/g, '');
          const hReq = normalize(home);
          const aReq = normalize(away);

          const found = links.find((l) => {
            const text = l.innerText.toLowerCase();
            const href = l.href.toLowerCase();
            const isMatch =
              (text.includes(hReq) || text.includes(aReq)) &&
              !href.includes('scores-fixtures') &&
              !href.includes('tables');
            return isMatch;
          });
          return found ? found.href : undefined;
        },
        { home: homeTeam, away: awayTeam },
      );

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
        // BBC uses complex classes but also robust data-testids in the scoreboard
        // Try stable data-testid based logic first if available in newer layouts

        // Teams
        // DesktopValue class seems relatively stable in the header
        const homeEl = document.querySelector(
          '.ssrcss-dznsxc-StyledTeam-HomeTeam .ssrcss-1p14tic-DesktopValue, [data-testid="home-team-name"], .HomeTeam .DesktopValue',
        );
        const awayEl = document.querySelector(
          '.ssrcss-gddhb7-StyledTeam-AwayTeam .ssrcss-1p14tic-DesktopValue, [data-testid="away-team-name"], .AwayTeam .DesktopValue',
        );

        // Scores
        const homeScoreEl = document.querySelector(
          '[data-testid="score"] .ssrcss-qsbptj-HomeScore, .HomeScore',
        );
        const awayScoreEl = document.querySelector(
          '[data-testid="score"] .ssrcss-fri5a2-AwayScore, .AwayScore',
        );

        // Status
        const statusEl = document.querySelector(
          '.ssrcss-1u0dwdd-StyledPeriod, [class*="MatchProgressWrapper"], div[class*="StyledPeriod"]',
        );

        if (!homeEl || !awayEl || !homeScoreEl || !awayScoreEl) return null;

        return {
          home: homeEl.textContent?.trim(),
          away: awayEl.textContent?.trim(),
          score: `${homeScoreEl.textContent?.trim()}-${awayScoreEl.textContent?.trim()}`,
          status: statusEl?.textContent?.trim() || 'Unknown',
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

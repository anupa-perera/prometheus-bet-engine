import { Injectable, Logger } from '@nestjs/common';
import { IDataSource } from './interfaces/data-source.interface';
import { FlashscoreAdapter } from './adapters/flashscore.adapter';
import { SofaScoreAdapter } from './adapters/sofascore.adapter';
import { LiveScoreAdapter } from './adapters/livescore.adapter';
import { BBCAdapter } from './adapters/bbc.adapter';
import { MatchData } from '../common/types';
import { Browser } from 'playwright';

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);
  private sources: IDataSource[];

  constructor(
    private readonly flashscore: FlashscoreAdapter,
    private readonly sofascore: SofaScoreAdapter,
    private readonly livescore: LiveScoreAdapter,
    private readonly bbc: BBCAdapter,
  ) {
    if (!flashscore) console.error('[Oracle] FlashscoreAdapter UNDEFINED');
    if (!sofascore) console.error('[Oracle] SofaScoreAdapter UNDEFINED');
    if (!livescore) console.error('[Oracle] LiveScoreAdapter UNDEFINED');
    if (!bbc) console.error('[Oracle] BBCAdapter UNDEFINED');
    this.sources = [flashscore, sofascore, livescore, bbc];
  }

  async getConsensusResult(
    homeTeam: string,
    awayTeam: string,
    browserInstance?: Browser, // Accept reusable browser
  ): Promise<MatchData | null> {
    this.logger.log(
      `[Oracle] Gathering consensus for ${homeTeam} vs ${awayTeam}...`,
    );

    // Poll poll sources sequentially/limited to avoid launching 4 browsers at once if no shared browser
    const results: (MatchData | null)[] = [];

    // For MVP stability on free tier, strict concurrency limit or sequential execution needed
    for (const source of this.sources) {
      try {
        // If the adapter supports reusing browser, pass it (we need to update adapters too)
        // For now, assume adapters might still launch their own if not passed.
        // We need to update Adapter Inteface to accept browser
        const res = await source.findMatch(
          homeTeam,
          awayTeam,
          undefined,
          browserInstance,
        );
        results.push(res);
      } catch (e) {
        this.logger.error(`[Oracle] Source ${source.name} failed`, e);
        results.push(null);
      }
    }

    const validResults = results
      .filter((r) => r !== null)
      .filter((r) => {
        const isMatch =
          this.verifyTeamName(homeTeam, r.homeTeam) &&
          this.verifyTeamName(awayTeam, r.awayTeam);

        if (!isMatch) {
          this.logger.warn(
            `[Oracle] Source returned mismatching results. Expected: ${homeTeam} vs ${awayTeam}, Found: ${r.homeTeam} vs ${r.awayTeam}`,
          );
        }
        return isMatch;
      });

    if (validResults.length === 0) {
      this.logger.warn('[Oracle] No data found from any source.');
      return null;
    }

    // Consensus Logic: Majority Vote on Score
    const scoreCounts = new Map<string, number>();

    validResults.forEach((r) => {
      const match = r.source?.match(/(\d+-\d+)/);
      if (match) {
        const score = match[1];
        scoreCounts.set(score, (scoreCounts.get(score) || 0) + 1);
      }
    });

    let bestScore: string | null = null;
    let maxVotes = 0;

    for (const [score, count] of scoreCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        bestScore = score;
      }
    }

    if (bestScore) {
      // Logic Check: ensure status is FINISHED (or FT/AET)
      // We check if at least one source reported it as FINISHED
      const isFinished = validResults.some(
        (r) =>
          r.status === 'FINISHED' ||
          r.source?.includes('Finished') ||
          r.source?.includes('FT') ||
          r.source?.includes('AET') ||
          r.source?.includes('Pen'),
      );

      if (!isFinished) {
        this.logger.log(
          `[Oracle] Consensus Score: ${bestScore}, but match is NOT FINISHED yet.`,
        );
        return null;
      }

      this.logger.log(
        `[Oracle] Consensus Reached: ${bestScore} with ${maxVotes}/${validResults.length} votes.`,
      );
      return {
        homeTeam,
        awayTeam,
        startTime: new Date().toISOString(),
        source: `Consensus: ${bestScore} (Finished) (Votes: ${maxVotes}/${validResults.length})`,
        status: 'FINISHED',
        sport: validResults[0].sport,
      };
    }

    this.logger.warn('[Oracle] No consensus reached.');
    return null;
  }

  private verifyTeamName(requested: string, found: string): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .trim();
    const r = normalize(requested);
    const f = normalize(found);

    // Allow fuzzy matching: "Real Madrid" matches "Real Madrid CF"
    return f.includes(r) || r.includes(f);
  }
}

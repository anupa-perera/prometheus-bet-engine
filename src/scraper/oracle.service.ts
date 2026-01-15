import { Injectable, Logger } from '@nestjs/common';
import { IDataSource } from './interfaces/data-source.interface';
import { FlashscoreAdapter } from './adapters/flashscore.adapter';
import { SofaScoreAdapter } from './adapters/sofascore.adapter';
import { LiveScoreAdapter } from './adapters/livescore.adapter';
import { BBCAdapter } from './adapters/bbc.adapter';
import { MatchData } from '../common/types';

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
    this.sources = [flashscore, sofascore, livescore, bbc];
  }

  async getConsensusResult(
    homeTeam: string,
    awayTeam: string,
  ): Promise<MatchData | null> {
    this.logger.log(
      `[Oracle] Gathering consensus for ${homeTeam} vs ${awayTeam}...`,
    );

    // Poll all sources in parallel
    const results = await Promise.all(
      this.sources.map(async (source) => {
        try {
          return await source.findMatch(homeTeam, awayTeam);
        } catch (e) {
          this.logger.error(`[Oracle] Source ${source.name} failed`, e);
          return null;
        }
      }),
    );

    const validResults = results
      .filter((r) => r !== null)
      .filter((r) => {
        // Strict Verification: Ensure the found match actually matches the requested teams
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
      // Extract score from "Source: 2-1 (FT)" string or similar if simplified
      // The adapters currently put formatting in 'source' field sometimes
      // But let's assume validResults usually have a reliable score format if we parse it.
      // Actually, let's normalize the score extraction in the adapter or here.
      // Adapters return `source` field like "Flashscore: 2-1 (Finished)"
      // Let's rely on that for now, assuming adapters are doing their job.
      // Better: Adapters should probably return a structured result, but MatchData has loose fields.
      // Let's parse the score from the 'source' string or assume adapters should populate a 'score' field (which MatchData doesn't have explicitly, it's mixed).
      // Wait, MatchData definition:
      // export interface MatchData { ... source?: string; ... }
      // Adapters are putting "Source: 2-1 (Status)" in the source field.

      // Simple regex to extract "d-d" from the source string
      const match = r.source?.match(/(\d+-\d+)/);
      if (match) {
        const score = match[1];
        scoreCounts.set(score, (scoreCounts.get(score) || 0) + 1);
      }
    });

    // Find winner
    let bestScore: string | null = null;
    let maxVotes = 0;

    for (const [score, count] of scoreCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        bestScore = score;
      }
    }

    if (bestScore) {
      this.logger.log(
        `[Oracle] Consensus Reached: ${bestScore} with ${maxVotes}/${validResults.length} votes.`,
      );
      // Return a composite result
      return {
        homeTeam,
        awayTeam,
        startTime: new Date().toISOString(),
        source: `Consensus: ${bestScore} (Votes: ${maxVotes}/${validResults.length})`,
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

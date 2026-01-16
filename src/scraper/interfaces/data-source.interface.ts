import { MatchData } from '../../common/types';
import { Browser } from 'playwright';

export interface IDataSource {
  name: string;
  findMatch(
    homeTeam: string,
    awayTeam: string,
    date?: Date,
    browserInstance?: Browser,
  ): Promise<MatchData | null>;
}

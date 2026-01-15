import { MatchData } from '../../common/types';

export interface IDataSource {
  name: string;
  findMatch(
    homeTeam: string,
    awayTeam: string,
    date?: Date,
  ): Promise<MatchData | null>;
}

export interface MatchData {
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  league?: string;
  source?: string;
  externalId?: string;
  projectedEnd?: string;
}

export interface MarketOutcome {
  name: string;
  probability?: number; // Optional for pool based
}

export interface MarketData {
  name: string;
  outcomes: string[] | MarketOutcome[];
}

export interface LlmResponse {
  sport?: string;
  markets: MarketData[];
}

export interface MarketResult {
  marketName: string;
  winningOutcome: string;
}

export interface SettlementResult {
  matchParams: string; // e.g. "Nigeria 1 - 1 Morocco"
  results: MarketResult[];
}

export interface OpenRouterResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

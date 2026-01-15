import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MatchData,
  MarketData,
  OpenRouterResponse,
  LlmResponse,
  SettlementResult,
} from '../common/types';
import { EXTERNAL_URLS } from '../common/constants';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  // private readonly openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions'; // Moved to constants

  constructor(private configService: ConfigService) {}

  async generateMarkets(matchData: MatchData): Promise<MarketData[]> {
    this.logger.log(
      `Generating markets for match: ${matchData.homeTeam} vs ${matchData.awayTeam} `,
    );

    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');

    // Fallback if no key is present (for testing without billing)
    if (!apiKey) {
      this.logger.warn('No OpenRouter Key found. Returning mock markets.');
      return this.mockMarkets(matchData);
    }

    try {
      const prompt = `
        You are an expert betting market maker for a Pool - Based Betting System(winners share the pot).
        
        Input Data:
- Event: ${matchData.homeTeam} vs ${matchData.awayTeam}
- Context: ${matchData.league || matchData.source || 'Unknown Source'}
- Time: ${matchData.startTime}

Task:
1. Identify the SPORT based on the teams and context(e.g., "Football", "Basketball", "Esports", "Unknown").
        2. Generate 3 - 5 engaging betting markets suitable for this sport. 
        3. Since this is a POOL system, DO NOT generate odds.Just the market name and valid outcomes.

    Format: 
        Return ONLY valid JSON with this structure:
{
    "sport": "string",
        "markets": [
            { "name": "string", "outcomes": ["string", "string"] }
        ]
}

Example:
{
    "sport": "Football",
        "markets": [
            { "name": "Match Result", "outcomes": ["Home Win", "Draw", "Away Win"] },
            { "name": "Total Goals", "outcomes": ["Over 2.5", "Under 2.5"] }
        ]
}
`;

      const response = await fetch(EXTERNAL_URLS.OPENROUTER_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey} `,
          'HTTP-Referer': EXTERNAL_URLS.APP_URL, // Optional. Site URL for rankings on openrouter.ai.
          'X-Title': 'Betting Engine', // Optional. Site title for rankings on openrouter.ai.
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'xiaomi/mimo-v2-flash:free', // User requested free model
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API Error: ${response.statusText} `);
      }

      const data = (await response.json()) as OpenRouterResponse;
      const content = data.choices?.[0]?.message?.content;

      this.logger.log(`Raw LLM Response: ${content} `); // Debug log

      // Cleanup: Remove markdown code blocks if present (e.g. ```json ... ```)
      const cleanContent = content
        ?.replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(cleanContent || '{}') as LlmResponse;

      // Handle the new structure { sport: string, markets: [...] }
      if (parsed.markets && Array.isArray(parsed.markets)) {
        return parsed.markets; // For now, just return markets to keep service contract similar
        // TODO: We should probably return the 'sport' as well to save it on the Event
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to generate markets via LLM', error);
      return [];
    }
  }

  async settleMarkets(
    matchData: MatchData,
    marketNames: string[],
  ): Promise<SettlementResult> {
    this.logger.log(
      `Settling markets for match: ${matchData.homeTeam} vs ${matchData.awayTeam} (${matchData.source})`,
    );

    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      return { matchParams: 'Mock Settle', results: [] };
    }

    try {
      const prompt = `
        You are an expert betting judge (Oracle).
        
        Event: ${matchData.homeTeam} vs ${matchData.awayTeam}
        Info: ${matchData.source || 'No details provided'}
        Time: ${matchData.startTime}

        We need to result the following POOL betting markets.
        Markets to Settle:
        ${JSON.stringify(marketNames)}

        Task:
        1. Analyze the "Info" string (which contains scraped score/status like "Nigeria 1-1 Morocco (Pen 4-5)").
        2. Determine the WINNING OUTCOME for each market.
        3. If you cannot determine the winner (e.g. data missing), use "VOID".

        Format:
        Return ONLY valid JSON:
        {
            "matchParams": "Final Score or Summary",
            "results": [
                { "marketName": "Match Winner", "winningOutcome": "Away Win" },
                { "marketName": "Total Goals", "winningOutcome": "Under 2.5" }
            ]
        }
      `;

      const response = await fetch(EXTERNAL_URLS.OPENROUTER_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': EXTERNAL_URLS.APP_URL,
          'X-Title': 'Betting Engine Oracle',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'xiaomi/mimo-v2-flash:free',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API Error: ${response.statusText}`);
      }

      const data = (await response.json()) as OpenRouterResponse;
      const cleanContent = data.choices?.[0]?.message?.content
        ?.replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(cleanContent || '{}') as SettlementResult;
      return parsed;
    } catch (error) {
      this.logger.error('Failed to settle markets via LLM', error);
      return { matchParams: 'Error', results: [] };
    }
  }

  private mockMarkets(matchData: MatchData): MarketData[] {
    return [
      {
        name: 'Match Winner',
        outcomes: [matchData.homeTeam, 'Draw', matchData.awayTeam],
      },
    ];
  }
}

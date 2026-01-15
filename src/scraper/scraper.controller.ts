import { Controller, Get, Query } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { OracleService } from './oracle.service';

@Controller('scraper')
export class ScraperController {
  constructor(
    private readonly scraperService: ScraperService,
    private readonly oracleService: OracleService,
  ) {}

  @Get('ingest-all')
  async ingestAll() {
    return this.scraperService.scrapeAllSports();
  }

  @Get('ingest')
  async ingest(@Query('sport') sport?: string) {
    return this.scraperService.inspectFlashscoreSelectors(sport);
  }

  @Get('test-oracle')
  async testOracle(@Query('home') home: string, @Query('away') away: string) {
    return this.oracleService.getConsensusResult(home, away);
  }
}

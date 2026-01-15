import { Controller, Get, Query } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Get('ingest-all')
  async ingestAll() {
    return this.scraperService.scrapeAllSports();
  }

  @Get('ingest')
  async ingest(@Query('sport') sport?: string) {
    return this.scraperService.inspectFlashscoreSelectors(sport);
  }
}

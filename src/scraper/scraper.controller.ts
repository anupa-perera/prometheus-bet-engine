import { Controller, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Get('test')
  async testScrape() {
    return this.scraperService.inspectFlashscoreSelectors();
  }
}

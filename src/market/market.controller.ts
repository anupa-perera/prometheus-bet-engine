import { Controller, Get, Query } from '@nestjs/common';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('upcoming')
  async getUpcoming(@Query('sport') sport?: string) {
    return this.marketService.getUpcomingEvents(sport);
  }

  @Get('live')
  async getLive(@Query('sport') sport?: string) {
    return this.marketService.getLiveEvents(sport);
  }

  @Get('results')
  async getResults(@Query('sport') sport?: string) {
    return this.marketService.getFinishedEvents(sport);
  }
}

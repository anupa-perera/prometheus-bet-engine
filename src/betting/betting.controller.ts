import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { BettingService } from './betting.service';

@Controller('betting')
export class BettingController {
  constructor(private readonly bettingService: BettingService) {}

  @Post('place')
  async placeBet(
    @Body()
    body: {
      userId: string;
      marketId: string;
      outcome: string;
      stake: number;
    },
  ) {
    return this.bettingService.placeBet(
      body.userId,
      body.marketId,
      body.outcome,
      body.stake,
    );
  }

  @Get('history/:userId')
  async getHistory(@Param('userId') userId: string) {
    return this.bettingService.getUserBets(userId);
  }
}

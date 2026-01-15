import { Module } from '@nestjs/common';
import { MarketService } from './market.service';

import { PrismaService } from '../prisma.service';
import { ScraperModule } from '../scraper/scraper.module';
import { LlmModule } from '../llm/llm.module';
import { BettingModule } from '../betting/betting.module';

import { MarketController } from './market.controller';

@Module({
  imports: [ScraperModule, LlmModule, BettingModule],
  controllers: [MarketController],
  providers: [MarketService, PrismaService],
})
export class MarketModule {}

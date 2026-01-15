import { Module } from '@nestjs/common';
import { MarketService } from './market.service';

import { PrismaService } from '../prisma.service';
import { ScraperModule } from '../scraper/scraper.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [ScraperModule, LlmModule],
  providers: [MarketService, PrismaService],
})
export class MarketModule {}

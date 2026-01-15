import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { LlmModule } from '../llm/llm.module';
import { PrismaService } from '../prisma.service';
import { OracleService } from './oracle.service';
import { FlashscoreAdapter } from './adapters/flashscore.adapter';
import { SofaScoreAdapter } from './adapters/sofascore.adapter';
import { LiveScoreAdapter } from './adapters/livescore.adapter';
import { BBCAdapter } from './adapters/bbc.adapter';

@Module({
  imports: [LlmModule],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    PrismaService,
    OracleService,
    FlashscoreAdapter,
    SofaScoreAdapter,
    LiveScoreAdapter,
    BBCAdapter,
  ],
  exports: [ScraperService, OracleService],
})
export class ScraperModule {}

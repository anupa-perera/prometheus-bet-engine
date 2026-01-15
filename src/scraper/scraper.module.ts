import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { LlmModule } from '../llm/llm.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [LlmModule],
  controllers: [ScraperController],
  providers: [ScraperService, PrismaService],
  exports: [ScraperService],
})
export class ScraperModule {}

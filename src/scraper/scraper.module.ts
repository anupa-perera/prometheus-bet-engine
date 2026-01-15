import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { PrismaService } from '../prisma.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [ScraperController],
  providers: [ScraperService, PrismaService],
})
export class ScraperModule {}

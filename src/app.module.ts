import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScraperModule } from './scraper/scraper.module';
import { PrismaService } from './prisma.service';
import { LlmModule } from './llm/llm.module';
import { MarketModule } from './market/market.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScraperModule,
    LlmModule,
    MarketModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [PrismaService], // Export so ScraperModule can use it if imported
})
export class AppModule {}

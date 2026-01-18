import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule, CacheInterceptor } from '@nestjs/cache-manager';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScraperModule } from './scraper/scraper.module';
import { PrismaService } from './prisma.service';
import { LlmModule } from './llm/llm.module';
import { MarketModule } from './market/market.module';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { BettingModule } from './betting/betting.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({
      isGlobal: true,
      ttl: 10000, // 10 seconds (in milliseconds for cache-manager v5)
    }),
    ScraperModule,
    LlmModule,
    MarketModule,
    UserModule,
    WalletModule,
    BettingModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
  exports: [PrismaService], // Export so ScraperModule can use it if imported
})
export class AppModule {}

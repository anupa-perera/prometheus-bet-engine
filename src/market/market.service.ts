import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { EVENT_STATUS, MARKET_STATUS } from '../common/constants';
import { ScraperService } from '../scraper/scraper.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private prisma: PrismaService,
    private scraperService: ScraperService,
    private llmService: LlmService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndLockMarkets() {
    this.logger.log('Checking for markets to lock...');
    const now = new Date();

    try {
      // Find all events that are SCHEDULED but have passed their start time
      const eventsToLock = await this.prisma.event.findMany({
        where: {
          status: EVENT_STATUS.SCHEDULED,
          startTime: {
            lte: now,
          },
        },
        include: { markets: true },
      });

      if (eventsToLock.length === 0) {
        return;
      }

      this.logger.log(`Found ${eventsToLock.length} events to lock`);

      for (const event of eventsToLock) {
        await this.prisma.$transaction([
          // 1. Update Event Status
          this.prisma.event.update({
            where: { id: event.id },
            data: { status: EVENT_STATUS.IN_PLAY },
          }),
          // 2. Lock all associated markets
          this.prisma.market.updateMany({
            where: { eventId: event.id, status: MARKET_STATUS.OPEN },
            data: { status: MARKET_STATUS.LOCKED },
          }),
        ]);

        this.logger.log(
          `Locked markets for Event: ${event.homeTeam} vs ${event.awayTeam} (Started at ${event.startTime.toISOString()})`,
        );
      }
    } catch (error) {
      this.logger.error('Error in Market Locking Scheduler', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndResultMarkets() {
    this.logger.log('Checking for markets to result...');

    try {
      // Find IN_PLAY events
      const inPlayEvents = await this.prisma.event.findMany({
        where: { status: EVENT_STATUS.IN_PLAY },
        include: { markets: true },
      });

      for (const event of inPlayEvents) {
        // Check if finished via Scraper
        const resultMatch = await this.scraperService.findMatchResult(
          event.homeTeam,
          event.awayTeam,
        );

        if (
          resultMatch &&
          (resultMatch.startTime.includes('Finished') ||
            resultMatch.startTime.includes('After'))
        ) {
          this.logger.log(
            `Event Finished! Resulting markets for: ${event.homeTeam} vs ${event.awayTeam}`,
          );

          // Ask LLM to Result
          const marketNames = event.markets.map((m) => m.name);
          const settlement = await this.llmService.settleMarkets(
            {
              ...resultMatch,
              homeTeam: event.homeTeam, // Ensure consistent naming
              awayTeam: event.awayTeam,
            },
            marketNames,
          );

          this.logger.log(`Oracle decision: ${JSON.stringify(settlement)}`);

          // Apply Results to DB
          await this.prisma.$transaction(async (tx) => {
            // Update Event to FINISHED
            await tx.event.update({
              where: { id: event.id },
              data: { status: EVENT_STATUS.FINISHED },
            });

            // Update Markets
            for (const res of settlement.results) {
              const market = event.markets.find(
                (m) => m.name === res.marketName,
              );
              if (market) {
                await tx.market.update({
                  where: { id: market.id },
                  data: {
                    status: MARKET_STATUS.RESULTED,
                    winningOutcome: res.winningOutcome,
                  },
                });
              }
            }
          });

          this.logger.log('Markets Resulted Successfully.');
        }
      }
    } catch (error) {
      this.logger.error('Error in Resulting Scheduler', error);
    }
  }
}

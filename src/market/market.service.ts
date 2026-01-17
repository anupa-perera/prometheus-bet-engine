import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { EVENT_STATUS, MARKET_STATUS } from '../common/constants';
import { OracleService } from '../scraper/oracle.service';
import { LlmService } from '../llm/llm.service';
import { chromium, Browser } from 'playwright';

import { BettingService } from '../betting/betting.service';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private prisma: PrismaService,
    private oracleService: OracleService,
    private llmService: LlmService,
    private bettingService: BettingService,
  ) {
    if (!this.prisma)
      console.error('MarketService: PrismaService is UNDEFINED');
    else console.log('MarketService: PrismaService injected');

    if (!this.oracleService)
      console.error('MarketService: OracleService is UNDEFINED');
  }

  private isLocking = false;
  private isResulting = false;

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndLockMarkets() {
    if (this.isLocking) return;
    this.isLocking = true;

    // this.logger.log('Checking for markets to lock...'); // Reduce noise
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
        this.isLocking = false;
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
    } finally {
      this.isLocking = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAndResultMarkets() {
    if (this.isResulting) {
      this.logger.warn('Resulting already in progress. Skipping...');
      return;
    }
    this.isResulting = true;

    this.logger.log('Checking for markets to result...');

    // Browser instance for this batch
    let browser: Browser | undefined;

    try {
      // Find IN_PLAY events OR FINISHED events that have unsettled markets
      // Prisma doesn't support complex cross-relation filtering easily in one go,
      // so we might need to fetch a bit more or used raw query.
      // For now, let's fetch IN_PLAY and FINISHED.
      const candidateEvents = await this.prisma.event.findMany({
        where: {
          status: { in: [EVENT_STATUS.IN_PLAY, EVENT_STATUS.FINISHED] },
        },
        include: { markets: true },
        take: 50, // Limit to avoid processing old finished events forever
        orderBy: { updatedAt: 'desc' }, // Check recently updated ones
      });

      // Filter for events that actually need resulting (have non-resulted markets)
      const eventsToResult = candidateEvents.filter((e) =>
        e.markets.some((m) => m.status !== MARKET_STATUS.RESULTED),
      );

      if (eventsToResult.length > 0) {
        browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
      }

      for (const event of eventsToResult) {
        // Check if finished via Consensus Oracle
        const resultMatch = await this.oracleService.getConsensusResult(
          event.homeTeam,
          event.awayTeam,
          browser,
        );

        if (resultMatch && resultMatch.status === 'FINISHED') {
          this.logger.log(
            `Event Finished! Resulting markets for: ${event.homeTeam} vs ${event.awayTeam}`,
          );

          // Ask LLM to Result
          const marketNames = event.markets.map((m) => m.name);
          const settlement = await this.llmService.settleMarkets(
            {
              ...resultMatch,
              homeTeam: event.homeTeam,
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

          // Execute Settlements (Post-Transaction)
          for (const res of settlement.results) {
            const market = event.markets.find((m) => m.name === res.marketName);
            if (market) {
              try {
                await this.bettingService.settleMarket(
                  market.id,
                  res.winningOutcome,
                );
              } catch (e) {
                this.logger.error(
                  `Failed to settle bets for market ${market.id}`,
                  e,
                );
              }
            }
          }

          this.logger.log('Markets Resulted Successfully.');
        }
      }
    } catch (error) {
      this.logger.error('Error in Resulting Scheduler', error);
    } finally {
      if (browser) await browser.close();
      this.isResulting = false;
    }
  }
  async getUpcomingEvents(sport?: string) {
    return this.prisma.event.findMany({
      where: {
        status: { in: [EVENT_STATUS.SCHEDULED, EVENT_STATUS.IN_PLAY] },
        sport: sport === 'all' ? undefined : sport,
      },
      include: { markets: true },
      orderBy: { startTime: 'asc' },
    });
  }

  async getFinishedEvents(sport?: string) {
    return this.prisma.event.findMany({
      where: {
        status: EVENT_STATUS.FINISHED,
        sport: sport === 'all' ? undefined : sport,
      },
      include: { markets: true },
      orderBy: { startTime: 'desc' },
      take: 50,
    });
  }
}

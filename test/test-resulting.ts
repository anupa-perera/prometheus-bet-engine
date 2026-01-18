// Test script to verify Market Service Resulting Logic
// Run with: npx tsx test/test-resulting.ts

import { MarketService } from '../src/market/market.service';
import { OracleService } from '../src/scraper/oracle.service';
import { FlashscoreAdapter } from '../src/scraper/adapters/flashscore.adapter';
import { SofaScoreAdapter } from '../src/scraper/adapters/sofascore.adapter';
import { LiveScoreAdapter } from '../src/scraper/adapters/livescore.adapter';
import { BBCAdapter } from '../src/scraper/adapters/bbc.adapter';
import { LlmService } from '../src/llm/llm.service';
import { BettingService } from '../src/betting/betting.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { WalletModule } from '../src/wallet/wallet.module';
import { MarketModule } from '../src/market/market.module';
import { EventEmitter2 } from '@nestjs/event-emitter';

async function testResulting() {
  console.log('Initializing Test Module...');

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      MarketModule,
      WalletModule, // Helper for betting
    ],
    providers: [
      // MarketService is exported by MarketModule
    ],
  }).compile();

  const prisma = moduleRef.get<PrismaService>(PrismaService);

  // Manually get adapters
  const flashscore = moduleRef.get<FlashscoreAdapter>(FlashscoreAdapter);
  const sofascore = moduleRef.get<SofaScoreAdapter>(SofaScoreAdapter);
  const livescore = moduleRef.get<LiveScoreAdapter>(LiveScoreAdapter);
  const bbc = moduleRef.get<BBCAdapter>(BBCAdapter);

  console.log('Manually Instantiating OracleService...');
  const oracleService = new OracleService(
    flashscore,
    sofascore,
    livescore,
    bbc,
  );

  const llmService = moduleRef.get<LlmService>(LlmService);
  const bettingService = moduleRef.get<BettingService>(BettingService);

  // ... (existing imports)

  console.log('Manually Instantiating MarketService...');
  // Mock EventEmitter
  const mockEmitter = { emit: () => true } as unknown as EventEmitter2;

  const marketService = new MarketService(
    prisma,
    oracleService,
    llmService,
    bettingService,
    mockEmitter,
  );

  console.log('Creating Mock Event that is "Finished" but not Resulted...');

  // Clean up old test data
  try {
    const existing = await prisma.event.findUnique({
      where: { externalId: 'test-result-event-1' },
      include: { markets: true },
    });
    if (existing) {
      await prisma.bet.deleteMany({
        where: { marketId: { in: existing.markets.map((m) => m.id) } },
      }); // Clear bets if any
      await prisma.market.deleteMany({ where: { eventId: existing.id } }); // Clear markets
      await prisma.event.delete({ where: { id: existing.id } }); // Clear event
    }
  } catch (e) {
    console.warn('Cleanup warning:', e);
  }

  const startTime = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago

  const event = await prisma.event.create({
    data: {
      externalId: 'test-result-event-1',
      homeTeam: 'Monaco', // Use real team to help scraper find it easily (or fail cleanly)
      awayTeam: 'Lorient',
      startTime: startTime,
      projectedEnd: new Date(Date.now() - 1 * 60 * 60 * 1000),
      status: 'FINISHED', // Already marked Finished in DB
      sport: 'football',
      markets: {
        create: [
          { name: 'Match Winner', status: 'OPEN' }, // Needs resulting
          { name: 'Total Goals', status: 'OPEN' },
        ],
      },
    },
    include: { markets: true },
  });

  console.log(`Created Event: ${event.id} (Monaco vs Lorient)`);
  console.log(
    `Markets: ${event.markets.map((m) => m.name + ':' + m.status).join(', ')}`,
  );

  console.log('Triggering checkAndResultMarkets()...');

  // Create a spy logger to see what happens
  // We can't easily spy on internal logger without more effort, so we rely on console out

  try {
    await marketService.checkAndResultMarkets();
  } catch (e) {
    console.error('Error during resulting:', e);
  }

  // Check Database
  const updatedEvent = await prisma.event.findUnique({
    where: { id: event.id },
    include: { markets: true },
  });

  console.log('--- Post-Test Status ---');
  console.log(`Event Status: ${updatedEvent?.status}`);
  updatedEvent?.markets.forEach((m) => {
    console.log(
      `Market [${m.name}]: ${m.status} (Winner: ${m.winningOutcome})`,
    );
  });

  if (updatedEvent?.markets.every((m) => m.status === 'RESULTED')) {
    console.log('SUCCESS: All markets resulted.');
  } else {
    console.log('PARTIAL/FAIL: Some markets still OPEN.');
  }

  // Final Cleanup
  try {
    await prisma.bet.deleteMany({
      where: { marketId: { in: event.markets.map((m) => m.id) } },
    });
    await prisma.market.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
  } catch (e) {
    console.warn('Final cleanup error:', e);
  }
  await prisma.$disconnect();
}

testResulting().catch((e) => {
  console.error(e);
  process.exit(1);
});

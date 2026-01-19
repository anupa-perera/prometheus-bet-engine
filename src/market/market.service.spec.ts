/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { MarketService } from './market.service';
import { PrismaService } from '../prisma.service';
import { OracleService } from '../scraper/oracle.service';
import { LlmService } from '../llm/llm.service';
import { BettingService } from '../betting/betting.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENT_STATUS } from '../common/constants';

describe('MarketService', () => {
  let service: MarketService;
  let prismaService: any;

  const mockPrismaService: any = {
    event: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    market: {
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: any) => Promise<any>) =>
      callback(mockPrismaService),
    ),
  };

  const mockOracleService = {
    getConsensusResult: jest.fn(),
  };

  const mockLlmService = {
    settleMarkets: jest.fn(),
  };

  const mockBettingService = {
    settleMarket: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OracleService, useValue: mockOracleService },
        { provide: LlmService, useValue: mockLlmService },
        { provide: BettingService, useValue: mockBettingService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<MarketService>(MarketService);
    prismaService = module.get<PrismaService>(PrismaService);
    // eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkFrozenLiveEvents', () => {
    it('should move frozen IN_PLAY events to AWAITING_RESULTS', async () => {
      // Arrange
      const now = new Date();
      const frozenEvent = {
        id: '1',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        status: EVENT_STATUS.IN_PLAY,
        projectedEnd: new Date(now.getTime() - 10000), // Ended 10s ago
      };

      prismaService.event.findMany.mockResolvedValue([frozenEvent]);
      prismaService.event.update.mockResolvedValue(frozenEvent);

      // Act
      await service.checkFrozenLiveEvents();

      // Assert
      expect(prismaService.event.findMany).toHaveBeenCalledWith({
        where: {
          status: EVENT_STATUS.IN_PLAY,
          projectedEnd: { lte: expect.any(Date) },
        },
      });

      expect(prismaService.event.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { status: EVENT_STATUS.AWAITING_RESULTS },
      });
    });

    it('should do nothing if no events are frozen', async () => {
      prismaService.event.findMany.mockResolvedValue([]);
      await service.checkFrozenLiveEvents();
      expect(prismaService.event.update).not.toHaveBeenCalled();
    });
  });

  describe('getLiveEvents', () => {
    it('should fetch IN_PLAY events sorted by startTime DESC', async () => {
      // Act
      await service.getLiveEvents('football');

      // Assert
      expect(prismaService.event.findMany).toHaveBeenCalledWith({
        where: {
          status: EVENT_STATUS.IN_PLAY,
          sport: 'football',
        },
        include: { markets: true },
        orderBy: { startTime: 'desc' },
      });
    });
  });

  describe('getUpcomingEvents', () => {
    it('should fetch only SCHEDULED events', async () => {
      // Act
      await service.getUpcomingEvents();

      // Assert
      expect(prismaService.event.findMany).toHaveBeenCalledWith({
        where: {
          status: EVENT_STATUS.SCHEDULED,
          sport: undefined,
        },
        include: { markets: true },
        orderBy: { startTime: 'asc' },
      });
    });
  });
});

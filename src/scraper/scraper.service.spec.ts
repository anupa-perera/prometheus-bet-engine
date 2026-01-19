import { Test, TestingModule } from '@nestjs/testing';
import { ScraperService } from './scraper.service';
import { PrismaService } from '../prisma.service';
import { LlmService } from '../llm/llm.service';
import { BettingService } from '../betting/betting.service';

import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ScraperService', () => {
  let service: ScraperService;

  const mockPrismaService = {};
  const mockLlmService = {};
  const mockBettingService = {};
  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LlmService, useValue: mockLlmService },
        { provide: BettingService, useValue: mockBettingService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('determineStatus', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-call */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    it('should identify Finished games as AWAITING_RESULTS', () => {
      const determine = (service as any).determineStatus.bind(service);
      expect(determine('Finished')).toBe('AWAITING_RESULTS');
      expect(determine('FT')).toBe('AWAITING_RESULTS');
      expect(determine('After Pens')).toBe('AWAITING_RESULTS');
      expect(determine('AET')).toBe('AWAITING_RESULTS');
    });

    it('should identify Scheduled games', () => {
      const determine = (service as any).determineStatus.bind(service);
      expect(determine('14:00')).toBe('SCHEDULED');
      expect(determine('23:45')).toBe('SCHEDULED');
      expect(determine('Today, 14:00')).toBe('SCHEDULED');
    });

    it('should identify In Play games', () => {
      const determine = (service as any).determineStatus.bind(service);
      expect(determine('Live')).toBe('IN_PLAY');
      expect(determine("34'")).toBe('IN_PLAY');
      expect(determine('2-1')).toBe('IN_PLAY'); // Score usually implies live if not finished
      expect(determine('Half Time')).toBe('IN_PLAY');
    });

    it('should identify Postponed/Cancelled as AWAITING_RESULTS', () => {
      const determine = (service as any).determineStatus.bind(service);
      expect(determine('Postponed')).toBe('AWAITING_RESULTS');
      expect(determine('Canceled')).toBe('AWAITING_RESULTS');
      expect(determine('Cancelled')).toBe('AWAITING_RESULTS');
    });
    /* eslint-enable */
  });
});

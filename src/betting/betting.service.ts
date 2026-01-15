import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { MARKET_STATUS } from '../common/constants';

@Injectable()
export class BettingService {
  private readonly logger = new Logger(BettingService.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  async placeBet(
    userId: string,
    marketId: string,
    outcome: string,
    stake: number,
  ) {
    if (stake <= 0) {
      throw new BadRequestException('Stake must be positive');
    }

    // 1. Validate Market
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
    });
    if (!market) {
      throw new NotFoundException('Market not found');
    }
    if (market.status !== MARKET_STATUS.OPEN) {
      throw new ConflictException('Market is not open for betting');
    }

    // 2. Transaction: Withdraw stake & Create Bet
    return this.prisma.$transaction(async (tx) => {
      // Check Balance (Optimistic, reused logic from WalletService but inside this tx)
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < stake) {
        throw new BadRequestException('Insufficient funds');
      }

      // Deduct
      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: stake } },
      });

      // Create Bet
      const bet = await tx.bet.create({
        data: {
          userId,
          marketId,
          outcome,
          stake,
          status: 'PENDING',
        },
      });

      this.logger.log(
        `User ${userId} placed bet ${bet.id} on ${outcome} for ${stake}`,
      );
      return bet;
    });
  }

  async getUserBets(userId: string) {
    return this.prisma.bet.findMany({
      where: { userId },
      include: { market: { include: { event: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Called when Market is Resulted
  async settleMarket(marketId: string, winningOutcome: string) {
    this.logger.log(
      `Settling bets for market ${marketId}. Winner: ${winningOutcome}`,
    );

    // Fetch all bets for this market
    const bets = await this.prisma.bet.findMany({
      where: { marketId, status: 'PENDING' },
    });

    if (bets.length === 0) return;

    // Calculate Pool
    const totalPool = bets.reduce((sum, bet) => sum + bet.stake, 0);
    const winningBets = bets.filter((b) => b.outcome === winningOutcome);
    const winningPool = winningBets.reduce((sum, bet) => sum + bet.stake, 0);
    const losingPool = totalPool - winningPool;

    // Transaction to update all bets and wallets
    await this.prisma.$transaction(async (tx) => {
      // 1. Process Losers
      await tx.bet.updateMany({
        where: {
          marketId,
          outcome: { not: winningOutcome },
          status: 'PENDING',
        },
        data: { status: 'LOST', payout: 0 },
      });

      // 2. Process Winners
      for (const winner of winningBets) {
        // Payout = Stake + (Share of Losing Pool)
        // Share = (MyStake / TotalWinningStake) * LosingPool
        let payout = 0;
        if (winningPool > 0) {
          const share = (winner.stake / winningPool) * losingPool;
          payout = winner.stake + share;
        } else {
          // Edge case: Should not happen if winningBets > 0
          payout = winner.stake; // Refund? Or logic error.
        }

        // Update Bet
        await tx.bet.update({
          where: { id: winner.id },
          data: { status: 'WON', payout },
        });

        // Credit Wallet
        await tx.wallet.update({
          where: { userId: winner.userId },
          data: { balance: { increment: payout } },
        });

        this.logger.log(`Bet ${winner.id} WON. Payout: ${payout.toFixed(2)}`);
      }
    });
  }
}

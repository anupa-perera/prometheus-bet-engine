import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Wallet } from '@prisma/client';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string): Promise<Wallet> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async deposit(userId: string, amount: number): Promise<Wallet> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const wallet = await this.prisma.wallet.update({
      where: { userId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });

    this.logger.log(
      `User ${userId} deposited ${amount}. New Balance: ${wallet.balance}`,
    );
    return wallet;
  }

  async withdraw(userId: string, amount: number): Promise<Wallet> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    // Transaction to ensure balance doesn't go negative race-condition-safe(ish)
    // Actually Prisma atomic decrement handles the race, but we need to check sufficiency first.
    // Or we can rely on a check constraint (which SQLite might not enforce strictly, but let's do app check).

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      if (wallet.balance < amount) {
        throw new BadRequestException('Insufficient funds');
      }

      const updated = await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      this.logger.log(
        `User ${userId} withdrew ${amount}. New Balance: ${updated.balance}`,
      );
      return updated;
    });
  }
}

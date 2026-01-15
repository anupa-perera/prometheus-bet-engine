import { Module } from '@nestjs/common';
import { BettingService } from './betting.service';
import { BettingController } from './betting.controller';
import { PrismaService } from '../prisma.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [BettingController],
  providers: [BettingService, PrismaService],
  exports: [BettingService],
})
export class BettingModule {}

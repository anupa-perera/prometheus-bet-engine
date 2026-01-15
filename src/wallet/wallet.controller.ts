import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':userId')
  async getBalance(@Param('userId') userId: string) {
    return this.walletService.getBalance(userId);
  }

  @Post('deposit')
  async deposit(@Body() body: { userId: string; amount: number }) {
    return this.walletService.deposit(body.userId, body.amount);
  }

  @Post('withdraw')
  async withdraw(@Body() body: { userId: string; amount: number }) {
    return this.walletService.withdraw(body.userId, body.amount);
  }
}

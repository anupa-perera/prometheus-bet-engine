import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  async register(
    @Body() body: { username: string; email: string; password: string },
  ) {
    return this.userService.register(body.username, body.email, body.password);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.userService.login(body.email, body.password);
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.findById(id);
  }
}

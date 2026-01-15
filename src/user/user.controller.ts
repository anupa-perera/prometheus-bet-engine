import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { UserService } from './user.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserDto } from './dto/user-response.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  async register(@Body() dto: RegisterUserDto): Promise<AuthResponseDto> {
    return this.userService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginUserDto): Promise<AuthResponseDto> {
    return this.userService.login(dto);
  }

  @Get(':id')
  async getUser(@Param('id') id: string): Promise<UserDto | null> {
    return this.userService.findById(id);
  }
}

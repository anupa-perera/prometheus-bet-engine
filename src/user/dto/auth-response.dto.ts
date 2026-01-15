import { UserDto } from './user-response.dto';

export class AuthResponseDto {
  user: UserDto;
  accessToken: string;
}

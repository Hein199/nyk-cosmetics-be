import { IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsString()
  salesperson_name?: string;

  @IsOptional()
  @IsNumberString()
  monthly_target?: string;
}

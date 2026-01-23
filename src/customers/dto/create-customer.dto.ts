import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CustomerStatus } from '@prisma/client';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEnum(CustomerStatus)
  status: CustomerStatus;
}

import { IsEnum, IsNotEmpty, IsNumberString, IsString } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumberString()
  amount: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsEnum(PaymentType)
  payment_method: PaymentType;
}

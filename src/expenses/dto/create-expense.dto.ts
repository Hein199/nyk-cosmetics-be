import { IsDateString, IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class CreateExpenseDto {
  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumberString()
  amount: string;

  @IsEnum(PaymentType)
  payment_method: PaymentType;

  @IsDateString()
  @IsOptional()
  expense_date?: string;
}

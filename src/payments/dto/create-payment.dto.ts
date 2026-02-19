import { IsEnum, IsInt, IsNumberString, IsOptional, IsPositive } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class CreatePaymentDto {
  @IsInt()
  @IsPositive()
  customer_id: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  order_id?: number;

  @IsNumberString()
  amount_paid: string;

  @IsEnum(PaymentType)
  payment_type: PaymentType;
}

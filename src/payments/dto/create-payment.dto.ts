import { IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  customer_id: string;

  @IsOptional()
  @IsString()
  order_id?: string;

  @IsNumberString()
  amount_paid: string;

  @IsEnum(PaymentType)
  payment_type: PaymentType;
}

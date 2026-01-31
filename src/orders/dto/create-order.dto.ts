import { Type } from 'class-transformer';
import { ArrayMinSize, IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PaymentType } from '@prisma/client';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  customer_id: string;

  @IsOptional()
  @IsISO8601()
  order_date?: string;

  @IsOptional()
  @IsEnum(PaymentType)
  payment_type?: PaymentType;

  @IsOptional()
  @IsString()
  remark?: string;

  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @ArrayMinSize(1)
  items: CreateOrderItemDto[];
}

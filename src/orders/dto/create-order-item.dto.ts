import { IsInt, IsNumberString, IsOptional, IsPositive, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsInt()
  @IsPositive()
  product_id: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumberString()
  unit_price?: string;
}

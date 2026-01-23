import { IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  product_id: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumberString()
  unit_price?: string;
}

import { IsBoolean, IsEnum, IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';
import { StockEvent } from '@prisma/client';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumberString()
  unit_price?: string;

  @IsOptional()
  @IsNumberString()
  custom_price_min?: string;

  @IsOptional()
  @IsNumberString()
  custom_price_max?: string;

  @IsOptional()
  @IsNumberString()
  last_purchase_price?: string | null;

  @IsOptional()
  @IsNumberString()
  stockQuantity?: string;

  @IsOptional()
  @IsIn(['PCS', 'BOX'])
  stockUnit?: string;

  @IsOptional()
  @IsEnum(StockEvent)
  stockEvent?: StockEvent;

  @IsOptional()
  @IsString()
  stockSource?: string;

  @IsOptional()
  @IsNumberString()
  pcs_per_dozen?: string;

  @IsOptional()
  @IsNumberString()
  pcs_per_box?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

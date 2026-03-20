import { IsBoolean, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsNumberString()
  unit_price: string;

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
  @IsNumberString()
  pcs_per_dozen?: string;

  @IsOptional()
  @IsNumberString()
  pcs_per_box?: string;

  @IsString()
  @IsNotEmpty()
  photo_url: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

import { IsBoolean, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { ProductCategory } from '@prisma/client';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsNumberString()
  unit_price?: string;

  @IsOptional()
  @IsNumberString()
  pcs_per_dozen?: string;

  @IsOptional()
  @IsNumberString()
  pcs_per_pack?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

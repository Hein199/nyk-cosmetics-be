import { IsBoolean, IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';
import { ProductCategory } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(ProductCategory)
  category: ProductCategory;

  @IsNumberString()
  unit_price: string;

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

import { IsBoolean, IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

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

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

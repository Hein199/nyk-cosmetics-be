import { IsBoolean, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  category: string;

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

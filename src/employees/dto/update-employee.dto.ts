import { IsDateString, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class UpdateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsNumberString()
  @IsOptional()
  basic_salary?: string;

  @IsDateString()
  @IsOptional()
  start_date?: string;

  @IsString()
  @IsOptional()
  remark?: string;
}

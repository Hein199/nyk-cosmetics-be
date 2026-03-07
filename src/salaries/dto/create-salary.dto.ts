import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

export class BonusItemDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsNumberString()
  amount: string;
}

export class CreateSalaryDto {
  @IsInt()
  @IsPositive()
  employee_id: number;

  @IsString()
  @IsNotEmpty()
  salary_month: string; // e.g. "2026-03"

  @IsNumberString()
  basic_salary: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusItemDto)
  bonuses?: BonusItemDto[];

  @IsDateString()
  payment_date: string;

  @IsOptional()
  @IsString()
  remark?: string;
}


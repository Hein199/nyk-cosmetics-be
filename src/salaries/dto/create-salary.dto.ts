import { IsInt, IsNumberString, IsOptional, IsPositive } from 'class-validator';

export class CreateSalaryDto {
  @IsInt()
  @IsPositive()
  employee_id: number;

  @IsNumberString()
  basic_salary: string;

  @IsOptional()
  @IsNumberString()
  bonus_amount?: string;

  @IsOptional()
  @IsNumberString()
  deduction_amount?: string;
}

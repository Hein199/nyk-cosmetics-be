import { IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateSalaryDto {
  @IsString()
  @IsNotEmpty()
  employee_id: string;

  @IsNumberString()
  basic_salary: string;

  @IsOptional()
  @IsNumberString()
  bonus_amount?: string;

  @IsOptional()
  @IsNumberString()
  deduction_amount?: string;
}

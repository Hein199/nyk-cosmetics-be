import { IsNotEmpty, IsNumberString, IsString } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumberString()
  basic_salary: string;
}

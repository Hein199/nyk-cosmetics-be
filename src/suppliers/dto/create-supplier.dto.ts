import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSupplierDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    phone_number: string;

    @IsString()
    @IsNotEmpty()
    address: string;
}

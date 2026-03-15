import { IsIn, IsInt, IsNumberString, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreatePurchaseItemDto {
    @IsInt()
    @IsPositive()
    product_id: number;

    @IsInt()
    @Min(1)
    quantity: number;

    @IsOptional()
    @IsString()
    @IsIn(['Pcs', 'D', 'P'])
    unit_type?: string;

    @IsNumberString()
    unit_price: string;
}

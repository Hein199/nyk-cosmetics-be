import { Type } from 'class-transformer';
import { PaymentType } from '@prisma/client';
import { ArrayMinSize, IsEnum, IsISO8601, IsInt, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { CreatePurchaseItemDto } from './create-purchase-item.dto';

export class CreatePurchaseDto {
    @IsInt()
    @IsPositive()
    supplier_id: number;

    @IsOptional()
    @IsISO8601()
    purchase_date?: string;

    @IsOptional()
    @IsEnum(PaymentType)
    payment_method?: PaymentType;

    @IsOptional()
    @IsString()
    description?: string;

    @ValidateNested({ each: true })
    @Type(() => CreatePurchaseItemDto)
    @ArrayMinSize(1)
    items: CreatePurchaseItemDto[];
}

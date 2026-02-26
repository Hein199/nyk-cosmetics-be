import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsNumberString, IsOptional, IsPositive, Min, ValidateNested } from 'class-validator';

export class UpdateOrderItemEntryDto {
    @IsInt()
    @IsPositive()
    id: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    quantity?: number;

    @IsOptional()
    @IsNumberString()
    unit_price?: string;
}

export class UpdateOrderItemsDto {
    @ValidateNested({ each: true })
    @Type(() => UpdateOrderItemEntryDto)
    @ArrayMinSize(1)
    items: UpdateOrderItemEntryDto[];
}

import { Type } from 'class-transformer';
import { ArrayMinSize, IsIn, IsInt, IsOptional, IsPositive, Matches, Min, ValidateNested } from 'class-validator';

export class UpdateOrderItemEntryDto {
    @IsInt()
    @IsPositive()
    id: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    quantity?: number;

    @IsOptional()
    @Matches(/^(0|[1-9]\d*)(\.\d+)?$/)
    unit_price?: string;

    @IsOptional()
    @IsIn(['Pcs', 'D', 'P'])
    unit_type?: string;
}

export class UpdateOrderItemsDto {
    @ValidateNested({ each: true })
    @Type(() => UpdateOrderItemEntryDto)
    @ArrayMinSize(1)
    items: UpdateOrderItemEntryDto[];
}

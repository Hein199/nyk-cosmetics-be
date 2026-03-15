import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { StockEvent } from '@prisma/client';

export class UpdateInventoryDto {
  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsEnum(StockEvent)
  event?: StockEvent;

  @IsOptional()
  @IsString()
  source?: string;
}

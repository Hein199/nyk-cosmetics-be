import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PurchaseItemsService } from './purchase-items.service';

@ApiTags('purchase-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-items')
export class PurchaseItemsController {
    constructor(private readonly purchaseItemsService: PurchaseItemsService) { }

    @Get('product/:productId')
    @Roles(Role.ADMIN)
    findByProduct(
        @Param('productId', ParseIntPipe) productId: number,
        @Query('limit') limit?: string,
    ) {
        const parsedLimit = limit ? Number(limit) : undefined;
        return this.purchaseItemsService.findByProduct(productId, parsedLimit);
    }
}

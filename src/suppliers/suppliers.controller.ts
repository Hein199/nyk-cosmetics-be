import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
    constructor(private readonly suppliersService: SuppliersService) { }

    @Get()
    @Roles(Role.ADMIN)
    findAll() {
        return this.suppliersService.findAll();
    }

    @Get(':id')
    @Roles(Role.ADMIN)
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.suppliersService.findOne(id);
    }

    @Get(':id/purchases')
    @Roles(Role.ADMIN)
    findPurchases(@Param('id', ParseIntPipe) id: number) {
        return this.suppliersService.findPurchases(id);
    }

    @Get(':id/purchases/:expenseId')
    @Roles(Role.ADMIN)
    findPurchaseDetail(
        @Param('id', ParseIntPipe) id: number,
        @Param('expenseId', ParseIntPipe) expenseId: number,
    ) {
        return this.suppliersService.findPurchaseDetail(id, expenseId);
    }

    @Post()
    @Roles(Role.ADMIN)
    create(@Body() dto: CreateSupplierDto) {
        return this.suppliersService.create(dto);
    }

    @Patch(':id')
    @Roles(Role.ADMIN)
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) {
        return this.suppliersService.update(id, dto);
    }

    @Delete(':id')
    @Roles(Role.ADMIN)
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.suppliersService.remove(id);
    }
}

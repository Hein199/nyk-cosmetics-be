import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('stats')
    @Roles(Role.ADMIN)
    getStats() {
        return this.dashboardService.getAdminStats();
    }

    @Get('sales-chart')
    @Roles(Role.ADMIN)
    @ApiQuery({ name: 'mode', enum: ['daily', 'monthly'], required: false })
    getSalesChart(@Query('mode') mode: 'daily' | 'monthly' = 'daily') {
        return this.dashboardService.getSalesChart(mode);
    }

    @Get('top-products')
    @Roles(Role.ADMIN)
    @ApiQuery({ name: 'mode', enum: ['daily', 'monthly'], required: false })
    @ApiQuery({ name: 'metric', enum: ['revenue', 'qty'], required: false })
    getTopProducts(
        @Query('mode') mode: 'daily' | 'monthly' = 'daily',
        @Query('metric') metric: 'revenue' | 'qty' = 'revenue',
    ) {
        return this.dashboardService.getTopProducts(mode, metric);
    }

    @Get('salesperson-performance')
    @Roles(Role.ADMIN)
    getSalespersonPerformance() {
        return this.dashboardService.getSalespersonPerformance();
    }

    @Get('cash-flow')
    @Roles(Role.ADMIN)
    getCashFlow() {
        return this.dashboardService.getCashFlow();
    }
}

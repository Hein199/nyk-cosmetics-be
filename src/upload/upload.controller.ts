import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UploadService } from './upload.service';

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('upload')
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    @Get('presign')
    @Roles(Role.ADMIN)
    @ApiQuery({ name: 'filename', required: true })
    @ApiQuery({ name: 'contentType', required: true })
    getPresignedUrl(
        @Query('filename') filename: string,
        @Query('contentType') contentType: string,
    ) {
        return this.uploadService.getPresignedUploadUrl(filename, contentType);
    }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(PrismaClientExceptionFilter.name);

    catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<{ method?: string }>();
        const response = ctx.getResponse();
        const method = (request.method ?? '').toUpperCase();

        if (exception.code === 'P2003') {
            const deleteMessage = 'Cannot delete this record because it is referenced by other data.';
            const defaultMessage = 'Operation violates relational constraints.';

            response.status(HttpStatus.BAD_REQUEST).json({
                statusCode: HttpStatus.BAD_REQUEST,
                message: method === 'DELETE' ? deleteMessage : defaultMessage,
                error: 'Bad Request',
            });
            return;
        }

        if (exception.code === 'P2025') {
            response.status(HttpStatus.NOT_FOUND).json({
                statusCode: HttpStatus.NOT_FOUND,
                message: 'Record not found.',
                error: 'Not Found',
            });
            return;
        }

        this.logger.error(`Unhandled Prisma error ${exception.code}`, exception.stack);
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Unexpected database error.',
            error: 'Internal Server Error',
        });
    }
}
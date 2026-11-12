import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

/** One error shape for every endpoint; unexpected errors never leak details. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Something went wrong.';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      // Nest's "Cannot GET /x?lat=…" would echo the query string (it can hold a location): drop it
      if (typeof message === 'string' && message.startsWith('Cannot ')) message = message.split('?')[0];
    } else {
      console.error(exception); // the real cause stays in the server log
    }

    response.status(statusCode).json({
      statusCode,
      message,
      path: request.originalUrl.split('?')[0], // never echo ?lat=…
      timestamp: new Date().toISOString(),
    });
  }
}

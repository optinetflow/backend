import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    console.info('Before...');

    const start = Date.now();

    return next.handle().pipe(tap(() => console.info(`Response time: ${Date.now() - start}ms`)));
  }
}

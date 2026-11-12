import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // rawBody: keep the exact bytes of each request; webhook signatures are checked over them
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3002' });
  app.enableShutdownHooks(); // lets RedisModule close its connection on Ctrl+C

  const port = Number(process.env.PORT ?? 3200);
  await app.listen(port);
  console.log(`QuickPlate API on http://localhost:${port}/api/v1`);
}

bootstrap().catch((err: unknown) => {
  console.error(`Failed to start QuickPlate API: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

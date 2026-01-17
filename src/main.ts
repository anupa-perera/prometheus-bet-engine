import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      //TODO: Add production frontend URL when deployed
    ],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

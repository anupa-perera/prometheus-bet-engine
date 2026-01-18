import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SseController } from './sse.controller';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [SseController],
  exports: [EventEmitterModule],
})
export class EventsModule {}

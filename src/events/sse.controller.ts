/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Controller, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';
import { MessageEvent } from '@nestjs/common';

@Controller('events')
export class SseController {
  constructor(private eventEmitter: EventEmitter2) {}

  @Sse('stream')
  sse(): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'market.update').pipe(
      map((data: any) => ({
        data: data,
      })),
    );
  }
}

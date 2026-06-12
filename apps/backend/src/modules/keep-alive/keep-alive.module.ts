import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KeepAliveService } from './keep-alive.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [KeepAliveService],
})
export class KeepAliveModule {}

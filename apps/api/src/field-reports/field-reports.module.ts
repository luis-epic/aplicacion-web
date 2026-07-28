import { Module } from '@nestjs/common'
import { FieldReportsController } from './field-reports.controller'
import { FieldReportsService } from './field-reports.service'

@Module({
  controllers: [FieldReportsController],
  providers: [FieldReportsService],
})
export class FieldReportsModule {}

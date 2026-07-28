import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ReportStatus } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'
import { PageQueryDto } from '../common/page-query.dto'

export class FieldReportQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  projectId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  authorId?: string

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  @IsOptional()
  status?: ReportStatus
}

export class CreateFieldReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectId!: string

  @ApiProperty({ format: 'date', example: '2026-07-27' })
  @IsDateString({ strict: true })
  reportDate!: string

  @ApiProperty({ minLength: 1, maxLength: 2_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  summary!: string

  @ApiProperty({ minimum: 0, maximum: 10_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  personnelCount!: number

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsString()
  @MaxLength(1_000)
  @IsOptional()
  weatherNotes?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  weatherSnapshot?: Record<string, unknown>

  @ApiPropertyOptional({ maxLength: 4_000 })
  @IsString()
  @MaxLength(4_000)
  @IsOptional()
  incidentNotes?: string

  @ApiProperty({ format: 'date-time', description: 'Marca temporal de la última edición en el cliente.' })
  @IsDateString()
  clientUpdatedAt!: string

  @ApiProperty({ format: 'uuid', description: 'Clave estable para reintentos idempotentes del mismo autor.' })
  @IsUUID('4')
  idempotencyKey!: string
}

export class UpdateFieldReportDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({ strict: true })
  @IsOptional()
  reportDate?: string

  @ApiPropertyOptional({ minLength: 1, maxLength: 2_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  @IsOptional()
  summary?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 10_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  @IsOptional()
  personnelCount?: number

  @ApiPropertyOptional({ maxLength: 1_000, nullable: true })
  @IsString()
  @MaxLength(1_000)
  @IsOptional()
  weatherNotes?: string | null

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @IsObject()
  @IsOptional()
  weatherSnapshot?: Record<string, unknown> | null

  @ApiPropertyOptional({ maxLength: 4_000, nullable: true })
  @IsString()
  @MaxLength(4_000)
  @IsOptional()
  incidentNotes?: string | null

  @ApiProperty({ format: 'date-time', description: 'Marca temporal de la última edición en el cliente.' })
  @IsDateString()
  clientUpdatedAt!: string
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  PublicationAudience,
  PublicationPriority,
  PublicationStatus,
  PublicationType,
  TaskPriority,
  TaskRecurrence,
} from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { PageQueryDto } from '../common/page-query.dto'

export class PublicationFeedQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: PublicationType })
  @IsEnum(PublicationType)
  @IsOptional()
  type?: PublicationType

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  category?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  projectId?: string
}

export class PublicationQueryDto extends PublicationFeedQueryDto {
  @ApiPropertyOptional({ enum: PublicationStatus })
  @IsEnum(PublicationStatus)
  @IsOptional()
  status?: PublicationStatus

  @ApiPropertyOptional({ enum: PublicationAudience })
  @IsEnum(PublicationAudience)
  @IsOptional()
  audience?: PublicationAudience

  @ApiPropertyOptional({ enum: PublicationPriority })
  @IsEnum(PublicationPriority)
  @IsOptional()
  priority?: PublicationPriority

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  authorId?: string
}

export class CreatePublicationDto {
  @ApiProperty({ minLength: 3, maxLength: 180 })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string

  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 180 })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(180)
  slug!: string

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  summary!: string

  @ApiProperty({ minLength: 1, maxLength: 50_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  content!: string

  @ApiPropertyOptional({ format: 'uri', maxLength: 2_000 })
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  @IsOptional()
  coverImageUrl?: string

  @ApiProperty({ enum: PublicationType })
  @IsEnum(PublicationType)
  type!: PublicationType

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string

  @ApiPropertyOptional({ enum: PublicationPriority, default: PublicationPriority.NORMAL })
  @IsEnum(PublicationPriority)
  @IsOptional()
  priority: PublicationPriority = PublicationPriority.NORMAL

  @ApiPropertyOptional({ enum: PublicationAudience, default: PublicationAudience.ALL })
  @IsEnum(PublicationAudience)
  @IsOptional()
  audience: PublicationAudience = PublicationAudience.ALL

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  projectId?: string

  @ApiPropertyOptional({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  audienceRoleCode?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string
}

export class UpdatePublicationDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 180 })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  @IsOptional()
  title?: string

  @ApiPropertyOptional({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 180 })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(180)
  @IsOptional()
  slug?: string

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @IsOptional()
  summary?: string

  @ApiPropertyOptional({ minLength: 1, maxLength: 50_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  @IsOptional()
  content?: string

  @ApiPropertyOptional({ format: 'uri', maxLength: 2_000, nullable: true })
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  @IsOptional()
  coverImageUrl?: string | null

  @ApiPropertyOptional({ enum: PublicationType })
  @IsEnum(PublicationType)
  @IsOptional()
  type?: PublicationType

  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  category?: string

  @ApiPropertyOptional({ enum: PublicationPriority })
  @IsEnum(PublicationPriority)
  @IsOptional()
  priority?: PublicationPriority

  @ApiPropertyOptional({ enum: PublicationAudience })
  @IsEnum(PublicationAudience)
  @IsOptional()
  audience?: PublicationAudience

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID('4')
  @IsOptional()
  projectId?: string | null

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  audienceRoleCode?: string | null

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string | null

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsDateString()
  @IsOptional()
  expiresAt?: string | null
}

export class PublishPublicationDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Omitir para publicar inmediatamente.' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsDateString()
  @IsOptional()
  expiresAt?: string | null
}

export class PublicationAcknowledgementQueryDto extends PageQueryDto {}

export class PublicationTaskDto {
  @ApiProperty({ minLength: 1, maxLength: 180 })
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title!: string

  @ApiPropertyOptional({ maxLength: 10_000 })
  @IsString()
  @MaxLength(10_000)
  @IsOptional()
  description?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Por defecto usa el proyecto de la publicación.' })
  @IsUUID('4')
  @IsOptional()
  projectId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  assigneeId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  supervisorId?: string

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.NORMAL })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority: TaskPriority = TaskPriority.NORMAL

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dueAt?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 100_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  @IsOptional()
  estimatedMinutes?: number

  @ApiPropertyOptional({ enum: TaskRecurrence, default: TaskRecurrence.NONE })
  @IsEnum(TaskRecurrence)
  @IsOptional()
  recurrence: TaskRecurrence = TaskRecurrence.NONE

  @ApiProperty({ format: 'uuid', description: 'Clave estable obligatoria para reintentos idempotentes.' })
  @IsUUID('4')
  idempotencyKey!: string
}

export class GeneratePublicationTasksDto {
  @ApiProperty({ type: [PublicationTaskDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PublicationTaskDto)
  tasks!: PublicationTaskDto[]
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TaskPriority, TaskRecurrence, TaskStatus } from '@prisma/client'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'
import { PageQueryDto } from '../common/page-query.dto'

export class TaskQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Limita el resultado a tareas creadas, asignadas o supervisadas por el usuario.' })
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  @IsOptional()
  mine?: boolean

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  projectId?: string

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority
}

export class CreateTaskDto {
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

  @ApiPropertyOptional({ format: 'uuid' })
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
  priority?: TaskPriority

  @ApiPropertyOptional({ enum: TaskRecurrence, default: TaskRecurrence.NONE })
  @IsEnum(TaskRecurrence)
  @IsOptional()
  recurrence?: TaskRecurrence

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

  @ApiProperty({ format: 'uuid', description: 'Clave estable obligatoria para reintentos idempotentes.' })
  @IsUUID('4')
  idempotencyKey!: string
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 180 })
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  @IsOptional()
  title?: string

  @ApiPropertyOptional({ maxLength: 10_000, nullable: true })
  @IsString()
  @MaxLength(10_000)
  @IsOptional()
  description?: string | null

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID('4')
  @IsOptional()
  projectId?: string | null

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority

  @ApiPropertyOptional({ enum: TaskRecurrence })
  @IsEnum(TaskRecurrence)
  @IsOptional()
  recurrence?: TaskRecurrence

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsDateString()
  @IsOptional()
  dueAt?: string | null

  @ApiPropertyOptional({ minimum: 0, maximum: 100_000, nullable: true })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  @IsOptional()
  estimatedMinutes?: number | null
}

export class AssignTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  assigneeId!: string

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID('4')
  @IsOptional()
  supervisorId?: string | null
}

export class CreateChecklistItemDto {
  @ApiProperty({ minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label!: string

  @ApiPropertyOptional({ minimum: 0, maximum: 100_000, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  @IsOptional()
  position?: number
}

export class UpdateChecklistItemDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  @IsOptional()
  label?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 100_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  @IsOptional()
  position?: number
}

export class CreateTaskCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 4_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  content!: string
}

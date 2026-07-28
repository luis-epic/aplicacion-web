import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ProjectMemberRole, ProjectStatus } from '@prisma/client'
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'
import { PageQueryDto } from '../common/page-query.dto'

export class ProjectQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  clientId?: string
}

export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  clientId!: string

  @ApiProperty({ minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string

  @ApiPropertyOptional({ maxLength: 10_000 })
  @IsString()
  @MaxLength(10_000)
  @IsOptional()
  description?: string

  @ApiPropertyOptional({ enum: ProjectStatus, default: ProjectStatus.DRAFT })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  startsAt?: string

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  endsAt?: string
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @IsOptional()
  code?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  clientId?: string

  @ApiPropertyOptional({ minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ maxLength: 10_000, nullable: true })
  @IsString()
  @MaxLength(10_000)
  @IsOptional()
  description?: string | null

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsDateString()
  @IsOptional()
  startsAt?: string | null

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsDateString()
  @IsOptional()
  endsAt?: string | null
}

export class AddProjectMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId!: string

  @ApiProperty({ enum: ProjectMemberRole })
  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole
}

export class UpdateProjectMemberDto {
  @ApiProperty({ enum: ProjectMemberRole })
  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole
}

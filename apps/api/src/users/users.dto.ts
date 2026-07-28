import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { UserStatus } from '@prisma/client'
import { Transform } from 'class-transformer'
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator'

const normalizeEmail = ({ value }: { value: unknown }): unknown => (
  typeof value === 'string' ? value.trim().toLowerCase() : value
)

export class CreateUserDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  password!: string

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus

  @ApiPropertyOptional({ type: [String], format: 'uuid', uniqueItems: true })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  roleIds?: string[]
}

export class UpdateUserDto {
  @ApiPropertyOptional({ format: 'email', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  @IsOptional()
  email?: string

  @ApiPropertyOptional({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  @IsOptional()
  password?: string

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  displayName?: string

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus

  @ApiPropertyOptional({ type: [String], format: 'uuid', uniqueItems: true })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  roleIds?: string[]
}

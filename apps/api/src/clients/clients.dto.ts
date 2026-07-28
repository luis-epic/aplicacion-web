import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateClientDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string

  @ApiPropertyOptional({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  taxId?: string

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean
}

export class UpdateClientDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ maxLength: 50, nullable: true })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  taxId?: string | null

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean
}

export class CreateContactDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @ApiPropertyOptional({ format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  @IsOptional()
  email?: string

  @ApiPropertyOptional({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  phone?: string

  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  position?: string

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean
}

export class UpdateContactDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ format: 'email', maxLength: 254, nullable: true })
  @IsEmail()
  @MaxLength(254)
  @IsOptional()
  email?: string | null

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  phone?: string | null

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  position?: string | null

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean
}

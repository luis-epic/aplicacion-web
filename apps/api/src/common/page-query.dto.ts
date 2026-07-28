import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize = 25

  @ApiPropertyOptional({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export function pageArgs(query: PageQueryDto): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
}

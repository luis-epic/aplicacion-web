import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

export function throwPrismaConflict(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2003' || error.code === 'P2014')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

export function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

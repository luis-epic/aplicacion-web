import type { SessionUser } from '@opeconca/contracts'
import type { Request } from 'express'

export interface AccessTokenPayload {
  sid: string
  sub: string
  tokenVersion: number
}

export interface RequestContext {
  ipAddress?: string
  userAgent?: string
}

export interface AuthenticatedRequest extends Request {
  authUser: SessionUser
}

export type SyncState = 'local' | 'pending' | 'syncing' | 'synced' | 'error'

export interface SessionIdentity {
  id: string
  email: string
  displayName: string
  roles: string[]
  permissions: string[]
  cachedAt: string
}

export interface AuthSession {
  accessToken: string
  expiresIn: number
  user: Omit<SessionIdentity, 'cachedAt'>
}

export interface FieldProject {
  id: string
  code: string
  clientId: string
  clientName: string
  name: string
  description: string | null
  status: string
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FieldReportPayload {
  projectId: string
  reportDate: string
  summary: string
  personnelCount: number
  weatherNotes?: string
  incidentNotes?: string
  clientUpdatedAt: string
  idempotencyKey: string
}

export interface ServerFieldReport extends Omit<FieldReportPayload, 'weatherNotes' | 'incidentNotes'> {
  id: string
  projectCode: string
  projectName: string
  authorId: string
  authorName: string
  approverId: string | null
  approverName: string | null
  weatherNotes: string | null
  weatherSnapshot: unknown
  incidentNotes: string | null
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  submittedAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LocalFieldReport {
  localId: string
  ownerId: string
  payload: FieldReportPayload
  projectCode: string
  projectName: string
  submitAfterCreate: boolean
  syncState: SyncState
  serverReport?: ServerFieldReport
  createdAt: string
  updatedAt: string
  error?: string
}

export interface OutboxEntry {
  localId: string
  ownerId: string
  attempts: number
  nextAttemptAt: string
  createdAt: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

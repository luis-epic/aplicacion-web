export type PublicationPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT'
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'IN_REVIEW' | 'COMPLETED' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
export type TaskTransition = 'start' | 'block' | 'complete' | 'submit-review'
export type ConcreteOrderStatus = 'PENDING' | 'CONFIRMED' | 'PRODUCING' | 'LOADED' | 'IN_TRANSIT' | 'AT_SITE' | 'DISCHARGING' | 'COMPLETED' | 'CANCELLED'

export type EnterpriseOperationKind =
  | 'publication.acknowledge'
  | 'task.transition'
  | 'concreteOrder.create'
  | 'concreteOrder.confirm'
  | 'concreteOrder.produce'
  | 'concreteOrder.load'
  | 'concreteOrder.deliver'
  | 'quality.sample.capture'
  | 'quality.result.record'
  | 'production.entry.create'
  | 'inspection.complete'

export type EnterpriseOperation =
  | { kind: 'publication.acknowledge'; publicationId: string }
  | { kind: 'task.transition'; taskId: string; transition: TaskTransition }
  | { kind: 'concreteOrder.create'; payload: Record<string, unknown> }
  | { kind: 'concreteOrder.confirm'; payload: Record<string, unknown> }
  | { kind: 'concreteOrder.produce'; payload: Record<string, unknown> }
  | { kind: 'concreteOrder.load'; payload: Record<string, unknown> }
  | { kind: 'concreteOrder.deliver'; payload: Record<string, unknown> }
  | { kind: 'quality.sample.capture'; payload: Record<string, unknown> }
  | { kind: 'quality.result.record'; payload: Record<string, unknown> }
  | { kind: 'production.entry.create'; payload: Record<string, unknown> }
  | { kind: 'inspection.complete'; payload: Record<string, unknown> }

export interface EnterpriseOutboxEntry {
  localId: string
  ownerId: string
  operation: EnterpriseOperation
  attempts: number
  nextAttemptAt: string
  createdAt: string
  lastError?: string
  terminal?: boolean
  organizationId?: string
  entityId?: string
}

export interface PublicationView {
  id: string
  title: string
  slug: string
  summary: string
  content: string
  coverImageUrl: string | null
  type: string
  category: string
  status: string
  priority: PublicationPriority
  audience: string
  audienceRoleCode: string | null
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  authorId: string
  authorName: string
  reviewerId: string | null
  reviewerName: string | null
  scheduledAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  acknowledgementCount: number
  generatedTaskCount: number
  createdAt: string
  updatedAt: string
}

export interface CachedPublication extends PublicationView {
  acknowledgedAt?: string
  pendingAcknowledgement?: boolean
  acknowledgementError?: string
}

export interface TaskChecklistItem {
  id: string
  taskId: string
  label: string
  completed: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export interface TaskComment {
  id: string
  taskId: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
}

export interface WorkTaskView {
  id: string
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  recurrence: string
  creatorId: string
  creatorName: string
  assigneeId: string | null
  assigneeName: string | null
  supervisorId: string | null
  supervisorName: string | null
  sourcePublicationId: string | null
  idempotencyKey: string | null
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  estimatedMinutes: number | null
  createdAt: string
  updatedAt: string
  checklist: TaskChecklistItem[]
  comments: TaskComment[]
  pendingTransition?: TaskTransition
  syncError?: string
}

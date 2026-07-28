import type {
  ActivityId,
  ChecklistItem,
  ItemHabit,
  PersonalizationProfile,
  RecommendationResult,
} from '../types/app'

export type HabitSignal = 'added' | 'removed' | 'completed' | 'pending'

const categoryOrder: ChecklistItem['category'][] = [
  'Esenciales',
  'Clima',
  'Actividad',
  'Transporte',
  'Personales',
]

export function createEmptyProfile(): PersonalizationProfile {
  return {
    version: 1,
    habits: {},
    totalSignals: 0,
  }
}

function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function habitKey(activity: ActivityId, label: string): string {
  return `${activity}:${normalizeLabel(label)}`
}

function defaultHabit(activity: ActivityId, item: ChecklistItem): ItemHabit {
  return {
    key: habitKey(activity, item.label),
    activity,
    label: item.label,
    category: item.category,
    addedCount: 0,
    removedCount: 0,
    completedCount: 0,
    pendingReviewCount: 0,
    updatedAt: new Date(0).toISOString(),
  }
}

export function recordHabitSignal(
  profile: PersonalizationProfile,
  activity: ActivityId,
  item: ChecklistItem,
  signal: HabitSignal,
  now = new Date(),
): PersonalizationProfile {
  const key = habitKey(activity, item.label)
  const current = profile.habits[key] ?? defaultHabit(activity, item)
  const next: ItemHabit = {
    ...current,
    label: item.label,
    category: item.category,
    updatedAt: now.toISOString(),
  }

  if (signal === 'added') next.addedCount += 1
  if (signal === 'removed') next.removedCount += 1
  if (signal === 'completed') next.completedCount += 1
  if (signal === 'pending') next.pendingReviewCount += 1

  return {
    ...profile,
    habits: { ...profile.habits, [key]: next },
    totalSignals: profile.totalSignals + 1,
  }
}

export function recordPendingSignals(
  profile: PersonalizationProfile,
  activity: ActivityId,
  items: ChecklistItem[],
  now = new Date(),
): PersonalizationProfile {
  return items.reduce(
    (currentProfile, item) => recordHabitSignal(currentProfile, activity, item, 'pending', now),
    profile,
  )
}

function habitScore(habit: ItemHabit | undefined): number {
  if (!habit) return 0
  return (
    habit.pendingReviewCount * 8 +
    habit.addedCount * 4 +
    habit.completedCount -
    habit.removedCount * 2
  )
}

function learnedItems(
  profile: PersonalizationProfile,
  activity: ActivityId,
  existingLabels: Set<string>,
): ChecklistItem[] {
  return Object.values(profile.habits)
    .filter((habit) =>
      habit.activity === activity &&
      habit.addedCount >= 2 &&
      habit.addedCount > habit.removedCount &&
      !existingLabels.has(normalizeLabel(habit.label)),
    )
    .map((habit) => ({
      id: `learned-${habit.key}`,
      label: habit.label,
      reason: `Lo añadiste ${habit.addedCount} veces en salidas similares`,
      category: habit.category,
      priority: habit.pendingReviewCount >= 2 ? 'high' : 'normal',
      completed: false,
    }))
}

export function personalizeRecommendation(
  result: RecommendationResult,
  profile: PersonalizationProfile,
  activity: ActivityId,
): RecommendationResult {
  const existingLabels = new Set(result.items.map((item) => normalizeLabel(item.label)))
  const learned = learnedItems(profile, activity, existingLabels)
  let personalized = learned.length > 0

  const filteredItems = result.items.filter((item) => {
    const habit = profile.habits[habitKey(activity, item.label)]
    const shouldSuppress = Boolean(
      habit &&
      item.priority !== 'high' &&
      item.category !== 'Esenciales' &&
      habit.removedCount >= 3 &&
      habit.removedCount > habit.completedCount,
    )
    if (shouldSuppress) personalized = true
    return !shouldSuppress
  })

  const originalOrder = new Map(
    [...filteredItems, ...learned].map((item, index) => [item.id, index]),
  )
  const items = [...filteredItems, ...learned]
    .map((item) => {
      const habit = profile.habits[habitKey(activity, item.label)]
      if (habit && habit.pendingReviewCount >= 2) {
        personalized = true
        return {
          ...item,
          priority: 'high' as const,
          reason: `${item.reason} · Suele quedar pendiente`,
        }
      }
      return item
    })
    .sort((left, right) => {
      const categoryDifference = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category)
      if (categoryDifference !== 0) return categoryDifference
      const priorityDifference = Number(right.priority === 'high') - Number(left.priority === 'high')
      if (priorityDifference !== 0) return priorityDifference
      const scoreDifference =
        habitScore(profile.habits[habitKey(activity, right.label)]) -
        habitScore(profile.habits[habitKey(activity, left.label)])
      if (scoreDifference !== 0) {
        personalized = true
        return scoreDifference
      }
      return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0)
    })

  return {
    items,
    appliedRules: personalized
      ? [...result.appliedRules, 'Hábitos aprendidos en este dispositivo']
      : result.appliedRules,
  }
}

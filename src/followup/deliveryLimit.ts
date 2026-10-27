export function canStartDelivery(completed: unknown, limit: unknown): boolean {
  return (
    typeof completed === 'number' &&
    Number.isSafeInteger(completed) &&
    completed >= 0 &&
    typeof limit === 'number' &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= 150 &&
    completed < limit
  )
}
export function verifiedDailyTotal(
  completed: unknown,
  baseline: unknown,
  today: string,
): number | null {
  if (
    typeof completed !== 'number' ||
    !Number.isSafeInteger(completed) ||
    completed < 0 ||
    !baseline ||
    typeof baseline !== 'object'
  )
    return null
  const value = baseline as { date?: unknown; externalCount?: unknown; verified?: unknown }
  if (
    value.verified !== true ||
    value.date !== today ||
    typeof value.externalCount !== 'number' ||
    !Number.isSafeInteger(value.externalCount) ||
    value.externalCount < 0
  )
    return null
  const total = completed + value.externalCount
  return Number.isSafeInteger(total) ? total : null
}

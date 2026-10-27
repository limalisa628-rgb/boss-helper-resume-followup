export function canStartDelivery(completed: unknown, limit: unknown): boolean {
  return (
    typeof completed === 'number' && Number.isSafeInteger(completed) && completed >= 0 &&
    typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0 && limit <= 150 &&
    completed < limit
  )
}

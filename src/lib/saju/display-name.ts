/** Presentation only. null means absent; undefined means invalid input. */
export function normalizeDisplayName(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) return undefined
  const name = value.trim()
  if (!name) return null
  return name.length <= 30 && /^[\p{L}\p{M}\p{N} .'-]+$/u.test(name) ? name : undefined
}

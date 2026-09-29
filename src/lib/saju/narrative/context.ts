import type { NarrativeContext, NarrativePeriod } from './types'

export function hasPeriod(value: { startDateTime: string | null; endDateTime: string | null } | undefined): value is NarrativePeriod {
  if (!value?.startDateTime || !value.endDateTime) return false
  const start = Date.parse(value.startDateTime)
  const end = Date.parse(value.endDateTime)
  return Number.isFinite(start) && Number.isFinite(end) && start < end
}

/** Composition only. All calculation results must belong to the same chart. */
export function buildNarrativeContext(input: Pick<NarrativeContext,
  'natal' | 'analysis' | 'strengthFacts' | 'strength' | 'daewoonResult' | 'flow' | 'interpretationFacts' | 'hasBirthTime'
> & { referenceInstant: Date }): NarrativeContext {
  const instant = input.referenceInstant.getTime()
  if (!Number.isFinite(instant)) throw new RangeError('Invalid narrative reference instant.')
  const referenceDate = new Date(instant + 9 * 3_600_000).toISOString().slice(0, 10)
  const referenceYear = Number(referenceDate.slice(0, 4))
  const { luck, interactions, keyPillars } = input.interpretationFacts
  const within = (period: NarrativePeriod) => Date.parse(period.startDateTime) <= instant && instant < Date.parse(period.endDateTime)
  const daewoon = !input.hasBirthTime ? 'birth-time-missing'
    : input.daewoonResult.startPrecision !== 'exact' ? 'unavailable'
      : hasPeriod(luck.daewoon) && within(luck.daewoon) ? 'resolved' : 'outside-cycles'
  return {
    methodologyVersion: 'narrative-context-v1',
    referenceInstant: input.referenceInstant.toISOString(), referenceDate, referenceYear,
    annualTargetYear: luck.annual?.year ?? null, hasBirthTime: input.hasBirthTime,
    timing: {
      daewoon,
      annualMatchesReferenceYear: luck.annual?.year === referenceYear,
      annualContainsReferenceInstant: hasPeriod(luck.annual) && within(luck.annual),
    },
    natal: input.natal, analysis: input.analysis, strengthFacts: input.strengthFacts,
    strength: input.strength, daewoonResult: input.daewoonResult,
    luck, interactions, flow: input.flow, keyPillars, interpretationFacts: input.interpretationFacts,
  }
}

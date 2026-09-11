import type { HiddenStemRole, RootFinding, RootPillar, SajuResult, StrengthAssessment } from '../../types'
import { analyzeRoots } from '../roots'

/** DEV raw candidates only; never merge these into production exact findings. */
export function analyzeSameElementRootCandidates(result: SajuResult): RootFinding[] {
  const candidateStems = new Set(Object.values(result.hiddenStems).flatMap((stems) =>
    (stems ?? []).filter(({ stem, element }) =>
      stem !== result.day.stem && element === result.elements.day.stem,
    ).map(({ stem }) => stem),
  ))
  // Reuse canonical role lookup with a copied query day; the original chart is untouched.
  return [...candidateStems].flatMap((stem) => analyzeRoots({
    ...result, day: { ...result.day, stem },
  }).roots)
}

// Frozen v1 experiment coefficients; deliberately separate from production scoring.
const ROLE: Record<HiddenStemRole, number> = { main: 10, middle: 6, residual: 3 }
const POSITION: Record<RootPillar, number> = { month: 1.4, day: 1.2, hour: 1, year: 0.8 }
// Preserve the extra precision introduced by the experimental multipliers.
const round = (value: number) => Math.round(value * 100) / 100

export function simulateSameElementRoots(
  assessment: StrengthAssessment,
  candidates: readonly RootFinding[],
) {
  const candidateScore = candidates.reduce((sum, { role, pillar }) => sum + ROLE[role] * POSITION[pillar], 0)
  const { roots: exactRoots, seasonal, elementSupport, elementPressure } = assessment.score
  return [0.25, 0.4, 0.5].map((ratio) => {
    const additionalRoots = round(candidateScore * ratio)
    const roots = round(Math.min(30, exactRoots + additionalRoots))
    const balance = round(Math.max(0, seasonal) + roots + elementSupport
      - Math.max(0, -seasonal) - elementPressure)
    const level = balance >= 15 ? 'strong' : balance <= -15 ? 'weak' : 'balanced'
    return { ratio, additionalRoots, appliedAdditionalRoots: round(roots - exactRoots), roots, balance, level }
  })
}

import type {
  KeyPillarInteractionFact, KeyPillarInteractionFacts, LuckInteractionFacts, LuckInteractionSource,
} from '../types'

function externalSource(
  left: LuckInteractionSource, right: LuckInteractionSource, pillar: 'day' | 'month',
): 'daewoon' | 'annual' | undefined {
  if (left.source === 'natal' && left.pillar === pillar && right.source !== 'natal') return right.source
  if (right.source === 'natal' && right.pillar === pillar && left.source !== 'natal') return left.source
  return undefined
}

function summarize<T extends { externalSource: 'daewoon' | 'annual' }>(findings: T[]): KeyPillarInteractionFact<T> {
  return {
    affected: findings.length > 0,
    byDaewoon: findings.some((finding) => finding.externalSource === 'daewoon'),
    byAnnual: findings.some((finding) => finding.externalSource === 'annual'),
    findings,
  }
}

/** Consumes Phase 1 facts without recalculating relations. Counterpart values and
 * natal/source identities remain in left/right; origin traces the input finding.
 * No combined punishment completeness or interpretation is assessed here.
 */
export function analyzeKeyPillarInteractions({ interactions }: {
  interactions: LuckInteractionFacts
}): KeyPillarInteractionFacts {
  const dayStem: KeyPillarInteractionFacts['dayStem']['findings'] = []
  const dayBranch: KeyPillarInteractionFacts['dayBranch']['findings'] = []
  const monthBranch: KeyPillarInteractionFacts['monthBranch']['findings'] = []

  interactions.stemCombinations.forEach((finding, index) => {
    const source = externalSource(finding.left.source, finding.right.source, 'day')
    if (source) dayStem.push({ ...finding, externalSource: source, origin: { collection: 'stemCombinations', index } })
  })

  const collectBranches = <K extends Exclude<keyof LuckInteractionFacts, 'stemCombinations'>>(collection: K) => {
    interactions[collection].forEach((finding, index) => {
      for (const pillar of ['day', 'month'] as const) {
        const source = externalSource(finding.left.source, finding.right.source, pillar)
        if (!source) continue
        const target = pillar === 'day' ? dayBranch : monthBranch
        target.push({ ...finding, externalSource: source, origin: { collection, index } })
      }
    })
  }
  collectBranches('branchClashes')
  collectBranches('branchCombinations')
  collectBranches('branchPunishments')
  collectBranches('branchBreaks')
  collectBranches('branchHarms')

  return { dayStem: summarize(dayStem), dayBranch: summarize(dayBranch), monthBranch: summarize(monthBranch) }
}

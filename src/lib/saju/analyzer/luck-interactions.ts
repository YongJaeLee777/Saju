import type {
  AnnualLuck, DaewoonCycle, LuckInteractionFacts, LuckInteractionSource, Pillar, SajuResult,
} from '../types'
import { analyzeStemCombinations } from './stem-combinations'
import { analyzeBranchClashes } from './branch-clashes'
import { analyzeBranchCombinations } from './branch-combinations'
import { analyzeBranchPunishments } from './branch-punishments'
import { analyzeBranchBreaks } from './branch-breaks'
import { analyzeBranchHarms } from './branch-harms'

interface Entry {
  source: LuckInteractionSource
  stem: string
  branch: string
}

/** Selected periods are supplied by the caller; no date selection or interpretation. */
export function analyzeLuckInteractions({ natal, daewoon, annualLuck }: {
  natal: SajuResult
  daewoon?: Pick<DaewoonCycle, 'stem' | 'branch'>
  annualLuck?: Pick<AnnualLuck, 'stem' | 'branch'>
}): LuckInteractionFacts {
  const facts: LuckInteractionFacts = {
    stemCombinations: [], branchClashes: [], branchCombinations: [],
    branchPunishments: [], branchBreaks: [], branchHarms: [],
  }
  const entries: Entry[] = []
  for (const pillar of ['year', 'month', 'day', 'hour'] as const) {
    const { stem, branch } = natal[pillar]
    if (stem !== null && branch !== null) entries.push({ source: { source: 'natal', pillar }, stem, branch })
  }
  if (daewoon) entries.push({ source: { source: 'daewoon' }, stem: daewoon.stem, branch: daewoon.branch })
  if (annualLuck) entries.push({ source: { source: 'annual' }, stem: annualLuck.stem, branch: annualLuck.branch })

  for (const [index, left] of entries.entries()) {
    for (const right of entries.slice(index + 1)) {
      if (left.source.source === 'natal' && right.source.source === 'natal') continue
      // Adapter to existing four-slot analyzers. Empty strings are nonmatching unused
      // slots, never real natal pillars. Original source identities remain below.
      const pillar = (entry: Entry): Pillar => ({ stem: entry.stem, branch: entry.branch, korean: entry.stem + entry.branch })
      const pair = {
        year: pillar(left), month: pillar(right),
        day: { stem: '', branch: '', korean: '' },
        hour: { stem: null, branch: null, korean: null },
      }
      const branches = {
        left: { source: left.source, branch: left.branch },
        right: { source: right.source, branch: right.branch },
      }
      if (analyzeStemCombinations(pair).length) facts.stemCombinations.push({
        type: 'combination',
        left: { source: left.source, stem: left.stem },
        right: { source: right.source, stem: right.stem },
      })
      if (analyzeBranchClashes(pair).length) facts.branchClashes.push({ type: 'clash', ...branches })
      if (analyzeBranchCombinations(pair).length) facts.branchCombinations.push({ type: 'six-combination', ...branches })
      if (analyzeBranchBreaks(pair).length) facts.branchBreaks.push({ type: 'break', ...branches })
      if (analyzeBranchHarms(pair).length) facts.branchHarms.push({ type: 'harm', ...branches })
      for (const finding of analyzeBranchPunishments(pair).findings) {
        if (finding.type === 'three-punishment') {
          facts.branchPunishments.push({
            type: 'punishment', ...branches, scope: 'pair-only', kind: finding.type,
            group: finding.group, complete: false,
          })
        } else {
          facts.branchPunishments.push({ type: 'punishment', ...branches, scope: 'pair-only', kind: finding.type })
        }
      }
    }
  }
  return facts
}

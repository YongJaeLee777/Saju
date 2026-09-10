import type { AnalysisFacts, FiveElement, SajuResult } from '../types'
import { countHiddenElements, countSurfaceElements } from './elements'
import { getSeasonalContext } from './seasonal'
import { analyzeRoots } from './roots'
import { analyzeExposure } from './exposure'
import { analyzeStemCombinations } from './stem-combinations'
import { analyzeBranchClashes } from './branch-clashes'
import { analyzeBranchCombinations } from './branch-combinations'
import { analyzeBranchPunishments } from './branch-punishments'
import { analyzeBranchBreaks } from './branch-breaks'
import { analyzeBranchHarms } from './branch-harms'

const FIVE_ELEMENTS: readonly FiveElement[] = ['목', '화', '토', '금', '수']

export function buildAnalysisFacts(result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour' | 'elements' | 'hiddenStems'>): AnalysisFacts {
  const surfaceCounts = countSurfaceElements(result.elements)
  const hiddenCounts = countHiddenElements(result.hiddenStems)

  const presence = Object.fromEntries(
    FIVE_ELEMENTS.map((element) => [element, {
      surface: surfaceCounts[element] > 0,
      hidden: hiddenCounts[element] > 0,
    }]),
  ) as AnalysisFacts['presence']

  return {
    surfaceCounts, hiddenCounts, presence,
    seasonal: getSeasonalContext(result),
    roots: analyzeRoots(result),
    exposure: analyzeExposure(result),
    stemCombinations: analyzeStemCombinations(result),
    branchClashes: analyzeBranchClashes(result),
    branchCombinations: analyzeBranchCombinations(result),
    branchPunishments: analyzeBranchPunishments(result),
    branchBreaks: analyzeBranchBreaks(result),
    branchHarms: analyzeBranchHarms(result),
  }
}

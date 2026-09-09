import type { AnalysisFacts, FiveElement, SajuResult } from '../types'
import { countHiddenElements, countSurfaceElements } from './elements'

const FIVE_ELEMENTS: readonly FiveElement[] = ['목', '화', '토', '금', '수']

export function buildAnalysisFacts(result: Pick<SajuResult, 'elements' | 'hiddenStems'>): AnalysisFacts {
  const surfaceCounts = countSurfaceElements(result.elements)
  const hiddenCounts = countHiddenElements(result.hiddenStems)

  const presence = Object.fromEntries(
    FIVE_ELEMENTS.map((element) => [element, {
      surface: surfaceCounts[element] > 0,
      hidden: hiddenCounts[element] > 0,
    }]),
  ) as AnalysisFacts['presence']

  return { surfaceCounts, hiddenCounts, presence }
}

import type { FiveElement, SajuResult } from '../types'

export type SurfaceElementCounts = Record<FiveElement, number>

/** 표면 천간·지지를 각각 1개로 센다. 지장간·가중치·강도는 포함하지 않는다. */
export function countSurfaceElements(
  elements: SajuResult['elements'],
): SurfaceElementCounts {
  const counts: SurfaceElementCounts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 }

  for (const pair of [elements.year, elements.month, elements.day, elements.hour]) {
    if (pair === null) continue
    counts[pair.stem] += 1
    counts[pair.branch] += 1
  }

  return counts
}

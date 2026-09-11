import type { HiddenStemRole, RootAnalysis, RootPillar, SajuResult } from '../types'

// Explicit canonical roles; independent of hidden-stem array order.
// Weights are applied separately by the strength analyzer.
const ROLE_BY_BRANCH_AND_STEM: Record<string, Record<string, HiddenStemRole>> = {
  자: { 계: 'main' }, 축: { 기: 'main', 계: 'middle', 신: 'residual' },
  인: { 갑: 'main', 병: 'middle', 무: 'residual' }, 묘: { 을: 'main' },
  진: { 무: 'main', 을: 'middle', 계: 'residual' }, 사: { 병: 'main', 경: 'residual', 무: 'middle' },
  오: { 정: 'main', 기: 'middle' }, 미: { 기: 'main', 정: 'middle', 을: 'residual' },
  신: { 경: 'main', 임: 'middle', 무: 'residual' }, 유: { 신: 'main' },
  술: { 무: 'main', 신: 'middle', 정: 'residual' }, 해: { 임: 'main', 갑: 'middle' },
}

export function analyzeRoots(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour' | 'hiddenStems'>,
): RootAnalysis {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const roots = pillars.flatMap((pillar) => {
    const hiddenStems = result.hiddenStems[pillar]
    if (hiddenStems === null) return []
    const branch = result[pillar].branch
    if (branch === null) return []

    return hiddenStems
      .filter(({ stem }) => stem === result.day.stem)
      .map(({ stem }) => {
        const role = ROLE_BY_BRANCH_AND_STEM[branch]?.[stem]
        if (!role) throw new Error(`지장간 역할을 찾을 수 없습니다: ${branch} ${stem}`)
        return { pillar, branch, hiddenStem: stem, role }
      })
  })

  return { hasRoot: roots.length > 0, roots }
}

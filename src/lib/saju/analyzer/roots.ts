import type { HiddenStemRole, RootAnalysis, RootPillar, SajuResult } from '../types'

// Role labels follow the hidden-stem convention used by the source table.
// They describe position only; they are not weights or strength scores.
const ROLE_BY_BRANCH_AND_STEM: Record<string, Record<string, HiddenStemRole>> = {
  자: { 계: 'main' }, 축: { 기: 'residual', 계: 'middle', 신: 'main' },
  인: { 갑: 'residual', 병: 'middle', 무: 'main' }, 묘: { 을: 'main' },
  진: { 무: 'residual', 을: 'middle', 계: 'main' }, 사: { 병: 'residual', 경: 'main', 무: 'middle' },
  오: { 정: 'main', 기: 'residual' }, 미: { 기: 'residual', 정: 'middle', 을: 'main' },
  신: { 경: 'residual', 임: 'middle', 무: 'main' }, 유: { 신: 'main' },
  술: { 무: 'residual', 신: 'middle', 정: 'main' }, 해: { 임: 'residual', 갑: 'main' },
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

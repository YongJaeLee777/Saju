import { describe, expect, it } from 'vitest'
import type { HiddenStem, HiddenStemRole, SajuResult } from '../types'
import { calculateSaju } from '../calculator'
import { analyzeRoots } from './roots'
import { analyzeExposure } from './exposure'
import { buildAnalysisFacts } from './analysis-facts'
import { buildStrengthFacts } from './strength-facts'
import { assessStrength } from './strength'

const canonical: [string, [HiddenStem['stem'], HiddenStemRole][]][] = [
  ['자', [['계', 'main']]],
  ['축', [['기', 'main'], ['계', 'middle'], ['신', 'residual']]],
  ['인', [['갑', 'main'], ['병', 'middle'], ['무', 'residual']]],
  ['묘', [['을', 'main']]],
  ['진', [['무', 'main'], ['을', 'middle'], ['계', 'residual']]],
  ['사', [['병', 'main'], ['무', 'middle'], ['경', 'residual']]],
  ['오', [['정', 'main'], ['기', 'middle']]],
  ['미', [['기', 'main'], ['정', 'middle'], ['을', 'residual']]],
  ['신', [['경', 'main'], ['임', 'middle'], ['무', 'residual']]],
  ['유', [['신', 'main']]],
  ['술', [['무', 'main'], ['신', 'middle'], ['정', 'residual']]],
  ['해', [['임', 'main'], ['갑', 'middle']]],
]
const example = calculateSaju({ birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false })

describe('canonical hidden-stem roles', () => {
  it.each(canonical)('%s의 모든 role을 통근·투간에서 배열 순서와 무관하게 사용한다', (branch, members) => {
    for (const ordered of [members, [...members].reverse()]) {
      for (const [stem, role] of members) {
        const result: SajuResult = {
          ...example,
          month: { stem, branch, korean: `${stem}${branch}` },
          day: { ...example.day, stem },
          hiddenStems: { year: [], month: ordered.map(([member]) => ({ stem: member, element: '토' })), day: [], hour: null },
        }
        const roots = analyzeRoots(result)
        expect(roots.roots).toEqual([{ pillar: 'month', branch, hiddenStem: stem, role }])
        expect(analyzeExposure(result).findings).toEqual([
          { sourcePillar: 'month', sourceBranch: branch, hiddenStem: stem, role, exposedPillars: expect.arrayContaining(['month', 'day']) },
          ...ordered.filter(([member]) => member !== stem && [result.year.stem, result.hour.stem].includes(member)).map(([member, memberRole]) => ({
            sourcePillar: 'month', sourceBranch: branch, hiddenStem: member, role: memberRole, exposedPillars: expect.any(Array),
          })),
        ].sort((a, b) => ordered.findIndex(([member]) => member === a.hiddenStem) - ordered.findIndex(([member]) => member === b.hiddenStem)))
        const facts = buildStrengthFacts(result, { ...buildAnalysisFacts(example), roots })
        expect(facts.roots.findings).toEqual([{ pillar: 'month', role }])
        const expected = { main: 14, middle: 8.4, residual: 4.2 }
        expect(assessStrength(facts).score.roots).toBe(expected[role])
      }
    }
  })
})

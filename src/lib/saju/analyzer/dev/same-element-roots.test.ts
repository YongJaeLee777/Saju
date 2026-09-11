import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../../calculator'
import type { FiveElement, HiddenStem, SajuResult } from '../../types'
import { buildAnalysisFacts } from '../analysis-facts'
import { analyzeRoots } from '../roots'
import { assessStrength } from '../strength'
import { buildStrengthFacts } from '../strength-facts'
import { analyzeSameElementRootCandidates, simulateSameElementRoots } from './same-element-roots'

const example = calculateSaju({
  birthDate: '1991-01-02', birthTime: null, gender: 'female',
  calendarType: 'solar', isLeapMonth: false,
})

describe('DEV same-element roots', () => {
  it.each<[string, HiddenStem['stem'], FiveElement, string]>([
    ['갑', '을', '목', '묘'], ['을', '갑', '목', '인'],
    ['병', '정', '화', '오'], ['정', '병', '화', '사'],
    ['무', '기', '토', '축'], ['기', '무', '토', '진'],
    ['경', '신', '금', '유'], ['신', '경', '금', '신'],
    ['임', '계', '수', '자'], ['계', '임', '수', '해'],
  ])('%s ↔ %s는 candidate이며 exact root는 아니다', (dayStem, stem, element, branch) => {
    const result: SajuResult = {
      ...example,
      day: { ...example.day, stem: dayStem },
      month: { ...example.month, branch },
      elements: { ...example.elements, day: { ...example.elements.day, stem: element } },
      hiddenStems: { year: [], month: [{ stem, element }], day: [], hour: null },
    }
    expect(analyzeSameElementRootCandidates(result)).toEqual([
      { pillar: 'month', branch, hiddenStem: stem, role: 'main' },
    ])
    expect(analyzeRoots(result)).toEqual({ hasRoot: false, roots: [] })
  })

  it('G07의 壬 + 子의 癸 관계를 검출하고 exact·다른 오행·누락 시주는 제외한다', () => {
    const exactBefore = analyzeRoots(example)
    expect(analyzeSameElementRootCandidates(example)).toEqual([
      { pillar: 'month', branch: '자', hiddenStem: '계', role: 'main' },
    ])
    expect(analyzeRoots(example)).toEqual(exactBefore)
    expect(exactBefore.roots).toContainEqual({ pillar: 'day', branch: '신', hiddenStem: '임', role: 'middle' })
  })

  it('가상 배율·cap·경계를 적용해도 원래 StrengthAssessment는 바뀌지 않는다', () => {
    const facts = buildStrengthFacts(example, buildAnalysisFacts(example))
    const assessment = assessStrength(facts)
    const before = structuredClone(assessment)
    const candidates = analyzeSameElementRootCandidates(example)
    const scenarios = simulateSameElementRoots(assessment, candidates)
    expect(scenarios.map(({ additionalRoots }) => additionalRoots)).toEqual([3.5, 5.6, 7])
    const boundary = { ...assessment, score: {
      ...assessment.score, seasonal: -15, roots: 27, elementSupport: 0, elementPressure: 0,
    } }
    expect(simulateSameElementRoots(boundary, candidates)).toEqual(
      [0.25, 0.4, 0.5].map((ratio, index) => ({
        ratio, additionalRoots: [3.5, 5.6, 7][index], appliedAdditionalRoots: 3,
        roots: 30, balance: 15, level: 'strong',
      })),
    )
    expect(simulateSameElementRoots(assessment, [])).toEqual(
      [0.25, 0.4, 0.5].map((ratio) => ({
        ratio, additionalRoots: 0, appliedAdditionalRoots: 0, roots: assessment.score.roots,
        balance: assessment.score.balance, level: assessment.level,
      })),
    )
    expect(assessment).toEqual(before)
    expect(assessStrength(facts)).toEqual(before)
  })
})

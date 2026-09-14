import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { AnnualLuck, DaewoonCycle, StrengthAssessment } from '../types'
import { analyzeLuckInteractions } from './luck-interactions'
import { analyzeLuckFlow } from './luck-flow'
import { analyzeKeyPillarInteractions } from './key-pillar-interactions'
import { buildInterpretationFacts } from './interpretation-facts'

const natal = calculateSaju({ birthDate: '1991-01-02', birthTime: null, gender: 'female', calendarType: 'solar', isLeapMonth: false })
const strength: StrengthAssessment = {
  level: 'balanced', confidence: 'low', methodologyVersion: 'v1', reasons: [],
  score: { seasonal: 0, roots: 0, elementSupport: 0, elementPressure: 0, support: 0, pressure: 0, balance: 0 },
}
const daewoon: DaewoonCycle = {
  stem: '정', branch: '오', korean: '정오', stemElement: '화', branchElement: '화',
  stemTenGod: '정재', branchTenGod: '정재', index: 1,
  startAge: null, startDateTime: null, endDateTime: null,
}
const annualLuck: AnnualLuck = {
  stem: '정', branch: '미', korean: '정미', stemElement: '화', branchElement: '토',
  stemTenGod: '정재', branchTenGod: '정관', year: 2027,
  startDateTime: '2027-02-04T00:00:00.000Z', endDateTime: '2028-02-04T00:00:00.000Z',
}

function input(luck: { daewoon?: DaewoonCycle; annualLuck?: AnnualLuck } = {}) {
  const interactions = analyzeLuckInteractions({ natal, ...luck })
  return {
    natal, strength, ...luck, interactions,
    flow: analyzeLuckFlow({ natal, ...luck }),
    keyPillars: analyzeKeyPillarInteractions({ interactions }),
  }
}

describe('structured interpretation facts', () => {
  it('대운과 세운, repeated facts, key flags와 근거를 그대로 전달한다', () => {
    const supplied = input({ daewoon, annualLuck })
    const facts = buildInterpretationFacts(supplied)
    expect(facts.luck).toEqual({ daewoon, annual: annualLuck })
    expect(facts.flow).toEqual({
      daewoon: supplied.flow.daewoon, annual: supplied.flow.annual,
      repeatedElements: supplied.flow.repeatedElements, repeatedTenGods: supplied.flow.repeatedTenGods,
    })
    expect(facts.flow.repeatedElements.length).toBeGreaterThan(0)
    expect(facts.flow.repeatedTenGods.length).toBeGreaterThan(0)
    expect(facts.interactions).toEqual(supplied.interactions)
    expect(facts.interactions.branchPunishments.length).toBeGreaterThan(0)
    expect(facts.interactions.branchPunishments[0].scope).toBe('pair-only')
    expect(facts.keyPillars).toEqual(supplied.keyPillars)
    expect(facts.keyPillars.dayStem).toMatchObject({ affected: true, byDaewoon: true, byAnnual: true })
    expect(facts.keyPillars.dayStem.findings).toHaveLength(2)
  })

  it('대운만 있으면 annual 필드를 생략한다', () => {
    const supplied = input({ daewoon })
    const facts = buildInterpretationFacts(supplied)
    expect(facts.luck).toEqual({ daewoon })
    expect(facts.flow.daewoon).toEqual(supplied.flow.daewoon)
    expect(facts.flow).not.toHaveProperty('annual')
  })

  it('세운만 있으면 daewoon 필드를 생략한다', () => {
    const supplied = input({ annualLuck })
    const facts = buildInterpretationFacts(supplied)
    expect(facts.luck).toEqual({ annual: annualLuck })
    expect(facts.flow.annual).toEqual(supplied.flow.annual)
    expect(facts.flow).not.toHaveProperty('daewoon')
  })

  it('운과 interaction이 없으면 빈 결과와 false flags를 유지한다', () => {
    const supplied = input()
    const facts = buildInterpretationFacts(supplied)
    expect(facts.luck).toEqual({})
    expect(facts.interactions).toEqual({ stemCombinations: [], branchClashes: [], branchCombinations: [], branchPunishments: [], branchBreaks: [], branchHarms: [] })
    expect(facts.flow).toEqual({ repeatedElements: [], repeatedTenGods: [] })
    for (const fact of Object.values(facts.keyPillars)) {
      expect(fact).toEqual({ affected: false, byDaewoon: false, byAnnual: false, findings: [] })
    }
  })

  it('일간 context와 strength context를 입력값 그대로 전달한다', () => {
    const facts = buildInterpretationFacts(input())
    expect(facts.context).toEqual({
      dayStem: natal.day.stem, dayElement: natal.elements.day.stem,
      strengthLevel: 'balanced', strengthConfidence: 'low', methodologyVersion: 'v1',
    })
  })

  it('입력 객체를 변경하지 않는다', () => {
    const supplied = input({ daewoon, annualLuck })
    const before = structuredClone(supplied)
    buildInterpretationFacts(supplied)
    expect(supplied).toEqual(before)
  })
})

import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { LuckInteractionFacts, SajuResult } from '../types'
import { analyzeLuckInteractions } from './luck-interactions'
import { analyzeKeyPillarInteractions } from './key-pillar-interactions'

const natal: SajuResult = {
  ...calculateSaju({ birthDate: '1991-01-02', birthTime: null, gender: 'female', calendarType: 'solar', isLeapMonth: false }),
  year: { stem: '병', branch: '진', korean: '병진' },
  month: { stem: '병', branch: '오', korean: '병오' },
  day: { stem: '갑', branch: '자', korean: '갑자' },
}
const empty = (): LuckInteractionFacts => ({
  stemCombinations: [], branchClashes: [], branchCombinations: [],
  branchPunishments: [], branchBreaks: [], branchHarms: [],
})
const unaffected = { affected: false, byDaewoon: false, byAnnual: false, findings: [] }

describe('key pillar interaction phase 3', () => {
  it.each(['daewoon', 'annual'] as const)('%s 천간합을 dayStem에 출처와 함께 보존한다', (source) => {
    const luck = { stem: '기', branch: '인' }
    const interactions = analyzeLuckInteractions({ natal, ...(source === 'daewoon' ? { daewoon: luck } : { annualLuck: luck }) })
    const facts = analyzeKeyPillarInteractions({ interactions })
    expect(facts.dayStem).toEqual({
      affected: true, byDaewoon: source === 'daewoon', byAnnual: source === 'annual',
      findings: [{ ...interactions.stemCombinations[0], externalSource: source, origin: { collection: 'stemCombinations', index: 0 } }],
    })
    expect(facts.dayStem.findings[0].right.stem).toBe('기')
  })

  it('대운 지지 충은 dayBranch에만 기록한다', () => {
    const interactions = analyzeLuckInteractions({ natal, daewoon: { stem: '갑', branch: '오' } })
    const facts = analyzeKeyPillarInteractions({ interactions })
    expect(facts.dayBranch).toMatchObject({ affected: true, byDaewoon: true, byAnnual: false })
    expect(facts.dayBranch.findings).toEqual([{
      ...interactions.branchClashes[0], externalSource: 'daewoon', origin: { collection: 'branchClashes', index: 0 },
    }])
    expect(facts.dayStem).toEqual(unaffected)
  })

  it.each([['미', 'six-combination'], ['축', 'harm']])('세운 %s의 %s를 monthBranch에 기록한다', (branch, type) => {
    const facts = analyzeKeyPillarInteractions({ interactions: analyzeLuckInteractions({ natal, annualLuck: { stem: '갑', branch } }) })
    expect(facts.monthBranch).toMatchObject({ affected: true, byDaewoon: false, byAnnual: true })
    expect(facts.monthBranch.findings).toContainEqual(expect.objectContaining({ type, externalSource: 'annual', right: { source: { source: 'annual' }, branch } }))
  })

  it('year/hour와 운끼리의 관계는 보존하되 key flags에서 제외한다', () => {
    const interactions: LuckInteractionFacts = {
      ...empty(),
      stemCombinations: (['year', 'hour'] as const).map((pillar) => ({
        type: 'combination', left: { source: { source: 'natal', pillar }, stem: '갑' }, right: { source: { source: 'daewoon' }, stem: '기' },
      })),
      branchClashes: [{ type: 'clash', left: { source: { source: 'natal', pillar: 'hour' }, branch: '자' }, right: { source: { source: 'annual' }, branch: '오' } }],
      branchBreaks: [{ type: 'break', left: { source: { source: 'daewoon' }, branch: '사' }, right: { source: { source: 'annual' }, branch: '신' } }],
    }
    const before = structuredClone(interactions)
    expect(analyzeKeyPillarInteractions({ interactions })).toEqual({ dayStem: unaffected, dayBranch: unaffected, monthBranch: unaffected })
    expect(interactions).toEqual(before)
  })

  it('같은 자리에 대운과 세운이 동시에 관계하면 양쪽 flag와 근거를 유지한다', () => {
    const interactions = analyzeLuckInteractions({ natal, daewoon: { stem: '기', branch: '오' }, annualLuck: { stem: '기', branch: '축' } })
    const before = structuredClone(interactions)
    const facts = analyzeKeyPillarInteractions({ interactions })
    for (const fact of [facts.dayStem, facts.dayBranch]) {
      expect(fact).toMatchObject({ affected: true, byDaewoon: true, byAnnual: true })
      expect(fact.findings).toHaveLength(2)
    }
    expect(interactions).toEqual(before)
  })

  it('interaction 없음은 모두 false이며 hour null 원국도 안전하다', () => {
    expect(natal.hour).toEqual({ stem: null, branch: null, korean: null })
    expect(analyzeKeyPillarInteractions({ interactions: analyzeLuckInteractions({ natal }) }))
      .toEqual({ dayStem: unaffected, dayBranch: unaffected, monthBranch: unaffected })
  })

  it('세 글자가 모여도 punishment pair-only와 complete false를 그대로 전달한다', () => {
    const interactions = analyzeLuckInteractions({
      natal: { ...natal, day: { stem: '갑', branch: '인', korean: '갑인' } },
      daewoon: { stem: '갑', branch: '사' }, annualLuck: { stem: '갑', branch: '신' },
    })
    const findings = analyzeKeyPillarInteractions({ interactions }).dayBranch.findings.filter((finding) => finding.type === 'punishment')
    expect(findings).toHaveLength(2)
    for (const finding of findings) {
      expect(finding).toMatchObject({ scope: 'pair-only', kind: 'three-punishment', group: '인사신', complete: false })
      expect(finding).toMatchObject(interactions[finding.origin.collection][finding.origin.index])
    }
  })

  it('좌우 순서에 의존하지 않고 파를 전달하며 원국 내부 관계는 제외한다', () => {
    const interactions: LuckInteractionFacts = {
      ...empty(),
      branchBreaks: [{ type: 'break', left: { source: { source: 'annual' }, branch: '유' }, right: { source: { source: 'natal', pillar: 'day' }, branch: '자' } }],
      stemCombinations: [{ type: 'combination', left: { source: { source: 'natal', pillar: 'day' }, stem: '갑' }, right: { source: { source: 'natal', pillar: 'month' }, stem: '기' } }],
    }
    const facts = analyzeKeyPillarInteractions({ interactions })
    expect(facts.dayBranch).toEqual({ affected: true, byDaewoon: false, byAnnual: true, findings: [{
      ...interactions.branchBreaks[0], externalSource: 'annual', origin: { collection: 'branchBreaks', index: 0 },
    }] })
    expect(facts.dayStem).toEqual(unaffected)
    expect(facts.monthBranch).toEqual(unaffected)
  })
})

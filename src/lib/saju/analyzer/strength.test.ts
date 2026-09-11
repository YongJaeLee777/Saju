import { describe, expect, it } from 'vitest'
import type { HiddenStemRole, MonthCommandRelation, RootPillar, StrengthFacts } from '../types'
import { calculateSaju } from '../calculator'
import { buildAnalysisFacts } from './analysis-facts'
import { buildStrengthFacts } from './strength-facts'
import { assessStrength } from './strength'

function fixture(relation: MonthCommandRelation = 'same'): StrengthFacts {
  return {
    dayStem: '임', dayElement: '수', seasonal: { monthBranch: '자', monthElement: '수', relation },
    roots: { hasRoot: false, count: 0, byRole: { main: 0, middle: 0, residual: 0 }, byPillar: { year: false, month: false, day: false, hour: false }, findings: [] },
    support: { sameElement: { element: '수', surface: 1, hidden: 0 }, resourceElement: { element: '금', surface: 0, hidden: 0 } },
    drain: { outputElement: { element: '목', surface: 0, hidden: 0 }, wealthElement: { element: '화', surface: 0, hidden: 0 }, officerElement: { element: '토', surface: 0, hidden: 0 } },
  }
}

describe('assessStrength v1', () => {
  it('대표 실제 사주는 strong이며 각 점수를 보존한다', () => {
    const raw = calculateSaju({ birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false })
    const facts = buildStrengthFacts(raw, buildAnalysisFacts(raw))
    const before = structuredClone(facts)
    expect(assessStrength(facts)).toEqual({
      level: 'strong', confidence: 'medium', methodologyVersion: 'v1', reasons: expect.arrayContaining([expect.stringContaining('guardrail')]),
      score: { seasonal: 40, roots: 7.2, elementSupport: 12, elementPressure: 15.1, support: 59.2, pressure: 15.1, balance: 44.1 },
    })
    expect(facts).toEqual(before)
  })

  it('balanced 대표: 월령 -15와 생조 15가 상쇄된다', () => {
    const facts = fixture('iControl')
    facts.support.resourceElement.surface = 5
    expect(assessStrength(facts)).toMatchObject({ level: 'balanced', confidence: 'medium', score: { support: 15, pressure: 15, balance: 0 } })
  })

  it('weak 대표: controlsMe 무통근 무지원', () => {
    expect(assessStrength(fixture('controlsMe'))).toMatchObject({ level: 'weak', confidence: 'high', score: { balance: -30 } })
  })

  const seasons: [MonthCommandRelation, number][] = [['same', 40], ['generatesMe', 30], ['iGenerate', -20], ['iControl', -15], ['controlsMe', -30]]
  it.each(seasons)('월령 %s = %s', (relation, score) => {
    expect(assessStrength(fixture(relation)).score.seasonal).toBe(score)
  })

  const rootCases: [RootPillar, HiddenStemRole, number][] = [
    ['year', 'main', 8], ['month', 'main', 14], ['day', 'main', 12], ['hour', 'main', 10],
    ['year', 'middle', 4.8], ['month', 'middle', 8.4], ['day', 'middle', 7.2], ['hour', 'middle', 6],
    ['year', 'residual', 2.4], ['month', 'residual', 4.2], ['day', 'residual', 3.6], ['hour', 'residual', 3],
  ]
  it.each(rootCases)('통근 %s/%s = %s', (pillar, role, expected) => {
    const facts = fixture()
    facts.roots.findings = [{ pillar, role }]
    facts.roots.hasRoot = true
    facts.roots.count = 1
    facts.roots.byRole[role] = 1
    facts.roots.byPillar[pillar] = true
    expect(assessStrength(facts).score.roots).toBe(expected)
  })

  it('일간 자신은 surface에서 한 번만 제외하고 hidden은 유지한다', () => {
    const facts = fixture()
    facts.support.sameElement = { element: '수', surface: 2, hidden: 2 }
    facts.support.resourceElement = { element: '금', surface: 1, hidden: 3 }
    expect(assessStrength(facts).score.elementSupport).toBe(11)
    expect(assessStrength(fixture()).score.elementSupport).toBe(0)
  })

  it('output/wealth/officer의 surface와 hidden 계수를 적용한다', () => {
    const facts = fixture()
    for (const entry of Object.values(facts.drain)) { entry.surface = 1; entry.hidden = 1 }
    expect(assessStrength(facts).score.elementPressure).toBe(9.4)
  })

  it('통근·생조·소모는 각각 30 상한이며 support 총합에는 별도 상한이 없다', () => {
    const facts = fixture()
    facts.roots.findings = [
      { pillar: 'year', role: 'main' }, { pillar: 'month', role: 'main' },
      { pillar: 'day', role: 'main' }, { pillar: 'hour', role: 'main' },
    ]
    facts.support.resourceElement.surface = 20
    facts.drain.officerElement.surface = 20
    expect(assessStrength(facts).score).toEqual({ seasonal: 40, roots: 30, elementSupport: 30, elementPressure: 30, support: 100, pressure: 30, balance: 70 })
  })

  it.each([[14, 'balanced'], [15, 'strong'], [16, 'strong'], [-16, 'weak'], [-15, 'weak'], [-14, 'balanced']] as const)('balance %s 경계는 %s', (balance, level) => {
    const facts = fixture(balance > 0 ? 'generatesMe' : 'controlsMe')
    if (balance > 0) facts.drain.officerElement.hidden = 30 - balance
    else facts.support.resourceElement.hidden = 30 + balance
    expect(assessStrength(facts)).toMatchObject({ level, confidence: 'low', score: { balance } })
  })

  it('confidence 경계 거리 3은 low, 밖에서는 방향 일치 high·충돌 medium이다', () => {
    const near = fixture('controlsMe')
    near.support.resourceElement.hidden = 12
    expect(assessStrength(near).confidence).toBe('low')
    const aligned = fixture('same')
    expect(assessStrength(aligned).confidence).toBe('high')
    near.support.resourceElement.hidden = 11
    expect(assessStrength(near).confidence).toBe('medium')
  })

  it('guardrail은 새로운 숫자 없이 상한으로 보장된다', () => {
    const weakSeason = fixture('controlsMe')
    weakSeason.support.resourceElement.surface = 100
    expect(assessStrength(weakSeason)).toMatchObject({ level: 'balanced', score: { balance: 0 } })
    const sameSeason = fixture('same')
    sameSeason.drain.officerElement.surface = 100
    expect(assessStrength(sameSeason)).toMatchObject({ level: 'balanced', score: { balance: 10 } })
  })

  it('시간 미상은 기존 facts를 통해 시주 통근과 count가 제외된다', () => {
    const raw = calculateSaju({ birthDate: '1991-01-02', birthTime: null, gender: 'female', calendarType: 'solar', isLeapMonth: false })
    const facts = buildStrengthFacts(raw, buildAnalysisFacts(raw))
    expect(facts.roots.findings.every(({ pillar }) => pillar !== 'hour')).toBe(true)
    expect(assessStrength(facts)).toMatchObject({ level: 'strong', score: { elementPressure: 7.7, support: 59.2, balance: 51.5 } })
  })
})

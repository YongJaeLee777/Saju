import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { SajuResult } from '../types'
import { analyzeLuckInteractions } from './luck-interactions'

const base = calculateSaju({ birthDate: '1991-01-02', birthTime: null, gender: 'female', calendarType: 'solar', isLeapMonth: false })
const natal: SajuResult = {
  ...base,
  year: { stem: '갑', branch: '자', korean: '갑자' },
  month: { stem: '기', branch: '오', korean: '기오' },
  day: { stem: '갑', branch: '자', korean: '갑자' },
}

describe('luck interaction raw phase 1', () => {
  it('대운만: 여러 원국 천간합과 지지 충을 출처별로 보존한다', () => {
    const facts = analyzeLuckInteractions({ natal, daewoon: { stem: '기', branch: '오' } })
    expect(facts.stemCombinations).toEqual(['year', 'day'].map((pillar) => ({
      type: 'combination', left: { source: { source: 'natal', pillar }, stem: '갑' },
      right: { source: { source: 'daewoon' }, stem: '기' },
    })))
    expect(facts.branchClashes).toEqual(['year', 'day'].map((pillar) => ({
      type: 'clash', left: { source: { source: 'natal', pillar }, branch: '자' },
      right: { source: { source: 'daewoon' }, branch: '오' },
    })))
    expect(facts.branchPunishments).toContainEqual({
      type: 'punishment', kind: 'self-punishment', scope: 'pair-only',
      left: { source: { source: 'natal', pillar: 'month' }, branch: '오' },
      right: { source: { source: 'daewoon' }, branch: '오' },
    })
  })

  it('세운만: 원국과의 천간합 및 육합을 기록한다', () => {
    const facts = analyzeLuckInteractions({ natal, annualLuck: { stem: '기', branch: '축' } })
    expect(facts.stemCombinations).toHaveLength(2)
    expect(facts.stemCombinations.every(({ right }) => right.source.source === 'annual')).toBe(true)
    expect(facts.branchCombinations).toEqual(['year', 'day'].map((pillar) => ({
      type: 'six-combination', left: { source: { source: 'natal', pillar }, branch: '자' },
      right: { source: { source: 'annual' }, branch: '축' },
    })))
  })

  it('둘 다: 대운↔세운 천간합 및 파를 한 번만 기록한다', () => {
    const facts = analyzeLuckInteractions({ natal, daewoon: { stem: '정', branch: '사' }, annualLuck: { stem: '임', branch: '신' } })
    expect(facts.stemCombinations).toEqual([{
      type: 'combination', left: { source: { source: 'daewoon' }, stem: '정' },
      right: { source: { source: 'annual' }, stem: '임' },
    }])
    expect(facts.branchBreaks).toEqual([{
      type: 'break', left: { source: { source: 'daewoon' }, branch: '사' },
      right: { source: { source: 'annual' }, branch: '신' },
    }])
    expect(facts.branchCombinations).toHaveLength(1)
  })

  it('대운↔세운 해를 기존 표대로 계산한다', () => {
    const facts = analyzeLuckInteractions({ natal, daewoon: { stem: '갑', branch: '신' }, annualLuck: { stem: '갑', branch: '해' } })
    expect(facts.branchHarms).toContainEqual({
      type: 'harm', left: { source: { source: 'daewoon' }, branch: '신' },
      right: { source: { source: 'annual' }, branch: '해' },
    })
  })

  it('hour null은 제외하고 실제 시주가 있으면 포함한다', () => {
    const annualLuck = { stem: '임', branch: '유' }
    const missing = analyzeLuckInteractions({ natal, annualLuck })
    expect(Object.values(missing).flat().some(({ left }) => left.source.source === 'natal' && left.source.pillar === 'hour')).toBe(false)
    const known = analyzeLuckInteractions({ natal: { ...natal, hour: { stem: '정', branch: '묘', korean: '정묘' } }, annualLuck })
    expect(known.stemCombinations).toContainEqual({
      type: 'combination', left: { source: { source: 'natal', pillar: 'hour' }, stem: '정' },
      right: { source: { source: 'annual' }, stem: '임' },
    })
    expect(known.branchClashes).toHaveLength(1)
  })

  it('원국 내부 관계는 넣지 않으며 입력을 변경하지 않는다', () => {
    const before = structuredClone(natal)
    expect(Object.values(analyzeLuckInteractions({ natal })).every((findings) => findings.length === 0)).toBe(true)
    const facts = analyzeLuckInteractions({ natal, daewoon: { stem: '기', branch: '오' }, annualLuck: { stem: '갑', branch: '축' } })
    expect(Object.values(facts).flat().every(({ left, right }) => left.source.source !== 'natal' || right.source.source !== 'natal')).toBe(true)
    expect(natal).toEqual(before)
  })

  it.each([['인', '사', '신', '인사신'], ['축', '술', '미', '축술미']])('삼형 %s/%s/%s는 pair scope만 반환하며 전체 complete로 승격하지 않는다', (first, second, third, group) => {
    const facts = analyzeLuckInteractions({
      natal: { ...natal, year: { stem: '갑', branch: first, korean: `갑${first}` } },
      daewoon: { stem: '갑', branch: second }, annualLuck: { stem: '갑', branch: third },
    })
    expect(facts.branchPunishments).toHaveLength(3)
    expect(facts.branchPunishments.every((finding) => finding.kind === 'three-punishment'
      && finding.group === group && finding.complete === false && finding.scope === 'pair-only')).toBe(true)
  })

  it('자묘 mutual 형을 계산한다', () => {
    const facts = analyzeLuckInteractions({ natal, annualLuck: { stem: '갑', branch: '묘' } })
    expect(facts.branchPunishments).toHaveLength(2)
    expect(facts.branchPunishments.every(({ kind }) => kind === 'mutual-punishment')).toBe(true)
  })

  it.each(['진', '오', '유', '해'])('%s 자형은 서로 다른 대운/세운 출처 사이에서 검출한다', (branch) => {
    const facts = analyzeLuckInteractions({ natal, daewoon: { stem: '갑', branch }, annualLuck: { stem: '갑', branch } })
    expect(facts.branchPunishments.filter(({ left, right }) => left.source.source === 'daewoon' && right.source.source === 'annual'))
      .toEqual([{
        type: 'punishment', kind: 'self-punishment', scope: 'pair-only',
        left: { source: { source: 'daewoon' }, branch }, right: { source: { source: 'annual' }, branch },
      }])
  })
})

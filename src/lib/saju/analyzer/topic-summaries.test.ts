import { describe, expect, it } from 'vitest'
import type { InterpretationSignal, InterpretationSignals } from '../types'
import { buildTopicSummaries } from './topic-summaries'

function signal(overrides: Partial<InterpretationSignal> = {}): InterpretationSignal {
  return {
    code: 'career_change_pressure', topic: 'career', scope: 'background',
    direction: 'challenging', strength: 'medium', priority: 'high', evidence: [],
    methodologyVersion: 'interpretation-v1-alpha.3', ...overrides,
  }
}
function input(...signals: InterpretationSignal[]): InterpretationSignals {
  return { methodologyVersion: 'interpretation-v1-alpha.3', signals }
}

describe('topic summary v1', () => {
  it('기존 scope로만 분류하고 원본 signal 필드를 보존한다', () => {
    const background = signal()
    const annual = signal({ scope: 'annual', code: 'career_responsibility_pressure' })
    const reinforced = signal({ scope: 'reinforced' })
    const [summary] = buildTopicSummaries(input(annual, background, reinforced))
    expect(summary.backgroundSignals).toEqual([background])
    expect(summary.annualSignals).toEqual([annual])
    expect(summary.reinforcedSignals).toEqual([reinforced])
    expect(summary.methodologyVersion).toBe('topic-summary-v1')
  })

  it('topic 내 priority와 strength의 최댓값을 각각 선택한다', () => {
    const summaries = buildTopicSummaries(input(
      signal({ priority: 'high', strength: 'low' }),
      signal({ priority: 'low', strength: 'high', scope: 'annual' }),
      signal({ priority: 'medium', strength: 'medium', scope: 'reinforced' }),
      signal({ topic: 'money', code: 'money_resource_opportunity', priority: 'medium', strength: 'low' }),
    ))
    expect(summaries[0]).toMatchObject({ dominantPriority: 'high', dominantStrength: 'high' })
    expect(summaries[1]).toMatchObject({ dominantPriority: 'medium', dominantStrength: 'low' })
  })

  it('signalCodes만 중복 제거하고 최초 등장 순서를 유지한다', () => {
    const first = signal({ code: 'career_responsibility_pressure' })
    const second = signal({ scope: 'annual' })
    const [summary] = buildTopicSummaries(input(first, second, structuredClone(first)))
    expect(summary.signalCodes).toEqual(['career_responsibility_pressure', 'career_change_pressure'])
    expect(summary.backgroundSignals).toHaveLength(2)
    expect(summary.annualSignals).toHaveLength(1)
  })

  it('빈 topic을 제외하고 빈 입력은 빈 배열을 반환한다', () => {
    expect(buildTopicSummaries(input())).toEqual([])
    expect(buildTopicSummaries(input(signal())).map(({ topic }) => topic)).toEqual(['career'])
  })

  it('입력 topic 순서와 무관하게 고정 순서로 반환한다', () => {
    const summaries = buildTopicSummaries(input(
      signal({ topic: 'timing', code: 'timing_transition' }),
      signal({ topic: 'relationship', code: 'relationship_restructuring' }),
      signal({ topic: 'money', code: 'money_resource_management_pressure' }),
      signal(),
    ))
    expect(summaries.map(({ topic }) => topic)).toEqual(['career', 'money', 'relationship', 'timing'])
  })

  it('동일 입력에서 deterministic하며 중첩 evidence를 포함한 입력을 변경하지 않는다', () => {
    const supplied = input(signal({ evidence: [{
      kind: 'tenGod', id: 'tenGod:daewoon.stem', paths: ['flow.daewoon.stemTenGod'],
      source: { source: 'daewoon', position: 'stem' }, tenGod: '정관',
    }] }), signal({ scope: 'annual', code: 'career_responsibility_pressure' }))
    const before = structuredClone(supplied)
    const first = buildTopicSummaries(supplied)
    expect(buildTopicSummaries(supplied)).toEqual(first)
    expect(supplied).toEqual(before)
  })
})

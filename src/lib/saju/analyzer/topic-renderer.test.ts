import { describe, expect, it } from 'vitest'
import type { InterpretationSignal, InterpretationSignalCode, InterpretationTopic, SignalScope } from '../types'
import { buildTopicSummaries } from './topic-summaries'
import { renderTopicSummaries } from './topic-renderer'

const cases: [InterpretationSignalCode, InterpretationTopic, string][] = [
  ['career_change_pressure', 'career', '올해는 역할·업무 방식·환경의 재조정을 다시 살펴볼 여지가 있어요.'],
  ['career_responsibility_pressure', 'career', '올해는 맡은 책임과 역할의 분담을 다시 살펴볼 여지가 있어요.'],
  ['money_resource_opportunity', 'money', '올해는 자원의 활용과 배분에서 선택 기준을 정리해 볼 수 있어요.'],
  ['money_resource_management_pressure', 'money', '올해는 자원 관리와 배분의 우선순위에서 선택 기준을 정리해 볼 수 있어요.'],
  ['relationship_restructuring', 'relationship', '올해는 관계의 거리·역할·소통 방식을 돌아보는 계기로 삼아볼 수 있어요.'],
  ['timing_transition', 'timing', '올해는 여러 영역의 변화 요인이 동시에 겹치는 시기로 읽을 수 있어요.'],
]
function signal(code: InterpretationSignalCode, topic: InterpretationTopic, scope: SignalScope): InterpretationSignal {
  return { code, topic, scope, direction: 'mixed', strength: 'medium', priority: 'high',
    evidence: [], methodologyVersion: 'interpretation-v1-alpha.3' }
}
const summaries = (...signals: InterpretationSignal[]) => buildTopicSummaries({ methodologyVersion: 'interpretation-v1-alpha.3', signals })

describe('topic renderer v1.2', () => {
  it.each([
    ['background', '당분간 이어질 수 있는 배경', '당분간은'],
    ['annual', '올해 상대적으로 두드러질 수 있음', '올해는'],
    ['reinforced', '장기 요인과 올해 요인이 겹침', ''],
  ] as const)('%s scope 문구를 사용한다', (scope, label, prefix) => {
    const [result] = renderTopicSummaries(summaries(signal('career_change_pressure', 'career', scope)))
    expect(result).toEqual({ topic: 'career', headline: '역할과 업무 방식 돌아보기',
      body: scope === 'reinforced'
        ? '장기적으로 이어지는 배경에 올해의 여건도 함께 작용할 수 있어, 역할·업무 방식·환경의 재조정을 살펴보며 업무를 재정비해 볼 수 있어요.'
        : `${prefix} 역할·업무 방식·환경의 재조정을 다시 살펴볼 여지가 있어요.`,
      scopeLabel: label, methodologyVersion: 'topic-renderer-v1.2' })
  })

  it.each(cases)('%s 고정 문구와 topic을 보존한다', (code, topic, phrase) => {
    const [result] = renderTopicSummaries(summaries(signal(code, topic, 'annual')))
    expect(result.topic).toBe(topic)
    expect(result.body).toBe(phrase)
    expect(result.headline).toBe({ career: '역할과 업무 방식 돌아보기', money: '자원 배분과 선택 기준', relationship: '관계의 거리와 소통 조정', timing: '여러 변화 요인이 겹치는 시기' }[topic])
  })

  it('같은 topic/scope의 복수 signal을 한 문장으로 병합하고 중복 문구를 제거한다', () => {
    const first = signal('career_change_pressure', 'career', 'annual')
    const result = renderTopicSummaries(summaries(signal('career_responsibility_pressure', 'career', 'annual'), first, structuredClone(first)))
    expect(result).toHaveLength(1)
    expect(result[0].body).toBe('올해는 역할·업무 방식·환경의 재조정 및 맡은 책임과 역할의 분담을 다시 살펴볼 여지가 있어요.')
  })

  it('한 topic의 서로 다른 scope는 각각의 문장과 label로 유지한다', () => {
    const [result] = renderTopicSummaries(summaries(
      signal('money_resource_opportunity', 'money', 'reinforced'),
      signal('money_resource_management_pressure', 'money', 'background'),
    ))
    expect(result.scopeLabel).toBe('당분간 이어질 수 있는 배경 · 장기 요인과 올해 요인이 겹침')
    expect(result.body).toBe('당분간은 자원 관리와 배분의 우선순위에서 선택 기준을 정리해 볼 수 있어요. 자원의 활용과 배분에서 선택 기준을 정리할 때, 당분간 이어질 배경과 올해의 상황을 함께 고려해 볼 수 있어요.')
  })

  it('전체 문구에 금지 단정어와 예측 주제를 포함하지 않는다', () => {
    for (const scope of ['background', 'annual', 'reinforced'] as const) {
      const results = renderTopicSummaries(summaries(...cases.map(([code, topic]) => signal(code, topic, scope))))
      const text = results.map(({ headline, body, scopeLabel }) => `${headline} ${body} ${scopeLabel}`).join(' ')
      expect(text).not.toMatch(/반드시|확실히|이직|결혼|이별|돈\s*번다|건강|사고|수명|법률|투자|길흉|수입\s*확정|강화|흐름|주목해 볼 수 있어요/)
    }
  })

  it('deterministic하며 입력과 무관한 strength/priority/evidence로 문구를 바꾸지 않는다', () => {
    const input = summaries(...cases.map(([code, topic]) => signal(code, topic, 'annual')))
    const before = structuredClone(input)
    const first = renderTopicSummaries(input)
    expect(renderTopicSummaries(input)).toEqual(first)
    expect(input).toEqual(before)
    const changed = structuredClone(input)
    for (const summary of changed) {
      summary.dominantPriority = 'low'
      summary.dominantStrength = 'high'
      for (const item of summary.annualSignals) {
        item.priority = 'low'
        item.strength = 'high'
        item.direction = 'neutral'
        item.evidence.push({ kind: 'tenGod', id: 'sample', paths: [], source: { source: 'daewoon', position: 'stem' }, tenGod: '정관' })
      }
    }
    expect(renderTopicSummaries(changed)).toEqual(first)
  })

  it('빈 summaries는 빈 배열이다', () => {
    expect(renderTopicSummaries([])).toEqual([])
  })

  it.each([
    [[], '여러 영역의 변화 요인'],
    [['career'], '일 영역을 중심으로 한 변화 양상'],
    [['money'], '자원 관리 영역을 중심으로 한 변화 양상'],
    [['relationship'], '관계 영역을 중심으로 한 변화 양상'],
    [['career', 'money'], '일과 자원 관리 영역의 변화 양상'],
    [['career', 'relationship'], '일과 관계 영역의 변화 양상'],
    [['money', 'relationship'], '자원 관리와 관계 영역의 변화 양상'],
    [['career', 'money', 'relationship'], '일·자원 관리와 관계 영역의 변화 양상'],
  ] as const)('timing은 기존 topic %j만 영역 이름으로 사용한다', (topics, area) => {
    const input = summaries(signal('timing_transition', 'timing', 'reinforced'),
      ...cases.filter(([, topic]) => topics.some((selected) => selected === topic))
        .map(([code, topic]) => signal(code, topic, 'background')))
    const before = structuredClone(input)
    for (const scope of ['background', 'annual', 'reinforced'] as const) {
      const scoped = summaries(signal('timing_transition', 'timing', scope))
      const combined = [...input.filter(({ topic }) => topic !== 'timing'), ...scoped]
      const result = renderTopicSummaries(combined)
      const body = result.find(({ topic }) => topic === 'timing')?.body
      expect(body).toBe(scope === 'reinforced'
        ? `${area}이 장기 배경과 올해의 여건에 걸쳐 함께 나타날 수 있는 시기로 읽을 수 있어요.`
        : `${scope === 'annual' ? '올해는' : '당분간은'} ${area}이 동시에 겹치는 시기로 읽을 수 있어요.`)
      expect(renderTopicSummaries([...combined].reverse()).find(({ topic }) => topic === 'timing')?.body).toBe(body)
      expect(result.map(({ topic }) => topic)).toEqual(combined.map(({ topic }) => topic))
    }
    expect(input).toEqual(before)
  })

  it('reinforced는 topic마다 다른 문장으로 장기 배경과 올해를 함께 표현한다', () => {
    const results = renderTopicSummaries(summaries(...cases.map(([code, topic]) => signal(code, topic, 'reinforced'))))
    expect(new Set(results.map(({ body }) => body.split(' ')[0])).size).toBe(4)
    for (const result of results) {
      expect(result.body).toMatch(/장기|당분간|오래/)
      expect(result.body).toContain('올해')
      expect(result.body).not.toMatch(/요인|겹치는 가운데/)
    }
    expect(results.find(({ topic }) => topic === 'relationship')?.body).toBe(
      '관계의 거리·역할·소통 방식을 점검해 볼 수 있어요. 오래 이어지는 배경과 올해의 여건을 함께 살피는 관점이에요.')
  })
})

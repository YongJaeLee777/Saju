import type {
  InterpretationSignalCode, InterpretationTopic, RenderedTopicSummary, SignalScope, TopicSummary,
} from '../types'

const phrases: Record<InterpretationSignalCode, string> = {
  career_change_pressure: '역할·업무 방식·환경의 재조정',
  career_responsibility_pressure: '맡은 책임과 역할의 분담',
  money_resource_opportunity: '자원의 활용과 배분',
  money_resource_management_pressure: '자원 관리와 배분의 우선순위',
  relationship_restructuring: '관계의 거리·역할·소통 방식',
  timing_transition: '여러 영역의 변화 요인',
}
const headlines: Record<InterpretationTopic, string> = {
  career: '역할과 업무 방식 돌아보기', money: '자원 배분과 선택 기준',
  relationship: '관계의 거리와 소통 조정', timing: '여러 변화 요인이 겹치는 시기',
}
const scopeText: Record<SignalScope, { label: string; prefix: string }> = {
  background: { label: '당분간 이어질 수 있는 배경', prefix: '당분간은' },
  annual: { label: '올해 상대적으로 두드러질 수 있음', prefix: '올해는' },
  reinforced: { label: '장기 요인과 올해 요인이 겹침', prefix: '' },
}
const topicSentence: Record<InterpretationTopic, (text: string) => string> = {
  career: (text) => `${text}을 다시 살펴볼 여지가 있어요.`,
  money: (text) => `${text}에서 선택 기준을 정리해 볼 수 있어요.`,
  relationship: (text) => `${text}을 돌아보는 계기로 삼아볼 수 있어요.`,
  timing: (text) => `${text}이 동시에 겹치는 시기로 읽을 수 있어요.`,
}

const reinforcedSentence: Record<InterpretationTopic, (text: string) => string> = {
  career: (text) => `장기적으로 이어지는 배경에 올해의 여건도 함께 작용할 수 있어, ${text}을 살펴보며 업무를 재정비해 볼 수 있어요.`,
  money: (text) => `${text}에서 선택 기준을 정리할 때, 당분간 이어질 배경과 올해의 상황을 함께 고려해 볼 수 있어요.`,
  relationship: (text) => `${text}을 점검해 볼 수 있어요. 오래 이어지는 배경과 올해의 여건을 함께 살피는 관점이에요.`,
  timing: (text) => `${text}이 장기 배경과 올해의 여건에 걸쳐 함께 나타날 수 있는 시기로 읽을 수 있어요.`,
}

/** Timing names only topics already supplied; it does not infer new signals.
 * Strength, priority and evidence do not affect the text.
 * Mixed scopes retain separate clauses and all scope labels.
 */
export function renderTopicSummaries(summaries: readonly TopicSummary[]): RenderedTopicSummary[] {
  const areas = (['career', 'money', 'relationship'] as const)
    .filter((topic) => summaries.some((summary) => summary.topic === topic))
    .map((topic) => ({ career: '일', money: '자원 관리', relationship: '관계' })[topic])
  const timingText = areas.length === 0 ? phrases.timing_transition
    : `${areas.length === 1 ? `${areas[0]} 영역을 중심으로 한` : `${areas.slice(0, -1).join('·')}${areas[areas.length - 2] === '일' ? '과' : '와'} ${areas.at(-1)} 영역의`} 변화 양상`
  return summaries.map((summary) => {
    const signals = [...summary.backgroundSignals, ...summary.annualSignals, ...summary.reinforcedSignals]
    const sentences: string[] = []
    const labels: string[] = []
    for (const scope of ['background', 'annual', 'reinforced'] as const) {
      const codes = [...new Set(signals.filter((signal) => signal.scope === scope).map((signal) => signal.code))].sort()
      if (codes.length === 0) continue
      const text = codes.map((code) => code === 'timing_transition' ? timingText : phrases[code]).join(' 및 ')
      sentences.push(scope === 'reinforced' ? reinforcedSentence[summary.topic](text)
        : `${scopeText[scope].prefix} ${topicSentence[summary.topic](text)}`)
      labels.push(scopeText[scope].label)
    }
    return {
      topic: summary.topic,
      headline: headlines[summary.topic],
      body: sentences.join(' '),
      scopeLabel: labels.join(' · '),
      methodologyVersion: 'topic-renderer-v1.2',
    }
  })
}

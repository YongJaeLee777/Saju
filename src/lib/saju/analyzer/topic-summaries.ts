import type { InterpretationSignals, TopicSummary } from '../types'

/** Groups existing signals only. Within each scope, input order and original
 * signal objects are preserved; consumers should treat those objects as read-only.
 * Only signalCodes are deduplicated, in first-occurrence order.
 */
export function buildTopicSummaries(signals: InterpretationSignals): TopicSummary[] {
  const summaries: TopicSummary[] = []
  const levels = ['low', 'medium', 'high'] as const
  for (const topic of ['career', 'money', 'relationship', 'timing'] as const) {
    const members = signals.signals.filter((signal) => signal.topic === topic)
    if (members.length === 0) continue
    const summary: TopicSummary = {
      topic,
      backgroundSignals: [], annualSignals: [], reinforcedSignals: [],
      dominantPriority: 'low', dominantStrength: 'low',
      signalCodes: [...new Set(members.map((signal) => signal.code))],
      methodologyVersion: 'topic-summary-v1',
    }
    for (const signal of members) {
      if (signal.scope === 'background') summary.backgroundSignals.push(signal)
      else if (signal.scope === 'annual') summary.annualSignals.push(signal)
      else summary.reinforcedSignals.push(signal)
      if (levels.indexOf(signal.priority) > levels.indexOf(summary.dominantPriority)) {
        summary.dominantPriority = signal.priority
      }
      if (levels.indexOf(signal.strength) > levels.indexOf(summary.dominantStrength)) {
        summary.dominantStrength = signal.strength
      }
    }
    summaries.push(summary)
  }
  return summaries
}

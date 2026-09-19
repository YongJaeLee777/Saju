import 'astro:env/server'
import { calculateSaju, calculateAnnualLuck } from '../calculator'
import { analyzeDaewoon } from '../analyzer/daewoon'
import { buildAnalysisFacts } from '../analyzer/analysis-facts'
import { buildStrengthFacts } from '../analyzer/strength-facts'
import { assessStrength } from '../analyzer/strength'
import { analyzeLuckInteractions } from '../analyzer/luck-interactions'
import { analyzeLuckFlow } from '../analyzer/luck-flow'
import { analyzeKeyPillarInteractions } from '../analyzer/key-pillar-interactions'
import { buildInterpretationFacts } from '../analyzer/interpretation-facts'
import { buildInterpretationSignals } from '../analyzer/interpretation-signals'
import { buildTopicSummaries } from '../analyzer/topic-summaries'
import { renderTopicSummaries } from '../analyzer/topic-renderer'
import { buildDeterministicReport } from '../analyzer/deterministic-report'
import type { SajuInput } from '../types'

const kstDate = (instant: number) => new Date(instant + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
const kstDateTime = (value: string) => new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ')
const periodLabel = (start: string, end: string) => `${kstDateTime(start)} ~ ${kstDateTime(end)} (한국시간, 종료 시각 미포함)`

/** Server-only composition. The page receives display fields, never raw evidence.
 * Select current daewoon by exact [start, end); annual luck is explicitly 2026.
 */
export function buildResultPageData(input: SajuInput, now: Date = new Date()) {
  const instant = now.getTime()
  if (!Number.isFinite(instant)) throw new RangeError('유효하지 않은 기준 시각입니다.')
  const natal = calculateSaju(input)
  const daewoonResult = analyzeDaewoon(input, natal)
  const daewoon = daewoonResult.cycles.find((cycle) => cycle.startDateTime !== null && cycle.endDateTime !== null
    && Date.parse(cycle.startDateTime) <= instant && instant < Date.parse(cycle.endDateTime))
  const annualLuck = calculateAnnualLuck(2026, natal.day.stem)
  const strength = assessStrength(buildStrengthFacts(natal, buildAnalysisFacts(natal)))
  const args = { natal, daewoon, annualLuck }
  const interactions = analyzeLuckInteractions(args)
  const flow = analyzeLuckFlow(args)
  const keyPillars = analyzeKeyPillarInteractions({ interactions })
  const facts = buildInterpretationFacts({ ...args, strength, interactions, flow, keyPillars })
  const signals = buildInterpretationSignals(facts)
  const summaries = buildTopicSummaries(signals)
  const topics = renderTopicSummaries(summaries)
  const report = buildDeterministicReport({
    topics,
    provenance: summaries.map((summary) => ({
      topic: summary.topic,
      signals: [...summary.backgroundSignals, ...summary.annualSignals, ...summary.reinforcedSignals],
      sourceSignalCodes: summary.signalCodes,
      dominantStrength: summary.dominantStrength,
      dominantPriority: summary.dominantPriority,
    })),
    luck: {
      referenceDate: kstDate(instant),
      currentDaewoon: daewoon?.startDateTime && daewoon.endDateTime
        ? { label: daewoon.korean, periodLabel: periodLabel(daewoon.startDateTime, daewoon.endDateTime) } : null,
      currentAnnualLuck: { year: 2026, label: annualLuck.korean,
        periodLabel: periodLabel(annualLuck.startDateTime, annualLuck.endDateTime) },
    },
    methodologyVersions: {
      strength: strength.methodologyVersion, interpretation: signals.methodologyVersion,
      topicSummary: 'topic-summary-v1', topicRenderer: 'topic-renderer-v1.2',
    },
    edition: 'free',
  })
  return {
    pillars: (['year', 'month', 'day', 'hour'] as const).map((key) => ({
      stem: natal[key].stem, branch: natal[key].branch,
    })),
    luck: report.luck,
    daewoonNotice: daewoon ? null : !input.birthTime
      ? '출생시간을 몰라 현재 대운을 확정할 수 없습니다.'
      : '기준 시각에 해당하는 대운 정보를 확인할 수 없습니다.',
    report: {
      title: report.title, intro: report.intro, closing: report.closing,
      sections: report.sections.map(({ topic, headline, body, scopeLabel }) => ({ topic, headline, body, scopeLabel })),
    },
  }
}

import { describe, expect, it } from 'vitest'
import type { DeterministicReportInput, InterpretationSignal } from '../types'
import { buildDeterministicReport } from './deterministic-report'
import { buildTopicSummaries } from './topic-summaries'
import { renderTopicSummaries } from './topic-renderer'

function fixture(): DeterministicReportInput {
  const signals: InterpretationSignal[] = [
    { code: 'money_resource_opportunity', topic: 'money', scope: 'background', direction: 'neutral',
      strength: 'low', priority: 'medium', methodologyVersion: 'interpretation-v1-alpha.3',
      evidence: [{ kind: 'tenGod', id: 'resource', paths: ['flow.daewoon.stemTenGod'],
        source: { source: 'daewoon', position: 'stem' }, tenGod: '정재' }] },
    { code: 'career_change_pressure', topic: 'career', scope: 'annual', direction: 'mixed',
      strength: 'high', priority: 'high', methodologyVersion: 'interpretation-v1-alpha.3', evidence: [] },
  ]
  const summaries = buildTopicSummaries({ methodologyVersion: 'interpretation-v1-alpha.3', signals }).reverse()
  return {
    topics: renderTopicSummaries(summaries),
    provenance: summaries.map((summary) => ({
      topic: summary.topic,
      signals: [...summary.backgroundSignals, ...summary.annualSignals, ...summary.reinforcedSignals],
      sourceSignalCodes: summary.signalCodes,
      dominantStrength: summary.dominantStrength,
      dominantPriority: summary.dominantPriority,
    })),
    luck: { referenceDate: '2026-09-14',
      currentDaewoon: { label: '표시용 대운', periodLabel: '제공된 대운 기간' },
      currentAnnualLuck: { year: 2026, label: '표시용 세운', periodLabel: '제공된 세운 기간' } },
    methodologyVersions: { strength: 'v1', interpretation: 'interpretation-v1-alpha.3',
      topicSummary: 'topic-summary-v1', topicRenderer: 'topic-renderer-v1.2' },
    edition: 'free',
  }
}

describe('buildDeterministicReport', () => {
  it.each(['free', 'paid'] as const)('%s report preserves sections and metadata with fixed framing', (edition) => {
    const input = { ...fixture(), edition }
    const report = buildDeterministicReport(input)
    expect(report).toEqual({
      title: '주제별 사주 요약', intro: '제공된 주제별 요약을 모았습니다.',
      sections: input.topics, closing: '제공된 요약 안내를 마칩니다.',
      sourceSignalCodes: ['money_resource_opportunity', 'career_change_pressure'],
      provenance: input.provenance, luck: input.luck,
      methodologyVersions: input.methodologyVersions, edition,
    })
    expect(report.sections.map(({ topic }) => topic)).toEqual(['money', 'career'])
  })

  it('returns empty sections and a neutral notice for no topics', () => {
    const report = buildDeterministicReport({ ...fixture(), topics: [], provenance: [] })
    expect(report.sections).toEqual([])
    expect(report.provenance).toEqual([])
    expect(report.sourceSignalCodes).toEqual([])
    expect(report.intro).toBe('제공된 요약 항목이 없습니다.')
    expect(report.title).toBe('주제별 사주 요약')
    expect(report.closing).toBe('제공된 요약 안내를 마칩니다.')
  })

  it('deduplicates codes in first appearance order without sorting or changing provenance', () => {
    const input = fixture()
    const first = input.provenance[0]
    const second = input.provenance[1]
    const provenance = [
      { ...first, sourceSignalCodes: [...first.sourceSignalCodes, ...first.sourceSignalCodes] },
      second, first,
    ]
    const report = buildDeterministicReport({ ...input, provenance })
    expect(report.sourceSignalCodes).toEqual(['money_resource_opportunity', 'career_change_pressure'])
    expect(report.provenance).toEqual(provenance)
  })

  it('preserves source signals including scope, direction, strength, priority and nested evidence', () => {
    const input = fixture()
    const report = buildDeterministicReport(input)
    expect(report.provenance).toEqual(input.provenance)
    expect(report.provenance).not.toBe(input.provenance)
    expect(report.provenance[0].signals[0].evidence).not.toBe(input.provenance[0].signals[0].evidence)
  })

  it('preserves null luck metadata without inferring values', () => {
    const luck = { referenceDate: '2026-09-14', currentDaewoon: null, currentAnnualLuck: null }
    expect(buildDeterministicReport({ ...fixture(), luck }).luck).toEqual(luck)
  })

  it('is deterministic and does not mutate or share mutable nested source data', () => {
    const input = fixture()
    const before = structuredClone(input)
    const report = buildDeterministicReport(input)
    expect(buildDeterministicReport(input)).toEqual(report)
    expect(input).toEqual(before)
    expect(report.sections).not.toBe(input.topics)
    expect(report.sections[0]).not.toBe(input.topics[0])
    expect(report.luck).not.toBe(input.luck)
    expect(report.methodologyVersions).not.toBe(input.methodologyVersions)
    report.provenance[0].signals[0].evidence[0].paths.push('changed')
    expect(input).toEqual(before)
    expect(buildDeterministicReport(input)).toEqual(buildDeterministicReport(before))
  })
})

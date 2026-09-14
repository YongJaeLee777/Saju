import type { DeterministicReport, DeterministicReportInput } from '../types'

/** Assemble supplied results only. Provenance must describe the supplied topics.
 * Codes follow provenance order, then each sourceSignalCodes array's order.
 * Copies keep subsequent report edits from affecting the source data.
 * Edition is a display classification, not proof of payment or authorization.
 */
export function buildDeterministicReport(input: DeterministicReportInput): DeterministicReport {
  return {
    title: '주제별 사주 요약',
    intro: input.topics.length === 0
      ? '제공된 요약 항목이 없습니다.'
      : '제공된 주제별 요약을 모았습니다.',
    sections: structuredClone(input.topics),
    closing: '제공된 요약 안내를 마칩니다.',
    sourceSignalCodes: [...new Set(input.provenance.flatMap((item) => item.sourceSignalCodes))],
    provenance: structuredClone(input.provenance),
    luck: structuredClone(input.luck),
    methodologyVersions: structuredClone(input.methodologyVersions),
    edition: input.edition,
  }
}

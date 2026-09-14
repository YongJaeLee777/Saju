import { describe, expect, it } from 'vitest'
import type { DeterministicReport } from '../types'
import { buildLlmReportPrompt, validateLlmReportResponse, LLM_REPORT_LIMITS } from './llm-report'

function fixture(): DeterministicReport {
  return {
    title: '주제별 사주 요약', intro: '제공된 요약입니다.', closing: '요약 안내를 마칩니다.',
    sections: [
      { topic: 'money', headline: '자원 배분', body: '당분간은 자원 배분을 살펴볼 여지가 있어요.', scopeLabel: '장기 배경', methodologyVersion: 'topic-renderer-v1.2' },
      { topic: 'career', headline: '역할과 업무', body: '올해는 역할을 다시 살펴볼 여지가 있어요.', scopeLabel: '올해', methodologyVersion: 'topic-renderer-v1.2' },
    ],
    sourceSignalCodes: ['money_resource_opportunity', 'career_change_pressure'],
    provenance: [{ topic: 'money', sourceSignalCodes: ['money_resource_opportunity'], dominantStrength: 'low', dominantPriority: 'medium',
      signals: [{ topic: 'money', code: 'money_resource_opportunity', scope: 'background', strength: 'low', priority: 'medium', direction: 'neutral',
        methodologyVersion: 'interpretation-v1-alpha.3', evidence: [{ kind: 'tenGod', id: 'PRIVATE_EVIDENCE', paths: ['PRIVATE_PATH'], source: { source: 'daewoon', position: 'stem' }, tenGod: '정재' }] }] },
    { topic: 'career', sourceSignalCodes: ['career_change_pressure'], dominantStrength: 'high', dominantPriority: 'high', signals: [] }],
    luck: { referenceDate: '2026-09-14', currentDaewoon: null, currentAnnualLuck: null },
    methodologyVersions: { strength: 'v1', interpretation: 'interpretation-v1-alpha.3', topicSummary: 'topic-summary-v1', topicRenderer: 'topic-renderer-v1.2' },
    edition: 'paid',
  }
}

function draft(input = fixture()) {
  return { title: input.title, intro: input.intro,
    sections: input.sections.map(({ headline, body }) => ({ headline, body })), closing: input.closing }
}

describe('LLM report safety', () => {
  it.each(['살펴볼 수 있어요.', '살펴볼 수 있습니다.', '살펴볼 여지가 있어요.', '변화 가능성이 있습니다.'])('rejects loss of uncertainty from %s', (body) => {
    const input = { ...fixture(), sections: [{ ...fixture().sections[0], body }] }
    const response = { ...draft(input), sections: [{ headline: input.sections[0].headline, body: '변화가 이어집니다.' }] }
    expect(validateLlmReportResponse(input, response)).toEqual({ valid: false, fallback: 'deterministic', reason: 'uncertainty-reduced', report: input })
  })

  it('allows equivalent uncertainty and sentence restructuring', () => {
    const input = fixture()
    const response = draft(input)
    response.sections[0].body = '당분간 자원 배분을 돌아볼 수 있습니다.'
    expect(validateLlmReportResponse(input, response).valid).toBe(true)
  })

  it('rejects the Terra regression even when a final reading hedge remains', () => {
    const body = '변화가 함께 나타날 수 있는 시기로 읽을 수 있어요.'
    const input = { ...fixture(), sections: [{ ...fixture().sections[0], body }] }
    const response = draft(input)
    response.sections[0].body = '변화가 함께 나타나는 시기로 읽을 수 있어요.'
    expect(validateLlmReportResponse(input, response)).toMatchObject({ valid: false, reason: 'uncertainty-reduced', report: input })
  })

  it.each(['해야 한다', '조정한다', '실행한다', '조정하는 방향으로 재정비해 볼 수 있어요'])('rejects stronger advice: %s', (advice) => {
    const input = fixture()
    const response = draft(input)
    response.sections[0].body = `당분간 살펴볼 여지가 있어요. ${advice}`
    expect(validateLlmReportResponse(input, response)).toMatchObject({ valid: false, reason: 'advice-strengthened', report: input })
  })

  it.each(['변화가 발생합니다.', '영향이 강화됩니다.', '결과는 확정입니다.', '변화가 나타납니다.'])('rejects new certainty even with another hedge: %s', (claim) => {
    const input = fixture()
    const response = draft(input)
    response.sections[0].body += ` ${claim}`
    expect(validateLlmReportResponse(input, response)).toMatchObject({ valid: false, reason: 'certainty-strengthened', report: input })
  })

  it('checks headlines and framing too, without borrowing uncertainty from another field', () => {
    for (const field of ['title', 'intro', 'closing'] as const) {
      const input = { ...fixture(), [field]: '살펴볼 여지가 있어요.' }
      expect(validateLlmReportResponse(input, { ...draft(input), [field]: '살펴봅니다.' })).toMatchObject({ valid: false, reason: 'uncertainty-reduced' })
    }
    const input = fixture()
    const response = draft(input)
    response.sections[0].headline = '배분을 실행한다'
    expect(validateLlmReportResponse(input, response)).toMatchObject({ valid: false, reason: 'advice-strengthened' })
  })

  it('does not reject unchanged source wording or mutate inputs on semantic fallback', () => {
    const input = fixture()
    const before = structuredClone(input)
    expect(validateLlmReportResponse(input, draft(input)).valid).toBe(true)
    const response = draft(input)
    response.sections[0].body = '실행한다'
    const responseBefore = structuredClone(response)
    const result = validateLlmReportResponse(input, response)
    expect(result.valid).toBe(false)
    expect(result.report).toEqual(before)
    expect(result.report).not.toBe(input)
    expect(input).toEqual(before)
    expect(response).toEqual(responseBefore)
  })

  it('projects only allowed prompt data, including topic-specific codes and null metadata', () => {
    const input = { ...fixture(), birthDate: 'PRIVATE_BIRTH', natal: 'PRIVATE_NATAL' }
    const prompt = buildLlmReportPrompt(input)
    const data = JSON.parse(prompt.user.slice(prompt.user.indexOf('\n') + 1))
    expect(Object.keys(data)).toEqual(['title', 'intro', 'sections', 'closing', 'luck', 'methodologyVersions'])
    expect(data.sections[0]).toEqual({ topic: 'money', headline: input.sections[0].headline, body: input.sections[0].body, sourceSignalCodes: ['money_resource_opportunity'] })
    expect(data.luck).toEqual(input.luck)
    expect(data.methodologyVersions).toEqual(input.methodologyVersions)
    expect(prompt.user).not.toMatch(/PRIVATE_|evidence|signals|dominantStrength|dominantPriority|edition/)
    expect(prompt.system).toContain('자연화')
    expect(prompt.system).toContain('scope/strength/priority/direction')
  })

  it('prompt explicitly requires one JSON object in both instructions and API input', () => {
    const prompt = buildLlmReportPrompt(fixture())
    for (const text of [prompt.system, prompt.user.split('\n')[0]]) {
      expect(text).toContain('유효한 JSON object 하나만 반환')
      expect(text).toContain('설명/markdown/code fence를 금지')
      expect(text).toContain('기존 허용 필드만 사용')
    }
  })

  it('prompt requests structural rewriting, varied wording and concise headlines without changing meaning', () => {
    const { system } = buildLlmReportPrompt(fixture())
    for (const instruction of [
      '복사하거나 어미만 바꾸지 말고', '의미·scope를 유지하면서 문장 구조를 적극적으로 재구성',
      '같은 표현과 어미의 반복을 최소화', '“~할 수 있습니다”, “~볼 수 있습니다”, “여건/배경/요인”',
      '한 문장이 너무 길면 나누거나 간결하게', 'topic별로 원문에 있는 어휘를 활용해 문장 리듬을 구분',
      'headline도 원래 의미 범위 안에서', '출력 길이는 deterministic 대비 과도하게 늘리지',
    ]) expect(system).toContain(instruction)
  })

  it('prompt prioritizes scope and uncertainty over stylistic changes and prohibits new claims', () => {
    const { system } = buildLlmReportPrompt(fixture())
    for (const instruction of [
      '가능성 표현을 단정으로 바꾸지', '서로 다른 scope를 합치지',
      '자연화보다 의미·scope·불확실성 보존을 우선', '새로운 조언/사건/예측/강도 상승은 금지',
      'topic 추가/삭제/병합/재정렬 및 scope/strength/priority/direction 변경을 금지',
    ]) expect(system).toContain(instruction)
  })

  it('accepts text edits and preserves topic order, provenance, versions, edition and metadata', () => {
    const input = fixture()
    const response = draft(input)
    response.sections[0].body = '당분간은 자원 배분을 돌아볼 여지가 있어요.'
    const result = validateLlmReportResponse(input, JSON.stringify(response))
    expect(result.valid).toBe(true)
    expect(result.report).toEqual({ ...input, sections: input.sections.map((section, i) => ({ ...section, ...response.sections[i] })) })
    if (result.valid) expect(result.semanticGuarantee).toBe(false)
  })

  it('rejects unknown fields at every response level, including protected topic and metadata', () => {
    for (const field of ['topic', 'scope', 'strength', 'priority', 'direction', 'sourceSignalCodes', 'provenance', 'methodologyVersions', 'edition']) {
      for (const response of [
        { ...draft(), [field]: 'changed' },
        { ...draft(), sections: draft().sections.map((section) => ({ ...section, [field]: 'changed' })) },
      ]) {
        expect(validateLlmReportResponse(fixture(), response).valid).toBe(false)
      }
    }
  })

  it('rejects missing, non-string, empty and whitespace-only required fields', () => {
    for (const value of [undefined, null, 42, {}, [], '', ' \n ']) {
      for (const field of ['title', 'intro', 'closing']) {
        expect(validateLlmReportResponse(fixture(), { ...draft(), [field]: value }).valid).toBe(false)
      }
      for (const field of ['headline', 'body']) {
        expect(validateLlmReportResponse(fixture(), { ...draft(), sections: draft().sections.map((s) => ({ ...s, [field]: value })) }).valid).toBe(false)
      }
    }
    expect(validateLlmReportResponse(fixture(), { title: '제목', sections: [], closing: '끝' }).valid).toBe(false)
  })

  it('enforces each text length limit including its exact boundary', () => {
    for (const field of ['title', 'intro', 'closing', 'headline', 'body'] as const) {
      for (const extra of [0, 1]) {
        const hedge = field === 'body' ? ' 여지가 있어요.' : ''
        const text = '가'.repeat(LLM_REPORT_LIMITS[field] + extra - hedge.length) + hedge
        const response = field === 'headline' || field === 'body'
          ? { ...draft(), sections: draft().sections.map((s) => ({ ...s, [field]: text })) }
          : { ...draft(), [field]: text }
        expect(validateLlmReportResponse(fixture(), response).valid).toBe(extra === 0)
      }
    }
  })

  it('rejects malformed JSON, non-objects, excessive raw responses and wrong section counts', () => {
    for (const response of ['{', '```json\n{}\n```', null, [], 4, ' '.repeat(40001),
      { ...draft(), sections: [] }, { ...draft(), sections: [...draft().sections, draft().sections[0]] },
      { ...draft(), sections: null }, { ...draft(), sections: [null, null] }]) {
      const result = validateLlmReportResponse(fixture(), response)
      expect(result.valid).toBe(false)
      expect(result.report).toEqual(fixture())
    }
  })

  it('rejects prohibited expressions anywhere and falls back for the entire report', () => {
    for (const text of ['반드시 성공해요', '이직합니다', '결혼합니다', '이별합니다', '수입 확정', '길흉', '내년에는', '10월에', '결\u200b혼', '수입・확정']) {
      for (const field of ['title', 'intro', 'closing', 'headline', 'body']) {
        const response = field === 'headline' || field === 'body'
          ? { ...draft(), sections: draft().sections.map((s) => ({ ...s, [field]: text })) }
          : { ...draft(), [field]: text }
        expect(validateLlmReportResponse(fixture(), response)).toEqual({
          valid: false, fallback: 'deterministic', reason: 'forbidden-expression', report: fixture(),
        })
      }
    }
  })

  it('allows an empty report only with empty sections', () => {
    const input = { ...fixture(), sections: [], provenance: [], sourceSignalCodes: [] }
    expect(validateLlmReportResponse(input, draft(input)).valid).toBe(true)
    expect(validateLlmReportResponse(input, draft()).valid).toBe(false)
    expect(JSON.parse(buildLlmReportPrompt(input).user.split('\n')[1]).sections).toEqual([])
  })

  it('projects non-null display metadata without nested extra fields', () => {
    const input = { ...fixture(), luck: { referenceDate: '2026-09-14',
      currentDaewoon: { label: '대운', periodLabel: '기간', birthDate: 'PRIVATE_BIRTH' },
      currentAnnualLuck: { year: 2026, label: '세운', periodLabel: '기간', evidence: 'PRIVATE_EVIDENCE' } } }
    expect(JSON.parse(buildLlmReportPrompt(input).user.split('\n')[1]).luck).toEqual({ referenceDate: '2026-09-14',
      currentDaewoon: { label: '대운', periodLabel: '기간' },
      currentAnnualLuck: { year: 2026, label: '세운', periodLabel: '기간' } })
  })

  it('is deterministic and leaves both inputs untouched on success and failure', () => {
    const input = fixture()
    const before = structuredClone(input)
    const response = draft(input)
    const responseBefore = structuredClone(response)
    expect(buildLlmReportPrompt(input)).toEqual(buildLlmReportPrompt(input))
    expect(validateLlmReportResponse(input, response)).toEqual(validateLlmReportResponse(input, response))
    for (const result of [validateLlmReportResponse(input, response), validateLlmReportResponse(input, {})]) {
      result.report.provenance[0].signals[0].evidence[0].paths.push('changed')
    }
    expect(input).toEqual(before)
    expect(response).toEqual(responseBefore)
  })
})

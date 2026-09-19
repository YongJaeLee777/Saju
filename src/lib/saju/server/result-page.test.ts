import { describe, expect, it, vi } from 'vitest'
import { buildResultPageData } from './result-page'
import type { SajuInput } from '../types'

vi.mock('astro:env/server', () => ({}))

const example: SajuInput = {
  birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false,
}
const now = new Date('2026-09-13T00:00:00+09:00')

describe('result page deterministic pipeline', () => {
  it.each([
    { input: example, daewoon: '을유', topics: ['career', 'money', 'timing'] },
    { input: { ...example, birthDate: '1992-01-02', birthTime: '22:55', gender: 'male' as const }, daewoon: '정유', topics: ['career', 'relationship', 'timing'] },
    { input: { ...example, birthDate: '1992-02-13', birthTime: '21:30', gender: 'male' as const }, daewoon: '을사', topics: ['career', 'timing'] },
  ])('composes $input.birthDate into current luck and ordered report topics', ({ input, daewoon, topics }) => {
    const before = structuredClone(input)
    const result = buildResultPageData(input, now)
    expect(result.pillars).toHaveLength(4)
    expect(result.luck.referenceDate).toBe('2026-09-13')
    expect(result.luck.currentDaewoon?.label).toBe(daewoon)
    expect(result.luck.currentAnnualLuck).toMatchObject({ year: 2026, label: '병오' })
    expect(result.report.sections.map(({ topic }) => topic)).toEqual(topics)
    expect(result.report).toMatchObject({ title: '주제별 사주 요약', intro: '제공된 주제별 요약을 모았습니다.', closing: '제공된 요약 안내를 마칩니다.' })
    expect(result.report.sections.every(({ headline, body }) => headline.length > 0 && body.length > 0)).toBe(true)
    expect(Object.keys(result)).toEqual(['pillars', 'luck', 'daewoonNotice', 'report'])
    expect(Object.keys(result.report)).toEqual(['title', 'intro', 'closing', 'sections'])
    expect(result.report.sections.every((section) => Object.keys(section).join(',') === 'topic,headline,body,scopeLabel')).toBe(true)
    expect(result.report.sections.every(({ scopeLabel }) => scopeLabel.split(' · ').every((label) => [
      '당분간 이어질 수 있는 배경', '올해 상대적으로 두드러질 수 있음', '장기 요인과 올해 요인이 겹침',
    ].includes(label)))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/evidence|provenance|strength|signals|birthDate/)
    expect(buildResultPageData(input, now)).toEqual(result)
    expect(input).toEqual(before)
  })

  it('keeps unknown birth time unknown without estimating a current daewoon', () => {
    const result = buildResultPageData({ ...example, birthTime: null }, now)
    expect(result.pillars[3]).toEqual({ stem: null, branch: null })
    expect(result.luck.currentDaewoon).toBeNull()
    expect(result.daewoonNotice).toBe('출생시간을 몰라 현재 대운을 확정할 수 없습니다.')
    expect(result.luck.currentAnnualLuck?.year).toBe(2026)
    expect(result.report.sections.every(({ body }) => !/장기|당분간/.test(body))).toBe(true)
  })

  it('selects daewoon at the exact boundary and keeps annual luck fixed at 2026', () => {
    const boundary = Date.parse('2029-08-06T17:04:00.000+09:00')
    const before = buildResultPageData(example, new Date(boundary - 1))
    const at = buildResultPageData(example, new Date(boundary))
    expect(before.luck.currentDaewoon?.label).toBe('을유')
    expect(at.luck.currentDaewoon?.label).toBe('갑신')
    expect(at.luck.currentAnnualLuck?.year).toBe(2026)
    expect(at.luck.currentDaewoon?.periodLabel).toContain('2029-08-06 17:04')
  })
})

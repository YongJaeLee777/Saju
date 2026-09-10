import { describe, expect, it } from 'vitest'
import type { SajuResult } from '../types'
import { analyzeBranchPunishments } from './branch-punishments'

function fixture(year: string, month: string, day: string, hour: string | null = null): Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'> {
  const pillar = (branch: string) => ({ stem: '갑', branch, korean: `갑${branch}` })
  return {
    year: pillar(year), month: pillar(month), day: pillar(day),
    hour: hour === null ? { stem: null, branch: null, korean: null } : pillar(hour),
  }
}

describe('analyzeBranchPunishments', () => {
  it.each([
    ['인', '사', '인사신'], ['사', '신', '인사신'], ['신', '인', '인사신'],
    ['축', '술', '축술미'], ['술', '미', '축술미'], ['미', '축', '축술미'],
  ])('%s·%s 부분 형을 양방향 위치 쌍별로 기록한다', (first, second, group) => {
    expect(analyzeBranchPunishments(fixture(first, second, first))).toEqual({
      hasPunishment: true,
      findings: [
        { type: 'three-punishment', group, complete: false, pillars: ['year', 'month'], branches: [first, second] },
        { type: 'three-punishment', group, complete: false, pillars: ['month', 'day'], branches: [second, first] },
      ],
    })
  })

  it.each([
    ['인', '사', '신', '인사신'], ['축', '술', '미', '축술미'],
  ])('%s·%s·%s complete는 pair 없이 한 건으로 통합한다', (a, b, c, group) => {
    expect(analyzeBranchPunishments(fixture(c, a, b))).toEqual({
      hasPunishment: true,
      findings: [{ type: 'three-punishment', group, complete: true, pillars: ['year', 'month', 'day'], branches: [c, a, b] }],
    })
  })

  it('complete에서 반복 지지의 위치도 모두 보존하고 한 건만 기록한다', () => {
    expect(analyzeBranchPunishments(fixture('인', '사', '인', '신')).findings).toEqual([
      { type: 'three-punishment', group: '인사신', complete: true, pillars: ['year', 'month', 'day', 'hour'], branches: ['인', '사', '인', '신'] },
    ])
  })

  it('자묘형은 방향과 무관하게 위치 쌍별로 한 번 기록한다', () => {
    expect(analyzeBranchPunishments(fixture('자', '묘', '자', '묘')).findings).toEqual([
      { type: 'mutual-punishment', pillars: ['year', 'month'], branches: ['자', '묘'] },
      { type: 'mutual-punishment', pillars: ['year', 'hour'], branches: ['자', '묘'] },
      { type: 'mutual-punishment', pillars: ['month', 'day'], branches: ['묘', '자'] },
      { type: 'mutual-punishment', pillars: ['day', 'hour'], branches: ['자', '묘'] },
    ])
  })

  it.each(['진', '오', '유', '해'])('%s 자형은 반복 위치 쌍별로 기록한다', (branch) => {
    expect(analyzeBranchPunishments(fixture(branch, branch, branch))).toEqual({
      hasPunishment: true,
      findings: [
        { type: 'self-punishment', pillars: ['year', 'month'], branches: [branch, branch] },
        { type: 'self-punishment', pillars: ['year', 'day'], branches: [branch, branch] },
        { type: 'self-punishment', pillars: ['month', 'day'], branches: [branch, branch] },
      ],
    })
  })

  it.each(['자', '축', '인', '묘', '사', '미', '신', '술'])('%s 반복은 자형이 아니다', (branch) => {
    expect(analyzeBranchPunishments(fixture(branch, branch, branch, branch))).toEqual({ hasPunishment: false, findings: [] })
  })

  it('관련 없는 지지는 형으로 기록하지 않는다', () => {
    expect(analyzeBranchPunishments(fixture('자', '축', '진', '오'))).toEqual({ hasPunishment: false, findings: [] })
  })

  it('시간 미상이면 hour를 제외하여 complete 대신 부분 형을 기록한다', () => {
    expect(analyzeBranchPunishments(fixture('인', '사', '자', '신')).findings).toEqual([
      { type: 'three-punishment', group: '인사신', complete: true, pillars: ['year', 'month', 'hour'], branches: ['인', '사', '신'] },
    ])
    expect(analyzeBranchPunishments(fixture('인', '사', '자')).findings).toEqual([
      { type: 'three-punishment', group: '인사신', complete: false, pillars: ['year', 'month'], branches: ['인', '사'] },
    ])
  })

  it('시주 자형은 시간이 있을 때만 기록한다', () => {
    expect(analyzeBranchPunishments(fixture('자', '축', '진', '진')).findings).toEqual([
      { type: 'self-punishment', pillars: ['day', 'hour'], branches: ['진', '진'] },
    ])
    expect(analyzeBranchPunishments(fixture('자', '축', '진')).findings).toEqual([])
  })
})

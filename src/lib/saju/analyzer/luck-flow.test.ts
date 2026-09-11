import { describe, expect, it } from 'vitest'
import { calculateAnnualLuck, calculateDaewoon, calculateSaju } from '../calculator'
import { analyzeLuckFlow } from './luck-flow'

const input = { birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false } as const
const natal = calculateSaju(input)
const cycles = calculateDaewoon(input).cycles

describe('Luck Flow raw phase 2', () => {
  it('대운만: 천간/지지 관계와 기존 십성을 전달하고 반복이 없으면 빈 배열이다', () => {
    const daewoon = cycles[0] // 정해, 임 일간
    const facts = analyzeLuckFlow({ natal, daewoon })
    expect(facts).toEqual({
      dayStem: '임', dayElement: '수',
      daewoon: {
        stem: '정', branch: '해', stemElement: '화', branchElement: '수',
        stemRelationToDayMaster: 'iControl', branchRelationToDayMaster: 'same',
        stemTenGod: daewoon.stemTenGod, branchTenGod: daewoon.branchTenGod,
      },
      repeatedElements: [], repeatedTenGods: [],
    })
  })

  it('세운만: 천간/지지 관계와 기존 십성을 전달한다', () => {
    const annualLuck = calculateAnnualLuck(2024, natal.day.stem)
    const facts = analyzeLuckFlow({ natal, annualLuck })
    expect(facts.annual).toEqual({
      stem: '갑', branch: '진', stemElement: '목', branchElement: '토',
      stemRelationToDayMaster: 'iGenerate', branchRelationToDayMaster: 'controlsMe',
      stemTenGod: annualLuck.stemTenGod, branchTenGod: annualLuck.branchTenGod,
    })
    expect(facts.daewoon).toBeUndefined()
    expect(facts.repeatedElements).toEqual([])
    expect(facts.repeatedTenGods).toEqual([])
  })

  it('일간을 생하는 오행은 기존 generatesMe로 분류한다', () => {
    const facts = analyzeLuckFlow({ natal, daewoon: cycles[2] }) // 을유
    expect(facts.daewoon?.stemRelationToDayMaster).toBe('iGenerate')
    expect(facts.daewoon?.branchRelationToDayMaster).toBe('generatesMe')
  })

  it('둘 다: 반복 오행과 십성의 모든 운/천간/지지 출처를 보존하고 입력은 변경하지 않는다', () => {
    const supplied = { natal, daewoon: cycles[0], annualLuck: calculateAnnualLuck(2026, natal.day.stem) }
    const before = structuredClone(supplied)
    const facts = analyzeLuckFlow(supplied)
    expect(facts.daewoon).toBeDefined()
    expect(facts.annual).toBeDefined()
    expect(facts.repeatedElements).toEqual([{ element: '화', sources: [
      { source: 'daewoon', position: 'stem' },
      { source: 'annual', position: 'stem' },
      { source: 'annual', position: 'branch' },
    ] }])
    expect(facts.repeatedTenGods).toEqual([{ tenGod: '정재', sources: [
      { source: 'daewoon', position: 'stem' }, { source: 'annual', position: 'branch' },
    ] }])
    expect(supplied).toEqual(before)
  })

  it('운 하나의 천간/지지에서도 반복 오행과 십성을 검출한다', () => {
    const annualLuck = calculateAnnualLuck(2041, natal.day.stem) // 신유: 금/금, 정인/정인
    const facts = analyzeLuckFlow({ natal, annualLuck })
    const sources = [{ source: 'annual', position: 'stem' }, { source: 'annual', position: 'branch' }]
    expect(facts.repeatedElements).toEqual([{ element: '금', sources }])
    expect(facts.repeatedTenGods).toEqual([{ tenGod: '정인', sources }])
    expect(facts.annual?.branchTenGod).toBe(annualLuck.branchTenGod)
  })

  it('운이 없으면 원국 정보와 빈 반복 배열만 반환한다', () => {
    expect(analyzeLuckFlow({ natal })).toEqual({ dayStem: '임', dayElement: '수', repeatedElements: [], repeatedTenGods: [] })
  })
})

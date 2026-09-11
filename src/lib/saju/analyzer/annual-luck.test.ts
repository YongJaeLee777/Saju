import { describe, expect, it } from 'vitest'
import { calculateAnnualLuck, calculateAnnualLuckAt, calculateAnnualLuckRange, calculateSaju } from '../calculator'

describe('Annual Luck raw v1', () => {
  it.each([
    [2024, '갑진', '목', '토', '2024-02-04T08:27:00.000Z', '2025-02-03T14:10:00.000Z'],
    [2025, '을사', '목', '화', '2025-02-03T14:10:00.000Z', '2026-02-03T20:02:00.000Z'],
    [2026, '병오', '화', '화', '2026-02-03T20:02:00.000Z', '2027-02-04T01:46:00.000Z'],
  ] as const)('%i 연간지·오행과 양쪽 입춘 시각을 반환한다', (year, korean, stemElement, branchElement, startDateTime, endDateTime) => {
    expect(calculateAnnualLuck(year, '임')).toMatchObject({
      year, korean, stem: korean[0], branch: korean[1], stemElement, branchElement, startDateTime, endDateTime,
    })
  })

  it('계해→갑자 경계와 60년 순환은 기존 연주 규칙을 따른다', () => {
    expect(calculateAnnualLuckRange(1983, 2, '임').map(({ korean }) => korean)).toEqual(['계해', '갑자'])
    expect(calculateAnnualLuckRange(2043, 2, '임').map(({ korean }) => korean)).toEqual(['계해', '갑자'])
  })

  it('입춘 직전·정각·직후 및 다음 입춘에서 반열린 구간을 적용한다', () => {
    const annual = calculateAnnualLuck(2024, '임')
    const start = Date.parse(annual.startDateTime)
    const end = Date.parse(annual.endDateTime)
    expect(calculateAnnualLuckAt(new Date(start - 1), '임').year).toBe(2023)
    expect(calculateAnnualLuckAt(new Date(start), '임')).toEqual(annual)
    expect(calculateAnnualLuckAt(new Date(start + 1), '임')).toEqual(annual)
    expect(calculateAnnualLuckAt(new Date(end - 1), '임')).toEqual(annual)
    expect(calculateAnnualLuckAt(new Date(end), '임').year).toBe(2025)
    expect(calculateAnnualLuckAt(new Date('2024-01-01T00:00:00+09:00'), '임').year).toBe(2023)
    for (const [birthTime, expected] of [['17:26', '계묘'], ['17:27', '갑진'], ['17:28', '갑진']]) {
      const natal = calculateSaju({ birthDate: '2024-02-04', birthTime, gender: 'male', calendarType: 'solar', isLeapMonth: false, dayBoundary: 'midnight' })
      const selected = calculateAnnualLuckAt(new Date(`2024-02-04T${birthTime}:00+09:00`), '임')
      expect(selected.korean).toBe(expected)
      expect(selected.korean).toBe(natal.year.korean)
    }
  })

  it('동일 세운의 간지·기간은 일간에 무관하며 십성만 개인화한다', () => {
    const im = calculateAnnualLuck(2024, '임')
    const gye = calculateAnnualLuck(2024, '계')
    expect(im.stemTenGod).toBe('식신')
    expect(gye.stemTenGod).toBe('상관')
    expect(im.branchTenGod).toBe('편관')
    expect(gye.branchTenGod).toBe('정관')
    expect({ ...im, stemTenGod: gye.stemTenGod, branchTenGod: gye.branchTenGod }).toEqual(gye)
  })

  it('지지 십성은 본기 기준: 진의 무, 사의 병, 오의 정을 사용한다', () => {
    expect(calculateAnnualLuckRange(2024, 3, '임').map(({ branch, branchTenGod }) => [branch, branchTenGod]))
      .toEqual([['진', '편관'], ['사', '편재'], ['오', '정재']])
    // 오 is a yang branch, but its main hidden stem 정 is yin.
    expect(calculateAnnualLuck(2026, '병').branchTenGod).toBe('겁재')
  })

  it('range는 지정 개수·오름차순이며 인접 기간 사이에 공백/중복이 없다', () => {
    const range = calculateAnnualLuckRange(2024, 3, '임')
    expect(range).toHaveLength(3)
    expect(range.map(({ year }) => year)).toEqual([2024, 2025, 2026])
    expect(range.map(({ korean }) => korean)).toEqual(['갑진', '을사', '병오'])
    expect(range[0].endDateTime).toBe(range[1].startDateTime)
    expect(range[1].endDateTime).toBe(range[2].startDateTime)
  })

  it('유효하지 않은 일간·연도·시각·과도한 범위를 거부한다', () => {
    expect(() => calculateAnnualLuck(2024, 'invalid')).toThrow('일간')
    expect(() => calculateAnnualLuck(2024.5, '임')).toThrow(RangeError)
    expect(() => calculateAnnualLuck(9999, '임')).toThrow(RangeError)
    expect(() => calculateAnnualLuckAt(new Date(NaN), '임')).toThrow(RangeError)
    expect(() => calculateAnnualLuckRange(2024, 0, '임')).toThrow(RangeError)
    expect(() => calculateAnnualLuckRange(2024, 121, '임')).toThrow(RangeError)
    expect(() => calculateAnnualLuckRange(9998, 2, '임')).toThrow(RangeError)
  })
})

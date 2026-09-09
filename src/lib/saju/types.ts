export type Gender = 'male' | 'female'
export type CalendarType = 'solar' | 'lunar'

export interface SajuInput {
  birthDate: string
  birthTime?: string | null
  gender: Gender
  calendarType: CalendarType
  isLeapMonth: boolean
}

export interface Pillar {
  stem: string
  branch: string
  korean: string
}

export interface SajuResult {
  year: Pillar
  month: Pillar
  day: Pillar

  hour: {
    stem: string | null
    branch: string | null
    korean: string | null
  }
}
export type Gender = 'male' | 'female'
export type CalendarType = 'solar' | 'lunar'
export type DayBoundary = 'midnight' | 'jasi' | 'splitJasi'
export interface TrueSolarTimeOption { longitude: number; applyEquationOfTime?: boolean; applyHistoricalDst?: boolean }
export interface SajuInput {
  birthDate: string
  birthTime?: string | null
  gender: Gender
  calendarType: CalendarType
  isLeapMonth: boolean
  dayBoundary?: DayBoundary
  trueSolarTime?: TrueSolarTimeOption
}
export type FiveElement = '목' | '화' | '토' | '금' | '수'
export type FiveElementCounts = Record<FiveElement, number>
export type FiveElementPresence = Record<FiveElement, boolean>
export type Season = '봄' | '여름' | '가을' | '겨울'
export type MonthCommandRelation = 'same' | 'generatesMe' | 'iGenerate' | 'controlsMe' | 'iControl'
export interface SeasonalContext {
  monthBranch: string
  monthElement: FiveElement
  season: Season
  dayStemElement: FiveElement
  relation: MonthCommandRelation
}
export interface AnalysisFacts {
  surfaceCounts: FiveElementCounts
  hiddenCounts: FiveElementCounts
  presence: Record<FiveElement, { surface: boolean; hidden: boolean }>
  seasonal: SeasonalContext
  roots: RootAnalysis
  exposure: ExposureAnalysis
  stemCombinations: StemCombinationFinding[]
  branchClashes: BranchClashFinding[]
  branchCombinations: BranchCombinationFinding[]
  branchPunishments: BranchPunishmentAnalysis
  branchBreaks: BranchBreakFinding[]
  branchHarms: BranchHarmFinding[]
}
export type TenGod = '비견' | '겁재' | '식신' | '상관' | '편재' | '정재' | '편관' | '정관' | '편인' | '정인'
export interface ElementPair { stem: FiveElement; branch: FiveElement }
export interface HiddenStem {
  stem: '갑' | '을' | '병' | '정' | '무' | '기' | '경' | '신' | '임' | '계'
  element: FiveElement
}
export type HiddenStemRole = 'main' | 'middle' | 'residual'
export type RootPillar = 'year' | 'month' | 'day' | 'hour'
export interface RootFinding {
  pillar: RootPillar
  branch: string
  hiddenStem: HiddenStem['stem']
  role: HiddenStemRole
}
export interface RootAnalysis {
  hasRoot: boolean
  roots: RootFinding[]
}
export interface ExposureFinding {
  sourcePillar: RootPillar
  sourceBranch: string
  hiddenStem: HiddenStem['stem']
  role: HiddenStemRole
  exposedPillars: RootPillar[]
}
export interface ExposureAnalysis {
  hasExposure: boolean
  findings: ExposureFinding[]
}
export interface StemCombinationFinding {
  pillars: [RootPillar, RootPillar]
  stems: [string, string]
}
export interface BranchClashFinding {
  pillars: [RootPillar, RootPillar]
  branches: [string, string]
}
export interface BranchCombinationFinding {
  pillars: [RootPillar, RootPillar]
  branches: [string, string]
}
export interface BranchBreakFinding {
  pillars: [RootPillar, RootPillar]
  branches: [string, string]
}
export interface BranchHarmFinding {
  pillars: [RootPillar, RootPillar]
  branches: [string, string]
}
export type BranchPunishmentGroup = '인사신' | '축술미'
export type BranchPunishmentFinding =
  | { type: 'three-punishment'; group: BranchPunishmentGroup; complete: boolean; pillars: RootPillar[]; branches: string[] }
  | { type: 'mutual-punishment' | 'self-punishment'; pillars: [RootPillar, RootPillar]; branches: [string, string] }
export interface BranchPunishmentAnalysis {
  hasPunishment: boolean
  findings: BranchPunishmentFinding[]
}
/** 지지는 지장간 본기를 기준으로 계산한다. */
export interface TenGodPair { stem: TenGod | '일간'; branch: TenGod }
export interface Pillar { stem: string; branch: string; korean: string }
export interface SajuResult {
  hiddenStems: { year: HiddenStem[]; month: HiddenStem[]; day: HiddenStem[]; hour: HiddenStem[] | null }
  /** 각 천간·지지의 오행 매핑. 강약 점수나 가중치가 아니다. */
  elements: { year: ElementPair; month: ElementPair; day: ElementPair; hour: ElementPair | null }
  tenGods: { year: TenGodPair; month: TenGodPair; day: TenGodPair; hour: TenGodPair | null }
  year: Pillar
  month: Pillar
  day: Pillar
  hour: { stem: string | null; branch: string | null; korean: string | null }
}

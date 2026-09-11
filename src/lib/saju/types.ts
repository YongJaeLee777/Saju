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
export interface StrengthElementCounts {
  element: FiveElement
  surface: number
  hidden: number
}
export interface StrengthFacts {
  dayStem: string
  dayElement: FiveElement
  seasonal: Pick<SeasonalContext, 'monthBranch' | 'monthElement' | 'relation'>
  roots: {
    hasRoot: boolean
    count: number
    byRole: Record<HiddenStemRole, number>
    byPillar: Record<RootPillar, boolean>
    findings: Pick<RootFinding, 'pillar' | 'role'>[]
  }
  support: { sameElement: StrengthElementCounts; resourceElement: StrengthElementCounts }
  drain: { outputElement: StrengthElementCounts; wealthElement: StrengthElementCounts; officerElement: StrengthElementCounts }
}
export interface ElementPair { stem: FiveElement; branch: FiveElement }
export interface StrengthAssessment {
  level: 'strong' | 'balanced' | 'weak'
  confidence: 'high' | 'medium' | 'low'
  score: {
    seasonal: number
    roots: number
    elementSupport: number
    elementPressure: number
    support: number
    pressure: number
    balance: number
  }
  reasons: string[]
  methodologyVersion: 'v1'
}
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

/** Raw Daewoon v1. No interpretation or strength scoring. */
export interface DaewoonStartAge {
  years: number
  months: number
  /** Fractional days retained; conversion uses 12 months/year and 30 days/month. */
  days: number
  preciseYears: number
}
export interface DaewoonPillar extends Pillar {
  stemElement: FiveElement
  branchElement: FiveElement
  stemTenGod: TenGod
  /** Main hidden stem, identical to the natal branch-ten-god policy. */
  branchTenGod: TenGod
}
export interface DaewoonCycle extends DaewoonPillar {
  index: number
  startAge: DaewoonStartAge | null
  /** ISO 8601, fixed +09:00 display; null when timing cannot be resolved. */
  startDateTime: string | null
  /** Exclusive end; identical to the next cycle's start. */
  endDateTime: string | null
}
export interface DaewoonResult {
  methodologyVersion: 'v1'
  direction: 'forward' | 'backward'
  monthPillar: Pillar
  /** 'exact' uses the supplied birth time and engine terms (currently minute resolution). */
  startPrecision: 'exact' | 'date-only' | 'unavailable'
  timingUnavailableReason: 'birth-time-missing' | 'engine-instant-unavailable' | null
  referenceJeol: { name: string; dateTime: string } | null
  /** Actual elapsed time to the reference jeol, before age conversion. */
  intervalMilliseconds: number | null
  totalDays: number | null
  startAge: DaewoonStartAge | null
  startDateTime: string | null
  cycles: DaewoonCycle[]
}

/** Raw annual luck; year identifies the solar-term year beginning at Lichun. */
export interface AnnualLuck extends Pillar {
  year: number
  stemElement: FiveElement
  branchElement: FiveElement
  stemTenGod: TenGod
  /** Ten god of the branch's main hidden stem, matching the natal policy. */
  branchTenGod: TenGod
  /** Engine Lichun instant in UTC ISO 8601 (currently minute resolution). Inclusive. */
  startDateTime: string
  /** Next year's Lichun instant. Exclusive: [startDateTime, endDateTime). */
  endDateTime: string
}

export type LuckInteractionSource =
  | { source: 'natal'; pillar: RootPillar }
  | { source: 'daewoon' }
  | { source: 'annual' }
export interface LuckStemCombinationFinding {
  type: 'combination'
  left: { source: LuckInteractionSource; stem: string }
  right: { source: LuckInteractionSource; stem: string }
}
export interface LuckBranchInteractionFinding<T extends string = string> {
  type: T
  left: { source: LuckInteractionSource; branch: string }
  right: { source: LuckInteractionSource; branch: string }
}
export type LuckPunishmentFinding = LuckBranchInteractionFinding<'punishment'> & {
  /** Only these two entries were evaluated; combined-chart completeness is not assessed. */
  scope: 'pair-only'
} & (
  | { kind: 'three-punishment'; group: BranchPunishmentGroup; complete: false }
  | { kind: 'mutual-punishment' | 'self-punishment' }
)
export interface LuckInteractionFacts {
  stemCombinations: LuckStemCombinationFinding[]
  branchClashes: LuckBranchInteractionFinding<'clash'>[]
  branchCombinations: LuckBranchInteractionFinding<'six-combination'>[]
  branchPunishments: LuckPunishmentFinding[]
  branchBreaks: LuckBranchInteractionFinding<'break'>[]
  branchHarms: LuckBranchInteractionFinding<'harm'>[]
}

export type LuckFlowPillar = Pick<DaewoonCycle,
  'stem' | 'branch' | 'stemElement' | 'branchElement' | 'stemTenGod' | 'branchTenGod'>
export interface LuckFlow extends LuckFlowPillar {
  stemRelationToDayMaster: MonthCommandRelation
  branchRelationToDayMaster: MonthCommandRelation
}
export interface LuckFlowSource {
  source: 'daewoon' | 'annual'
  position: 'stem' | 'branch'
}
export interface LuckFlowFacts {
  dayStem: string
  dayElement: FiveElement
  daewoon?: LuckFlow
  annual?: LuckFlow
  repeatedElements: { element: FiveElement; sources: LuckFlowSource[] }[]
  repeatedTenGods: { tenGod: TenGod; sources: LuckFlowSource[] }[]
}

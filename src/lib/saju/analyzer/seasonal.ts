import type { FiveElement, MonthCommandRelation, SajuResult, SeasonalContext, Season } from '../types'

const SEASON_BY_MONTH_BRANCH: Record<string, Season> = {
  인: '봄', 묘: '봄', 진: '봄',
  사: '여름', 오: '여름', 미: '여름',
  신: '가을', 유: '가을', 술: '가을',
  해: '겨울', 자: '겨울', 축: '겨울',
}

const ELEMENT_GENERATES: Record<FiveElement, FiveElement> = {
  목: '화', 화: '토', 토: '금', 금: '수', 수: '목',
}
const ELEMENT_CONTROLS: Record<FiveElement, FiveElement> = {
  목: '토', 토: '수', 수: '화', 화: '금', 금: '목',
}

export function classifyMonthCommandRelation(
  dayStemElement: FiveElement,
  monthElement: FiveElement,
): MonthCommandRelation {
  if (dayStemElement === monthElement) return 'same'
  if (ELEMENT_GENERATES[monthElement] === dayStemElement) return 'generatesMe'
  if (ELEMENT_GENERATES[dayStemElement] === monthElement) return 'iGenerate'
  if (ELEMENT_CONTROLS[monthElement] === dayStemElement) return 'controlsMe'
  if (ELEMENT_CONTROLS[dayStemElement] === monthElement) return 'iControl'
  throw new Error(`지원하지 않는 오행 관계입니다: ${dayStemElement}, ${monthElement}`)
}

export function getSeasonalContext(
  result: Pick<SajuResult, 'month' | 'day' | 'elements'>,
): SeasonalContext {
  const monthBranch = result.month.branch
  const season = SEASON_BY_MONTH_BRANCH[monthBranch]

  if (!season) {
    throw new Error(`지원하지 않는 월지입니다: ${monthBranch}`)
  }

  const monthElement = result.elements.month.branch
  const dayStemElement = result.elements.day.stem

  return {
    monthBranch,
    monthElement,
    season,
    dayStemElement,
    relation: classifyMonthCommandRelation(dayStemElement, monthElement),
  }
}

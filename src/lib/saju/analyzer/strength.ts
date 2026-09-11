import type { HiddenStemRole, MonthCommandRelation, RootPillar, StrengthAssessment, StrengthFacts } from '../types'

const SEASONAL: Record<MonthCommandRelation, number> = {
  same: 40, generatesMe: 30, iGenerate: -20, iControl: -15, controlsMe: -30,
}
const ROOT_ROLE: Record<HiddenStemRole, number> = { main: 10, middle: 6, residual: 3 }
const ROOT_POSITION: Record<RootPillar, number> = { month: 1.4, day: 1.2, hour: 1, year: 0.8 }
// v1 confidence convention: within one surface-support unit of either threshold is low.
const CONFIDENCE_MARGIN = 3
// v1 coefficients have at most one decimal place; remove floating-point noise before comparison.
const round = (value: number) => Math.round(value * 10) / 10

export function assessStrength(facts: StrengthFacts): StrengthAssessment {
  const seasonal = SEASONAL[facts.seasonal.relation]
  const roots = round(Math.min(30, facts.roots.findings.reduce(
    (sum, { pillar, role }) => sum + ROOT_ROLE[role] * ROOT_POSITION[pillar], 0,
  )))
  const { sameElement: same, resourceElement: resource } = facts.support
  const elementSupport = Math.min(30,
    (Math.max(0, same.surface - 1) + resource.surface) * 3 + same.hidden + resource.hidden,
  )
  const { outputElement: output, wealthElement: wealth, officerElement: officer } = facts.drain
  const elementPressure = round(Math.min(30,
    (output.surface + wealth.surface) * 2 + (output.hidden + wealth.hidden) * 0.7
    + officer.surface * 3 + officer.hidden,
  ))
  const support = round(Math.max(0, seasonal) + roots + elementSupport)
  const pressure = round(Math.max(0, -seasonal) + elementPressure)
  const balance = round(support - pressure)
  const level = balance >= 15 ? 'strong' : balance <= -15 ? 'weak' : 'balanced'

  // Guardrails follow from the formula, without additional arbitrary cutoffs:
  // controlsMe + no roots: support <= 30, pressure >= 30 => balance <= 0.
  // same: support >= 40, pressure <= 30 => balance >= 10, even without roots/support.
  const reasons = [
    `월령 ${facts.seasonal.relation}: ${seasonal}`,
    `통근 role × 위치 합계(최대 30): ${roots}`,
    `일간 자신 1개 제외 생조(최대 30): ${elementSupport}`,
    `극·설·소모(최대 30): ${elementPressure}`,
    `support ${support} - pressure ${pressure} = balance ${balance}: ${level}`,
  ]
  if (facts.seasonal.relation === 'controlsMe' && facts.roots.findings.length === 0) {
    reasons.push('guardrail: controlsMe·무통근은 생조 상한 30으로 strong에 도달할 수 없음')
  }
  if (facts.seasonal.relation === 'same') {
    reasons.push('guardrail: same 월령은 pressure 상한 30으로 weak에 도달할 수 없음')
  }

  const nearThreshold = Math.min(Math.abs(balance - 15), Math.abs(balance + 15)) <= CONFIDENCE_MARGIN
  // Zero evidence is neutral. Root absence does not add negative evidence.
  const directions = [seasonal, roots, elementSupport - elementPressure].filter((value) => value !== 0)
  const aligned = (level === 'strong' && directions.every((value) => value > 0))
    || (level === 'weak' && directions.every((value) => value < 0))
  const confidence = nearThreshold ? 'low' : aligned ? 'high' : 'medium'
  reasons.push(nearThreshold
    ? 'confidence low: 판정 경계 ±15에서 거리 3 이내'
    : aligned ? 'confidence high: 경계에서 거리 3 초과, 월령·통근·오행 순지원의 유효 방향 일치'
      : 'confidence medium: 경계에서 거리 3 초과, 근거 방향 충돌 또는 balanced')

  return {
    level, confidence,
    score: { seasonal, roots, elementSupport, elementPressure, support, pressure, balance },
    reasons, methodologyVersion: 'v1',
  }
}

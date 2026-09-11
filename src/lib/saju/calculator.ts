import { calculateWithManseryeok } from './engine/manseryeok'
import { analyzeDaewoon } from './analyzer/daewoon'

export { calculateAnnualLuck, calculateAnnualLuckRange, calculateAnnualLuckAt } from './analyzer/annual-luck'

import type {
  SajuInput,
  SajuResult,
  DaewoonResult,
} from './types'

export function calculateSaju(
  input: SajuInput,
): SajuResult {
  return calculateWithManseryeok(input)
}

/** Opt-in raw calculation; the existing calculateSaju return value is unchanged. */
export function calculateDaewoon(input: SajuInput): DaewoonResult {
  return analyzeDaewoon(input, calculateWithManseryeok(input))
}

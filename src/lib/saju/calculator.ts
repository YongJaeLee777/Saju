import { calculateWithManseryeok } from './engine/manseryeok'

import type {
  SajuInput,
  SajuResult,
} from './types'

export function calculateSaju(
  input: SajuInput,
): SajuResult {
  return calculateWithManseryeok(input)
}
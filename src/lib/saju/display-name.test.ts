import { describe, expect, it } from 'vitest'
import { normalizeDisplayName } from './display-name'

describe('presentation display name', () => {
  it.each([undefined, null, '', '   '])('normalizes absent names to null', (value) => {
    expect(normalizeDisplayName(value)).toBeNull()
  })
  it('trims names and allows nicknames without collecting a legal identity', () => {
    expect(normalizeDisplayName('  용재7  ')).toBe('용재7')
    expect(normalizeDisplayName('가'.repeat(30))).toHaveLength(30)
  })
  it.each(['가'.repeat(31), '용재\n', '\u0000이름', '이\u200b름', '<이름>', {}, 42])(
    'rejects invalid names', (value) => { expect(normalizeDisplayName(value)).toBeUndefined() })
})

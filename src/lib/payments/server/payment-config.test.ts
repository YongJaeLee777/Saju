import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaymentConfig, getPaymentIdentity, matchesPaymentConfig } from './payment-config'

const { bindings } = vi.hoisted(() => ({ bindings: {
  KAKAOPAY_ENVIRONMENT: undefined as string | undefined,
  KAKAOPAY_CID: undefined as string | undefined,
  KAKAOPAY_SECRET_KEY: undefined as string | undefined,
} }))
vi.mock('cloudflare:workers', () => ({ env: bindings }))

beforeEach(() => {
  bindings.KAKAOPAY_ENVIRONMENT = 'test'
  bindings.KAKAOPAY_CID = 'TC0ONETIME'
  bindings.KAKAOPAY_SECRET_KEY = 'mock-secret'
})

describe('central server payment config', () => {
  it('allows the existing test settings', () => {
    expect(getPaymentConfig()).toEqual({ provider: 'kakaopay', environment: 'test', cid: 'TC0ONETIME', secret: 'mock-secret' })
  })
  it('allows a synthetic live CID through settings only', () => {
    bindings.KAKAOPAY_ENVIRONMENT = 'live'
    bindings.KAKAOPAY_CID = 'MOCKLIVE01'
    expect(getPaymentConfig()).toMatchObject({ environment: 'live', cid: 'MOCKLIVE01' })
  })
  it.each([undefined, '', 'production', 'TEST', ' live '])('rejects missing/invalid environment %s', (environment) => {
    bindings.KAKAOPAY_ENVIRONMENT = environment
    expect(getPaymentConfig()).toBeNull()
  })
  it.each([
    ['live', 'TC0ONETIME'], ['test', 'MOCKLIVE01'], ['test', undefined],
    ['live', ''], ['live', ' invalid '],
  ])('rejects environment/CID mismatch', (environment, cid) => {
    bindings.KAKAOPAY_ENVIRONMENT = environment
    bindings.KAKAOPAY_CID = cid
    expect(getPaymentConfig()).toBeNull()
  })
  it.each([undefined, '', '   '])('requires a secret for provider calls', (secret) => {
    bindings.KAKAOPAY_SECRET_KEY = secret
    expect(getPaymentConfig()).toBeNull()
    expect(getPaymentIdentity()).toMatchObject({ environment: 'test' })
  })
  it.each(['provider', 'environment', 'cid'])('rejects stored purchase %s mismatch', (key) => {
    const config = getPaymentConfig()!
    expect(matchesPaymentConfig({ ...config, [key]: 'mismatch' }, config)).toBe(false)
    expect(matchesPaymentConfig(config, config)).toBe(true)
  })
})

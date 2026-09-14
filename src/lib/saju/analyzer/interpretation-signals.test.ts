import { describe, expect, it } from 'vitest'
import type { InterpretationFacts, InterpretationSignalCode, LuckFlow, TenGod } from '../types'
import { buildInterpretationSignals } from './interpretation-signals'

function empty(): InterpretationFacts {
  const key = () => ({ affected: false, byDaewoon: false, byAnnual: false, findings: [] })
  return {
    context: { dayStem: '갑', dayElement: '목', strengthLevel: 'balanced', strengthConfidence: 'low', methodologyVersion: 'v1' },
    luck: {}, flow: { repeatedElements: [], repeatedTenGods: [] },
    interactions: { stemCombinations: [], branchClashes: [], branchCombinations: [], branchPunishments: [], branchBreaks: [], branchHarms: [] },
    keyPillars: { dayStem: key(), dayBranch: key(), monthBranch: key() },
  }
}
function flow(stemTenGod: TenGod, branchTenGod: TenGod = '비견'): LuckFlow {
  return { stem: '갑', branch: '자', stemElement: '목', branchElement: '수', stemTenGod, branchTenGod,
    stemRelationToDayMaster: 'same', branchRelationToDayMaster: 'generatesMe' }
}
function affect(facts: InterpretationFacts, key: 'dayStem' | 'dayBranch' | 'monthBranch', source: 'daewoon' | 'annual') {
  const fact = facts.keyPillars[key]
  fact.affected = true
  if (source === 'daewoon') fact.byDaewoon = true
  else fact.byAnnual = true
  if (key === 'dayStem') {
    const finding = { type: 'combination' as const, left: { source: { source: 'natal' as const, pillar: 'day' as const }, stem: '갑' },
      right: { source: { source }, stem: '기' } }
    const index = facts.interactions.stemCombinations.push(finding) - 1
    facts.keyPillars.dayStem.findings.push({ ...finding, externalSource: source, origin: { collection: 'stemCombinations', index } })
  } else {
    const finding = { type: 'clash' as const, left: { source: { source: 'natal' as const, pillar: key === 'dayBranch' ? 'day' as const : 'month' as const }, branch: '자' },
      right: { source: { source }, branch: '오' } }
    const index = facts.interactions.branchClashes.push(finding) - 1
    facts.keyPillars[key].findings.push({ ...finding, externalSource: source, origin: { collection: 'branchClashes', index } })
  }
}
function signal(facts: InterpretationFacts, code: InterpretationSignalCode) {
  return buildInterpretationSignals(facts).signals.find((item) => item.code === code)
}

describe('interpretation signals v1-alpha.3', () => {
  it.each(['daewoon', 'annual'] as const)('%s interaction 원본으로 단일 scope를 지정한다', (source) => {
    const facts = empty()
    affect(facts, 'monthBranch', source)
    const result = signal(facts, 'career_change_pressure')
    expect(result?.scope).toBe(source === 'daewoon' ? 'background' : 'annual')
  })

  it('양쪽 interaction은 signal 하나에 reinforced scope를 지정한다', () => {
    const facts = empty()
    affect(facts, 'dayBranch', 'daewoon')
    affect(facts, 'dayBranch', 'annual')
    const results = buildInterpretationSignals(facts).signals.filter(({ code }) => code === 'relationship_restructuring')
    expect(results).toHaveLength(1)
    expect(results[0].scope).toBe('reinforced')
  })

  it.each(['daewoon', 'annual'] as const)('%s tenGod 원본으로 scope를 지정한다', (source) => {
    const facts = empty()
    facts.flow[source] = flow('정관', '편관')
    expect(signal(facts, 'career_responsibility_pressure')?.scope).toBe(source === 'daewoon' ? 'background' : 'annual')
  })

  it('tenGod와 interaction이 서로 다른 운이면 reinforced', () => {
    const facts = empty()
    facts.flow.daewoon = flow('정관', '편관')
    affect(facts, 'dayStem', 'annual')
    expect(signal(facts, 'career_responsibility_pressure')?.scope).toBe('reinforced')
  })

  it.each(['daewoon', 'annual'] as const)('mixed evidence여도 원본 interaction이 %s뿐이면 단일 scope', (source) => {
    const facts = empty()
    affect(facts, 'dayStem', source)
    affect(facts, 'dayBranch', source)
    const origins = [{ source: 'daewoon' as const, position: 'stem' as const }, { source: 'annual' as const, position: 'stem' as const }]
    facts.flow.repeatedElements.push({ element: '목', sources: origins })
    facts.flow.repeatedTenGods.push({ tenGod: '비견', sources: origins })
    const result = signal(facts, 'timing_transition')
    expect(result?.evidence.map(({ kind }) => kind)).toEqual(expect.arrayContaining(['interaction', 'repeatedElement', 'repeatedTenGod']))
    expect(result?.scope).toBe(source === 'daewoon' ? 'background' : 'annual')
  })

  it('elementRelation의 상대 운 출처는 scope에 추가하지 않는다', () => {
    const facts = empty()
    facts.flow.daewoon = flow('정재', '편재')
    facts.flow.annual = flow('비견')
    facts.flow.annual.stemRelationToDayMaster = 'iControl'
    affect(facts, 'monthBranch', 'daewoon')
    const result = signal(facts, 'money_resource_management_pressure')
    expect(result?.evidence).toContainEqual(expect.objectContaining({ kind: 'elementRelation', source: { source: 'annual', position: 'stem' } }))
    expect(result?.scope).toBe('background')
  })
  it.each(['monthBranch', 'dayBranch'] as const)('%s 육합을 발생·strength·evidence에서 제외한다', (key) => {
    const facts = empty()
    const code = key === 'monthBranch' ? 'career_change_pressure' : 'relationship_restructuring'
    const finding = { type: 'six-combination' as const,
      left: { source: { source: 'natal' as const, pillar: key === 'monthBranch' ? 'month' as const : 'day' as const }, branch: '자' },
      right: { source: { source: 'daewoon' as const }, branch: '축' } }
    facts.interactions.branchCombinations.push(finding)
    facts.keyPillars[key] = { affected: true, byDaewoon: true, byAnnual: false, findings: [
      { ...finding, externalSource: 'daewoon', origin: { collection: 'branchCombinations', index: 0 } },
    ] }
    expect(signal(facts, code)).toBeUndefined()
    if (key === 'monthBranch') {
      facts.flow.daewoon = flow('정관')
      facts.flow.annual = flow('편관')
      expect(signal(facts, 'career_responsibility_pressure')).toMatchObject({ strength: 'high', priority: 'high' })
    }
    affect(facts, key, 'annual')
    expect(signal(facts, code)).toMatchObject({ strength: 'medium', priority: 'high' })
    expect(signal(facts, code)?.evidence).toHaveLength(1)
    expect(signal(facts, code)?.evidence[0]).toMatchObject({ finding: { type: 'clash' } })
    // Timing still uses the original key flags, including six-combination.
    expect(signal(facts, 'timing_transition')).toMatchObject({ strength: 'medium' })
  })

  it.each(['dayStem', 'dayBranch', 'monthBranch'] as const)('같은 %s에 양쪽 운이 작용하면 repeated 없이 timing 발생', (key) => {
    const facts = empty()
    affect(facts, key, 'daewoon')
    affect(facts, key, 'annual')
    const result = signal(facts, 'timing_transition')
    expect(result).toMatchObject({ strength: 'medium', priority: 'high' })
    expect(result?.evidence).toHaveLength(2)
  })

  it.each([false, true])('monthBranch annual, daewoon 동시 여부 %s', (both) => {
    const facts = empty()
    affect(facts, 'monthBranch', 'annual')
    if (both) affect(facts, 'monthBranch', 'daewoon')
    const result = signal(facts, 'career_change_pressure')
    expect(result).toMatchObject({ topic: 'career', direction: 'challenging', strength: both ? 'high' : 'medium', priority: 'high' })
    expect(result?.evidence).toHaveLength(both ? 2 : 1)
    expect(result?.evidence[0]).toMatchObject({ kind: 'interaction', finding: { type: 'clash' } })
  })

  it('관성 2 source는 medium이며 같은 운의 key 관계만으로 strength를 올리지 않는다', () => {
    const facts = empty()
    facts.flow.daewoon = flow('정관', '편관')
    expect(signal(facts, 'career_responsibility_pressure')).toMatchObject({ strength: 'medium', priority: 'medium' })
    affect(facts, 'dayStem', 'annual')
    expect(signal(facts, 'career_responsibility_pressure')).toMatchObject({ strength: 'medium', priority: 'high' })
  })

  it.each(['three', 'both-with-key'] as const)('관성 high 조건: %s', (condition) => {
    const facts = empty()
    facts.flow.daewoon = flow('정관', condition === 'three' ? '편관' : '비견')
    facts.flow.annual = flow('편관')
    if (condition === 'both-with-key') affect(facts, 'monthBranch', 'annual')
    expect(signal(facts, 'career_responsibility_pressure')).toMatchObject({ strength: 'high', priority: condition === 'three' ? 'medium' : 'high' })
  })

  it('재성이 양쪽 운에 분산되면 opportunity high/medium', () => {
    const facts = empty()
    facts.flow.daewoon = flow('정재')
    facts.flow.annual = flow('편재')
    const result = signal(facts, 'money_resource_opportunity')
    expect(result).toMatchObject({ direction: 'supportive', strength: 'high', priority: 'medium' })
    expect(result?.evidence).toHaveLength(2)
    expect(result?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'tenGod', source: { source: 'daewoon', position: 'stem' }, tenGod: '정재' }),
      expect.objectContaining({ kind: 'tenGod', source: { source: 'annual', position: 'stem' }, tenGod: '편재' }),
    ]))
  })

  it('같은 운 stem+branch 재성만 있으면 opportunity를 만들지 않는다', () => {
    const facts = empty()
    facts.flow.daewoon = flow('정재', '편재')
    expect(signal(facts, 'money_resource_opportunity')).toBeUndefined()
  })

  it('재성 한 위치를 luck/flow/repeated로 중복 전달해도 opportunity가 없다', () => {
    const facts = empty()
    const pillar = flow('정재')
    facts.flow.daewoon = pillar
    facts.luck.daewoon = { ...pillar, korean: '갑자', index: 1, startAge: null, startDateTime: null, endDateTime: null }
    facts.flow.repeatedTenGods = [{ tenGod: '정재', sources: [{ source: 'daewoon', position: 'stem' }, { source: 'daewoon', position: 'stem' }] }]
    expect(signal(facts, 'money_resource_opportunity')).toBeUndefined()
    expect(signal(facts, 'money_resource_management_pressure')).toBeUndefined()
  })

  it.each([
    [true, 0, false, 'medium'], [true, 1, true, 'medium'], [true, 2, true, 'high'],
    [true, 3, true, 'high'], [false, 2, false, 'medium'], [false, 3, true, 'medium'],
  ] as const)('관리 조건: key %s, pressure %s', (key, pressureCount, generated, strength) => {
    const facts = empty()
    facts.flow.daewoon = flow('정재')
    facts.flow.annual = flow('편재')
    if (key) affect(facts, 'dayBranch', 'annual')
    if (pressureCount >= 1) facts.flow.daewoon.stemRelationToDayMaster = 'iControl'
    if (pressureCount >= 2) facts.flow.daewoon.branchRelationToDayMaster = 'iGenerate'
    if (pressureCount >= 3) facts.flow.annual.stemRelationToDayMaster = 'controlsMe'
    const result = signal(facts, 'money_resource_management_pressure')
    if (generated) {
      expect(result).toMatchObject({ direction: 'mixed', strength, priority: key ? 'high' : 'medium' })
      expect(result?.evidence.filter((item) => item.kind === 'elementRelation')).toHaveLength(pressureCount)
    } else expect(result).toBeUndefined()
    expect(signal(facts, 'money_resource_opportunity')?.priority).toBe('medium')
  })

  it('pressuring relation 한 위치만으로 관리 signal을 만들지 않는다', () => {
    const facts = empty()
    facts.flow.annual = flow('정재', '편재')
    facts.flow.annual.stemRelationToDayMaster = 'controlsMe'
    expect(signal(facts, 'money_resource_management_pressure')).toBeUndefined()
  })

  it.each([false, true])('dayBranch 관계는 mixed, 양쪽 운 여부 %s', (both) => {
    const facts = empty()
    affect(facts, 'dayBranch', 'daewoon')
    if (both) affect(facts, 'dayBranch', 'annual')
    expect(signal(facts, 'relationship_restructuring')).toMatchObject({ direction: 'mixed', strength: both ? 'high' : 'medium', priority: 'high' })
  })

  it.each([2, 3])('핵심 자리 %s개 timing strength', (count) => {
    const facts = empty()
    affect(facts, 'dayStem', 'annual')
    affect(facts, 'dayBranch', 'annual')
    if (count === 3) affect(facts, 'monthBranch', 'annual')
    expect(signal(facts, 'timing_transition')).toBeUndefined()
    facts.flow.repeatedElements.push({ element: '목', sources: [{ source: 'annual', position: 'stem' }, { source: 'annual', position: 'branch' }] })
    expect(signal(facts, 'timing_transition')).toMatchObject({ direction: 'mixed', strength: count === 3 ? 'high' : 'medium', priority: 'high' })
  })

  it.each(['element', 'tenGod'] as const)('운끼리 interaction과 repeated %s만으로 timing을 만들지 않는다', (kind) => {
    const facts = empty()
    facts.interactions.branchHarms.push({ type: 'harm', left: { source: { source: 'daewoon' }, branch: '신' }, right: { source: { source: 'annual' }, branch: '해' } })
    const origins = [{ source: 'daewoon' as const, position: 'stem' as const }, { source: 'annual' as const, position: 'stem' as const }]
    if (kind === 'element') facts.flow.repeatedElements.push({ element: '목', sources: origins })
    else facts.flow.repeatedTenGods.push({ tenGod: '비견', sources: origins })
    expect(signal(facts, 'timing_transition')).toBeUndefined()
    affect(facts, 'dayStem', 'annual')
    affect(facts, 'monthBranch', 'daewoon')
    expect(signal(facts, 'timing_transition')).toMatchObject({ strength: 'medium', priority: 'high' })
    facts.flow.repeatedElements = []
    facts.flow.repeatedTenGods = []
    expect(signal(facts, 'timing_transition')).toBeUndefined()
  })

  it('timing B는 한쪽 운 interaction만으로 발생하지 않는다', () => {
    const facts = empty()
    affect(facts, 'dayStem', 'annual')
    facts.flow.repeatedElements.push({ element: '목', sources: [{ source: 'annual', position: 'stem' }, { source: 'annual', position: 'branch' }] })
    expect(signal(facts, 'timing_transition')).toBeUndefined()
  })

  it('wrapper/좌우 순서가 다른 동일 interaction은 한 근거로 유지하고 pair-only를 보존한다', () => {
    const facts = empty()
    const finding = { type: 'punishment' as const, scope: 'pair-only' as const, kind: 'three-punishment' as const, group: '인사신' as const, complete: false as const,
      left: { source: { source: 'natal' as const, pillar: 'day' as const }, branch: '인' }, right: { source: { source: 'daewoon' as const }, branch: '사' } }
    facts.interactions.branchPunishments.push(finding, { ...finding, left: finding.right, right: finding.left })
    facts.keyPillars.dayBranch = { affected: true, byDaewoon: true, byAnnual: false, findings: [
      { ...finding, externalSource: 'daewoon', origin: { collection: 'branchPunishments', index: 0 } },
      { ...finding, externalSource: 'daewoon', origin: { collection: 'branchPunishments', index: 1 } },
    ] }
    affect(facts, 'dayStem', 'annual')
    facts.flow.repeatedElements.push({ element: '목', sources: [{ source: 'daewoon', position: 'stem' }, { source: 'annual', position: 'stem' }] })
    const result = signal(facts, 'timing_transition')
    expect(result?.strength).toBe('medium')
    expect(result?.evidence).toHaveLength(3)
    const evidence = result?.evidence.find((item) => item.kind === 'interaction' && item.finding.type === 'punishment')
    expect(evidence).toMatchObject({ finding: { scope: 'pair-only', complete: false } })
    expect(evidence?.paths).toHaveLength(2)
  })

  it('중복 관성 wrappers를 세지 않고 근거 경로를 병합한다', () => {
    const facts = empty()
    facts.flow.daewoon = flow('정관', '정관')
    facts.flow.repeatedTenGods.push({ tenGod: '정관', sources: [{ source: 'daewoon', position: 'stem' }, { source: 'daewoon', position: 'branch' }] })
    const result = signal(facts, 'career_responsibility_pressure')
    expect(result?.strength).toBe('medium')
    expect(result?.evidence).toHaveLength(2)
    expect(result?.evidence.every((item) => item.paths.length === 2)).toBe(true)
  })

  it('조건이 없으면 빈 signals', () => {
    expect(buildInterpretationSignals(empty())).toEqual({ methodologyVersion: 'interpretation-v1-alpha.3', signals: [] })
  })

  it('deterministic 정렬과 버전을 유지하고 입력을 변경하지 않는다', () => {
    const facts = empty()
    facts.flow.daewoon = flow('정관', '정재')
    facts.flow.annual = flow('편관', '편재')
    facts.flow.annual.branchRelationToDayMaster = 'iControl'
    facts.flow.repeatedElements.push({ element: '목', sources: [{ source: 'annual', position: 'stem' }, { source: 'daewoon', position: 'stem' }] })
    affect(facts, 'dayStem', 'annual')
    affect(facts, 'dayBranch', 'daewoon')
    affect(facts, 'monthBranch', 'annual')
    const before = structuredClone(facts)
    const first = buildInterpretationSignals(facts)
    expect(buildInterpretationSignals(facts)).toEqual(first)
    expect(facts).toEqual(before)
    expect(first.signals.map(({ code }) => code)).toEqual([
      'career_change_pressure', 'career_responsibility_pressure', 'money_resource_management_pressure',
      'relationship_restructuring', 'timing_transition', 'money_resource_opportunity',
    ])
    expect(first.signals.every((item) => item.methodologyVersion === first.methodologyVersion)).toBe(true)
    expect(first.methodologyVersion).toBe('interpretation-v1-alpha.3')
    expect(first.signals.map(({ scope }) => scope)).toEqual([
      'annual', 'reinforced', 'reinforced', 'background', 'reinforced', 'reinforced',
    ])
  })
})

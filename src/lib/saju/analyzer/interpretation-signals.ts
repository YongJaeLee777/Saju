import type {
  InterpretationFacts, InterpretationSignal, InterpretationSignalEvidence, InterpretationSignals,
  LuckFlowSource, LuckInteractionFacts, LuckInteractionSource, SignalScope, TenGod,
} from '../types'

const version = 'interpretation-v1-alpha.3'
const sources = ['daewoon', 'annual'] as const
const positions = ['stem', 'branch'] as const
const keys = ['dayStem', 'dayBranch', 'monthBranch'] as const
type Evidence = InterpretationSignalEvidence
type Interaction = LuckInteractionFacts[keyof LuckInteractionFacts][number]
type TenGodEvidence = Extract<Evidence, { kind: 'tenGod' }>
const slot = ({ source, position }: LuckFlowSource) => `${source}.${position}`
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

function unique(evidence: Evidence[]): Evidence[] {
  const result = new Map<string, Evidence>()
  for (const item of evidence) {
    const previous = result.get(item.id)
    result.set(item.id, { ...item, paths: [...new Set([...(previous?.paths ?? []), ...item.paths])].sort(compare) })
  }
  return [...result.values()].sort((a, b) => compare(a.id, b.id))
}

function interaction(finding: Interaction, path: string): Evidence {
  const identity = (source: LuckInteractionSource) => source.source === 'natal' ? `natal.${source.pillar}` : source.source
  const endpoints = 'stem' in finding.left && 'stem' in finding.right
    ? [identity(finding.left.source) + ':' + finding.left.stem, identity(finding.right.source) + ':' + finding.right.stem]
    : ['branch' in finding.left ? identity(finding.left.source) + ':' + finding.left.branch : '',
      'branch' in finding.right ? identity(finding.right.source) + ':' + finding.right.branch : '']
  const policy = finding.type === 'punishment' && 'scope' in finding
    ? [finding.scope, finding.kind, 'group' in finding ? finding.group : '', 'complete' in finding ? finding.complete : ''] : []
  return { kind: 'interaction', id: JSON.stringify(['interaction', finding.type, endpoints.sort(compare), policy]), paths: [path], finding }
}

/** Reuses supplied ten gods; one observation per luck source/position, even when
 * luck, flow and repeated facts wrap the same observation. Inputs must describe
 * the same chart/periods; direct luck values take precedence, then flow, then repeats.
 */
function tenGodSources(facts: InterpretationFacts): TenGodEvidence[] {
  const observations = new Map<string, TenGodEvidence>()
  const add = (source: LuckFlowSource, tenGod: TenGod, path: string) => {
    const id = `tenGod:${slot(source)}`
    const existing = observations.get(id)
    if (existing) {
      if (existing.tenGod === tenGod) existing.paths.push(path)
    } else observations.set(id, { kind: 'tenGod', id, source, tenGod, paths: [path] })
  }
  for (const source of sources) {
    for (const position of positions) {
      const field = position === 'stem' ? 'stemTenGod' : 'branchTenGod'
      const luck = facts.luck[source]
      const flow = facts.flow[source]
      if (luck) add({ source, position }, luck[field], `luck.${source}.${field}`)
      if (flow) add({ source, position }, flow[field], `flow.${source}.${field}`)
    }
  }
  facts.flow.repeatedTenGods.forEach((fact, index) => fact.sources.forEach((source) =>
    add(source, fact.tenGod, `flow.repeatedTenGods[${index}]`)))
  return [...observations.values()]
}

/** Only original interaction/ten-god sources determine temporal scope.
 * Repeated aggregates and element relations do not add scope sources.
 */
function evidenceScope(evidence: Evidence[]): SignalScope {
  const origins = new Set<string>()
  for (const item of evidence) {
    if (item.kind === 'tenGod') origins.add(item.source.source)
    if (item.kind === 'interaction') {
      for (const side of [item.finding.left, item.finding.right]) {
        if (side.source.source !== 'natal') origins.add(side.source.source)
      }
    }
  }
  if (origins.has('daewoon')) return origins.has('annual') ? 'reinforced' : 'background'
  if (origins.has('annual')) return 'annual'
  throw new Error('Signal evidence requires an interaction or ten-god luck source.')
}

/** v1-alpha.3 adds scope without changing the v1-alpha.2 signal rules. */
export function buildInterpretationSignals(facts: InterpretationFacts): InterpretationSignals {
  const signals: InterpretationSignal[] = []
  const emit = (signal: Omit<InterpretationSignal, 'methodologyVersion' | 'scope'>) => {
    const evidence = unique(signal.evidence)
    signals.push({ ...signal, evidence, scope: evidenceScope(evidence), methodologyVersion: version })
  }
  const keyEvidence = (...selected: (typeof keys[number])[]): Evidence[] => selected.flatMap((key) =>
    facts.keyPillars[key].affected ? facts.keyPillars[key].findings.map((finding, index) =>
      interaction(finding, `keyPillars.${key}.findings[${index}]`)) : [])
  const { dayStem, dayBranch, monthBranch } = facts.keyPillars
  // Filter only these two signals; other rules still consume the original key flags.
  const changeEvidence = (key: 'monthBranch' | 'dayBranch') => keyEvidence(key).filter((item) =>
    item.kind === 'interaction' && ['clash', 'punishment', 'break', 'harm'].includes(item.finding.type))
  const monthChanges = changeEvidence('monthBranch')
  const dayChanges = changeEvidence('dayBranch')
  const bothChangeSources = (items: Evidence[]) => sources.every((source) => items.some((item) =>
    item.kind === 'interaction' && [item.finding.left.source, item.finding.right.source].some((origin) => origin.source === source)))
  const both = (items: TenGodEvidence[]) => sources.every((source) => items.some((item) => item.source.source === source))
  const tenGods = tenGodSources(facts)
  const officers = tenGods.filter(({ tenGod }) => tenGod === '정관' || tenGod === '편관')
  const wealth = tenGods.filter(({ tenGod }) => tenGod === '정재' || tenGod === '편재')
  const careerKey = dayStem.affected || monthBranch.affected
  const moneyKey = dayBranch.affected || monthBranch.affected
  const pressure: Evidence[] = []
  for (const source of sources) {
    const flow = facts.flow[source]
    if (!flow) continue
    for (const position of positions) {
      const field = position === 'stem' ? 'stemRelationToDayMaster' : 'branchRelationToDayMaster'
      const relation = flow[field]
      if (relation === 'controlsMe' || relation === 'iGenerate' || relation === 'iControl') {
        pressure.push({ kind: 'elementRelation', id: `elementRelation:${source}.${position}`, source: { source, position }, relation, paths: [`flow.${source}.${field}`] })
      }
    }
  }
  const repeatedPressure = pressure.length >= 2 // Each entry is a distinct source/position.

  if (monthChanges.length > 0) emit({
    code: 'career_change_pressure', topic: 'career', direction: 'challenging',
    strength: bothChangeSources(monthChanges) ? 'high' : 'medium', priority: 'high',
    evidence: monthChanges,
  })
  if (officers.length >= 2) emit({
    code: 'career_responsibility_pressure', topic: 'career', direction: 'challenging',
    strength: officers.length >= 3 || (both(officers) && careerKey) ? 'high' : 'medium',
    priority: careerKey ? 'high' : 'medium', evidence: [...officers, ...keyEvidence('dayStem', 'monthBranch')],
  })
  if (wealth.length >= 2 && both(wealth)) emit({
    code: 'money_resource_opportunity', topic: 'money', direction: 'supportive',
    strength: wealth.length >= 3 || both(wealth) ? 'high' : 'medium', priority: 'medium', evidence: wealth,
  })
  if (wealth.length >= 2 && ((moneyKey && pressure.length >= 1) || pressure.length >= 3)) emit({
    code: 'money_resource_management_pressure', topic: 'money', direction: 'mixed',
    strength: moneyKey && repeatedPressure ? 'high' : 'medium', priority: moneyKey ? 'high' : 'medium',
    evidence: [...wealth, ...keyEvidence('dayBranch', 'monthBranch'), ...pressure],
  })
  if (dayChanges.length > 0) emit({
    code: 'relationship_restructuring', topic: 'relationship', direction: 'mixed',
    strength: bothChangeSources(dayChanges) ? 'high' : 'medium', priority: 'high',
    evidence: dayChanges,
  })

  const repeated: Evidence[] = []
  const uniqueSources = (items: LuckFlowSource[]) => [...new Map(items.map((item) => [slot(item), item])).values()]
    .sort((a, b) => compare(slot(a), slot(b)))
  facts.flow.repeatedElements.forEach((fact, index) => {
    const origins = uniqueSources(fact.sources)
    repeated.push({ kind: 'repeatedElement', id: JSON.stringify(['repeatedElement', fact.element, origins.map(slot)]),
      paths: [`flow.repeatedElements[${index}]`], element: fact.element, sources: origins })
  })
  facts.flow.repeatedTenGods.forEach((fact, index) => {
    const origins = uniqueSources(fact.sources)
    repeated.push({ kind: 'repeatedTenGod', id: JSON.stringify(['repeatedTenGod', fact.tenGod, origins.map(slot)]),
      paths: [`flow.repeatedTenGods[${index}]`], tenGod: fact.tenGod, sources: origins })
  })
  const affectedCount = keys.filter((key) => facts.keyPillars[key].affected).length
  const timingA = affectedCount >= 2 && repeated.length > 0
  const timingB = keys.some((key) => {
    const fact = facts.keyPillars[key]
    return fact.affected && fact.byDaewoon && fact.byAnnual
  })
  if (timingA || timingB) emit({
    code: 'timing_transition', topic: 'timing', direction: 'mixed',
    strength: affectedCount === 3 ? 'high' : 'medium', priority: 'high',
    evidence: [...keyEvidence(...keys), ...(timingA ? repeated : [])],
  })
  const priority = { high: 0, medium: 1, low: 2 }
  const topic = { career: 0, money: 1, relationship: 2, timing: 3 }
  signals.sort((a, b) => priority[a.priority] - priority[b.priority] || topic[a.topic] - topic[b.topic] || compare(a.code, b.code))
  return { methodologyVersion: version, signals }
}

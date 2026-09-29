import { hasPeriod } from './context'
import type { NarrativeContext, NarrativeEvidence, NarrativeFactReference, NarrativeScope } from './types'

function readPath(value: unknown, path: string): unknown {
  if (!path || path.split('.').some((key) => !key || ['__proto__', 'prototype', 'constructor'].includes(key))) {
    throw new Error('Invalid fact path.')
  }
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) throw new Error(`Missing fact: ${path}`)
    value = Reflect.get(value, key)
  }
  if (value === undefined || value === null) throw new Error(`Unavailable fact: ${path}`)
  return value
}

function freeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  for (const child of Object.values(value)) freeze(child)
  Object.freeze(value)
}

/** On-demand references to existing facts; no analyzer or calendar calls.
 * Only observed pillar slots are independent roots. Derived dependencies are
 * assigned here, never supplied by a claim author. Aggregate dependencies are
 * deliberately conservative until narrower, reviewed lineage rules exist.
 */
export class NarrativeEvidenceRegistry {
  readonly #facts = new Map<string, NarrativeEvidence>()
  readonly #roots = new Map<string, readonly string[]>()
  readonly #byReference = new Map<string, NarrativeEvidence>()
  readonly #sources
  readonly #chartKey: string

  constructor(readonly context: NarrativeContext) {
    this.#sources = {
      natal: { value: context.natal, analyzer: 'calculateSaju', version: 'unversioned' },
      analysis: { value: context.analysis, analyzer: 'buildAnalysisFacts', version: 'unversioned' },
      strengthFacts: { value: context.strengthFacts, analyzer: 'buildStrengthFacts', version: 'unversioned' },
      strength: { value: context.strength, analyzer: 'assessStrength', version: context.strength.methodologyVersion },
      daewoon: { value: context.luck.daewoon, analyzer: 'analyzeDaewoon', version: context.daewoonResult.methodologyVersion },
      daewoonResult: { value: context.daewoonResult, analyzer: 'analyzeDaewoon', version: context.daewoonResult.methodologyVersion },
      annual: { value: context.luck.annual, analyzer: 'calculateAnnualLuck', version: 'unversioned' },
      interactions: { value: context.interactions, analyzer: 'analyzeLuckInteractions', version: 'unversioned' },
      flow: { value: context.flow, analyzer: 'analyzeLuckFlow', version: 'unversioned' },
      keyPillars: { value: context.keyPillars, analyzer: 'analyzeKeyPillarInteractions', version: 'unversioned' },
      interpretationFacts: { value: context.interpretationFacts, analyzer: 'buildInterpretationFacts', version: 'unversioned' },
    }
    this.#chartKey = JSON.stringify(['year', 'month', 'day', 'hour'].map((key) => readPath(context.natal, key)))
  }

  get(id: string): NarrativeEvidence | undefined { return this.#facts.get(id) }

  rootFactIds(id: string): readonly string[] {
    const roots = this.#roots.get(id)
    if (!roots) throw new Error('Unknown evidence id.')
    return roots
  }

  /** Export only reachable facts. Keeps selected plans self-contained and auditable. */
  collect(ids: readonly string[]): readonly NarrativeEvidence[] {
    const selected = new Map<string, NarrativeEvidence>()
    const visit = (id: string) => {
      if (selected.has(id)) return
      const fact = this.get(id)
      if (!fact) throw new Error('Unknown evidence id.')
      selected.set(id, fact)
      fact.derivedFrom?.forEach(visit)
    }
    ids.forEach(visit)
    return [...selected.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }

  register(reference: NarrativeFactReference): NarrativeEvidence {
    const key = JSON.stringify([reference.source, reference.path])
    const existing = this.#byReference.get(key)
    if (existing) return existing
    const descriptor = this.#sources[reference.source]
    const value = structuredClone(readPath(descriptor.value, reference.path))
    const parents = this.dependencies(reference).map((parent) => this.register(parent))
    const cycleMatch = reference.source === 'daewoonResult' ? /^cycles\.(\d+)\./.exec(reference.path) : null
    const cycle = cycleMatch ? this.context.daewoonResult.cycles[Number(cycleMatch[1])] : undefined
    const scope: NarrativeScope = reference.source === 'annual' || parents.some((parent) => parent.scope === 'annual') ? 'annual'
      : reference.source === 'daewoon' || cycle || parents.some((parent) => parent.scope === 'daewoon') ? 'daewoon' : 'natal'
    const luck = cycle ?? (scope === 'natal' ? undefined : this.context.luck[scope])
    const period = hasPeriod(luck) ? { startDateTime: luck.startDateTime, endDateTime: luck.endDateTime } : undefined
    const id = JSON.stringify(['narrative-evidence-v1', this.#chartKey, reference.source, reference.path,
      descriptor.version, scope, period ?? null])
    const derivedFrom = [...new Set(parents.map((parent) => parent.id))].sort()
    const fact: NarrativeEvidence = {
      id, source: reference.source, path: reference.path, analyzer: descriptor.analyzer, value, scope,
      ...(period ? { period } : {}), calculationVersion: descriptor.version, methodologyVersion: 'narrative-evidence-v1',
      ...(derivedFrom.length ? { derivedFrom } : {}),
    }
    freeze(fact)
    this.#facts.set(id, fact)
    this.#byReference.set(key, fact)
    this.#roots.set(id, Object.freeze(parents.length
      ? [...new Set(parents.flatMap((parent) => this.rootFactIds(parent.id)))].sort() : [id]))
    return fact
  }

  /** Shared roots form connected groups, including indirect overlap A↔AB↔B. */
  independentGroups(ids: readonly string[]): readonly (readonly string[])[] {
    const groups: { ids: string[]; roots: Set<string> }[] = []
    for (const id of [...new Set(ids)].sort()) {
      const roots = new Set(this.rootFactIds(id))
      const merged = [id]
      for (let index = groups.length - 1; index >= 0; index--) {
        const group = groups[index]
        if (![...group.roots].some((root) => roots.has(root))) continue
        merged.push(...group.ids)
        for (const root of group.roots) roots.add(root)
        groups.splice(index, 1)
      }
      groups.push({ ids: merged.sort(), roots })
    }
    return groups.map((group) => group.ids)
  }

  private natalSlots(position?: 'stem' | 'branch'): NarrativeFactReference[] {
    return (['year', 'month', 'day', 'hour'] as const).flatMap((pillar) =>
      (position ? [position] : ['stem', 'branch'] as const).flatMap((part) =>
        this.context.natal[pillar][part] === null ? [] : [{ source: 'natal' as const, path: `${pillar}.${part}` }]))
  }

  private luckSlots(): NarrativeFactReference[] {
    return (['daewoon', 'annual'] as const).flatMap((source) => this.context.luck[source]
      ? ['stem', 'branch'].map((path) => ({ source, path })) : [])
  }

  private dependencies({ source, path }: NarrativeFactReference): NarrativeFactReference[] {
    const [first, second, third] = path.split('.')
    const day: NarrativeFactReference = { source: 'natal', path: 'day.stem' }
    if (source === 'natal') {
      if (/^(year|month|day|hour)\.(stem|branch)$/.test(path)) return []
      if (first === 'elements' || first === 'tenGods') {
        if (third === 'stem' || third === 'branch') return [
          { source: 'natal', path: `${second}.${third}` }, ...(first === 'tenGods' ? [day] : []),
        ]
      }
      if (first === 'hiddenStems') return [{ source: 'natal', path: `${second}.branch` }]
      return this.natalSlots()
    }
    if (source === 'daewoon' || source === 'annual') {
      if (path === 'stem' || path === 'branch') {
        if (source === 'daewoon') {
          const index = this.context.daewoonResult.cycles.indexOf(this.context.luck.daewoon!)
          if (index >= 0) return [{ source: 'daewoonResult', path: `cycles.${index}.${path}` }]
        }
        return []
      }
      if (path === 'stemElement' || path === 'branchElement' || path === 'stemTenGod' || path === 'branchTenGod') {
        return [{ source, path: path.startsWith('stem') ? 'stem' : 'branch' }, ...(path.endsWith('TenGod') ? [day] : [])]
      }
      return [{ source, path: 'stem' }, { source, path: 'branch' }]
    }
    if (source === 'daewoonResult') {
      const match = /^cycles\.(\d+)\.(.+)$/.exec(path)
      if (!match) return this.natalSlots()
      const prefix = `cycles.${match[1]}`
      const field = match[2]
      if (field === 'stem' || field === 'branch') return []
      if (['stemElement', 'branchElement', 'stemTenGod', 'branchTenGod'].includes(field)) {
        return [{ source, path: `${prefix}.${field.startsWith('stem') ? 'stem' : 'branch'}` },
          ...(field.endsWith('TenGod') ? [day] : [])]
      }
      return [{ source, path: `${prefix}.stem` }, { source, path: `${prefix}.branch` }]
    }
    if (source === 'analysis') {
      // A specific finding depends only on its actual endpoints. Aggregates
      // retain their conservative whole-chart lineage; no relations are recalculated.
      const index = Number(third)
      if (first === 'exposure' && second === 'findings' && Number.isInteger(index)) {
        const finding = this.context.analysis.exposure.findings[index]
        const parts = path.split('.')
        const exposedIndex = Number(parts[4])
        const pillars = parts[3] === 'exposedPillars' && Number.isInteger(exposedIndex)
          ? [finding.exposedPillars[exposedIndex]] : finding.exposedPillars
        return [{ source: 'natal', path: `${finding.sourcePillar}.branch` },
          ...pillars.map((pillar): NarrativeFactReference => ({ source: 'natal', path: `${pillar}.stem` }))]
      }
      if (first === 'roots' && second === 'roots' && Number.isInteger(index)) {
        return [day, { source: 'natal', path: `${this.context.analysis.roots.roots[index].pillar}.branch` }]
      }
      const pairIndex = Number(second)
      const pairs = first === 'branchClashes' ? this.context.analysis.branchClashes
        : first === 'branchCombinations' ? this.context.analysis.branchCombinations
          : first === 'branchBreaks' ? this.context.analysis.branchBreaks
            : first === 'branchHarms' ? this.context.analysis.branchHarms : undefined
      if (pairs && Number.isInteger(pairIndex)) {
        return pairs[pairIndex].pillars.map((pillar) => ({ source: 'natal', path: `${pillar}.branch` }))
      }
      if (first === 'branchPunishments' && second === 'findings' && Number.isInteger(index)) {
        return this.context.analysis.branchPunishments.findings[index].pillars.map((pillar) => ({ source: 'natal', path: `${pillar}.branch` }))
      }
      if (first === 'seasonal') {
        if (second === 'dayStemElement') return [day]
        const month: NarrativeFactReference = { source: 'natal', path: 'month.branch' }
        return ['season', 'monthBranch', 'monthElement'].includes(second) ? [month] : [day, month]
      }
      if (first === 'hiddenCounts' || (first === 'presence' && third === 'hidden') || first.startsWith('branch')) return this.natalSlots('branch')
      if (first === 'stemCombinations') return this.natalSlots('stem')
      if (first === 'roots') return [day, ...this.natalSlots('branch')]
      return this.natalSlots()
    }
    // Whole strength aggregates share their underlying observations with counts,
    // roots and season. A copied level/confidence is never a fresh observation.
    if (source === 'strengthFacts' || source === 'strength') return this.natalSlots()
    if (source === 'flow') {
      if (first === 'dayStem' || first === 'dayElement') return [day]
      if (first === 'daewoon' || first === 'annual') {
        if (second === 'stemRelationToDayMaster' || second === 'branchRelationToDayMaster') {
          return [day, { source: first, path: second.startsWith('stem') ? 'stem' : 'branch' }]
        }
        if (second) return [{ source: first, path: path.slice(first.length + 1) }]
      }
      return [day, ...this.luckSlots()]
    }
    if (source === 'interactions') {
      const index = Number(second)
      const collections = this.context.interactions
      const list = Object.hasOwn(collections, first) ? collections[first as keyof typeof collections] : undefined
      const finding = Number.isInteger(index) && index >= 0 ? list?.[index] : undefined
      if (finding) {
        const position = first === 'stemCombinations' ? 'stem' : 'branch'
        return [finding.left, finding.right].map((endpoint): NarrativeFactReference => endpoint.source.source === 'natal'
          ? { source: 'natal', path: `${endpoint.source.pillar}.${position}` }
          : { source: endpoint.source.source, path: position })
      }
    }
    if (source === 'keyPillars') {
      const index = Number(third)
      const list = first === 'dayStem' ? this.context.keyPillars.dayStem.findings
        : first === 'dayBranch' ? this.context.keyPillars.dayBranch.findings
          : first === 'monthBranch' ? this.context.keyPillars.monthBranch.findings : undefined
      const finding = Number.isInteger(index) && index >= 0 ? list?.[index] : undefined
      if (second === 'findings' && finding) return [{ source: 'interactions', path: `${finding.origin.collection}.${finding.origin.index}` }]
    }
    if (source === 'interpretationFacts') {
      if (first === 'context') {
        if (second === 'dayStem' || second === 'dayElement') return [day]
        return this.natalSlots()
      }
      if (first === 'luck' && (second === 'daewoon' || second === 'annual') && third) {
        return [{ source: second, path: path.split('.').slice(2).join('.') }]
      }
      if (['flow', 'interactions', 'keyPillars'].includes(first) && second) {
        if (first === 'flow') return [{ source: 'flow', path: path.slice(5) }]
        if (first === 'interactions') return [{ source: 'interactions', path: path.slice(13) }]
        return [{ source: 'keyPillars', path: path.slice(11) }]
      }
    }
    // Composite interactions/flags retain all participating source scopes.
    return [...this.natalSlots(), ...this.luckSlots()]
  }
}

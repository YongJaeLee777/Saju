import 'astro:env/server'
import { and, eq } from 'drizzle-orm'
import { reportSnapshots } from '../../../db/schema'
import type { loadEntitledReportSnapshot } from '../../payments/server/report-access'
import { renderDeterministicNarrative } from '../narrative/deterministic-writer'
import { AI_NARRATIVE_MODEL, renderAiNarrative } from '../narrative/ai-writer'
import type { NarrativeJsonClient, NarrativeWriterChapter } from '../narrative/ai-writer'
import type { NarrativeResponseRejectReason } from '../narrative/ai-writer'
import { AiTransportFailure } from '../narrative/ai-failure'
import type { AiTransportFailureCode, SafeProviderError } from '../narrative/ai-failure'
import type { ChapterWritingBrief } from '../narrative/writing-brief'

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((item) => typeof item === 'string')
const period = (v: unknown) => record(v) && typeof v.startDateTime === 'string' && typeof v.endDateTime === 'string'
const point = (v: unknown) => record(v) && typeof v.code === 'string' && record(v.source)
  && (v.source.kind === 'claim' && typeof v.source.claimCode === 'string'
    && ['thesis', 'positiveSide', 'shadowSide'].includes(String(v.source.field))
    || v.source.kind === 'contextual-motif' && typeof v.source.motifCode === 'string'
    && ['positiveMeaning', 'shadowMeaning'].includes(String(v.source.field)))
const roles = ['hook', 'coreIdentity', 'socialSelf', 'privateSelf', 'relationship', 'work',
  'strengthInUse', 'recurringPattern', 'past', 'current', 'future', 'closing']
const containsRef = (refs: unknown, code: unknown) => Array.isArray(refs)
  && refs.some((source) => record(source) && source.code === code)
const validBridgeCoverage = (v: Record<string, unknown>) => {
  if (!Array.isArray(v.bridgeSourceRefs) || !Array.isArray(v.primarySourceRefs)
    || !Array.isArray(v.secondarySourceRefs) || !Array.isArray(v.sourceUses)) return false
  if (v.coverageMode !== 'neutral_bridge') return v.bridgeSourceRefs.length === 0
    && v.sourceUses.every((use) => record(use) && use.ownership !== 'bridge')
  return v.primarySourceRefs.length === 0 && v.secondarySourceRefs.length === 0
    && v.bridgeSourceRefs.length <= 1 && v.confidence === undefined
    && v.sourceUses.every((use) => record(use) && use.ownership === 'bridge'
      && ['social_context_bridge', 'relationship_context_bridge', 'pattern_caution_bridge'].includes(String(use.angle)))
}

/** Stored JSON is still untrusted at the deserialization boundary. */
function writingBrief(v: unknown): v is ChapterWritingBrief {
  return record(v) && v.methodologyVersion === 'writing-brief-v1'
    && typeof v.chapter === 'number' && Number.isInteger(v.chapter) && v.chapter >= 1 && v.chapter <= 12
    && v.role === roles[v.chapter - 1]
    && ['self_question', 'identity_frame', 'visible_pattern', 'inner_processing', 'relationship_adjustment',
      'work_pattern', 'strength_in_use', 'hidden_pattern', 'past_direction', 'current_change', 'future_direction', 'synthesis'].includes(String(v.headlineIntent))
    && (v.confidence === undefined || v.confidence === 'strong' || v.confidence === 'medium')
    && Array.isArray(v.sourceClaimRefs) && v.sourceClaimRefs.every((ref) => record(ref) && typeof ref.code === 'string'
      && ['primaryTension', 'hook', 'socialSelf', 'privateSelf', 'relationship', 'work', 'hiddenStrength',
        'recurringPattern', 'past', 'current', 'future'].includes(String(ref.planField))
      && (ref.confidence === 'strong' || ref.confidence === 'medium'))
    && ['primary', 'secondary', 'synthesis', 'neutral_bridge'].includes(String(v.coverageMode))
    && Array.isArray(v.primarySourceRefs) && v.primarySourceRefs.every((ref) => record(ref)
      && containsRef(v.sourceClaimRefs, ref.code))
    && Array.isArray(v.secondarySourceRefs) && v.secondarySourceRefs.every((ref) => record(ref)
      && containsRef(v.sourceClaimRefs, ref.code))
    && Array.isArray(v.bridgeSourceRefs) && v.bridgeSourceRefs.every((ref) => record(ref)
      && containsRef(v.sourceClaimRefs, ref.code))
    && Array.isArray(v.sourceUses) && v.sourceUses.every((use) => record(use) && typeof use.code === 'string'
      && containsRef(v.sourceClaimRefs, use.code)
      && ['behavior', 'positive_side', 'shadow', 'relationship_lens', 'work_lens', 'temporal_context',
        'contrast', 'synthesis', 'social_lens', 'choice_lens', 'simultaneous_tension', 'hook_preview',
        'social_context_bridge', 'relationship_context_bridge', 'pattern_caution_bridge'].includes(String(use.angle))
      && ['primary', 'secondary', 'bridge'].includes(String(use.ownership)))
    && validBridgeCoverage(v)
    && record(v.coreMessage) && ['synthesis', 'motif_framing', 'claim_focus', 'bridge_context'].includes(String(v.coreMessage.kind))
    && strings(v.coreMessage.sourceCodes)
    && Array.isArray(v.allowedPoints) && v.allowedPoints.every(point)
    && Array.isArray(v.shadowPoints) && v.shadowPoints.every(point)
    && Array.isArray(v.conditions) && v.conditions.every((c) => record(c) && typeof c.claimCode === 'string'
      && typeof c.code === 'string' && typeof c.factId === 'string' && ['string', 'number', 'boolean'].includes(typeof c.equals))
    && Array.isArray(v.evidenceSummary) && v.evidenceSummary.every((e) => record(e) && typeof e.factId === 'string'
      && typeof e.analyzer === 'string' && typeof e.path === 'string'
      && ['natal', 'analysis', 'strengthFacts', 'strength', 'daewoon', 'daewoonResult', 'annual', 'interactions',
        'flow', 'keyPillars', 'interpretationFacts'].includes(String(e.source))
      && ['natal', 'daewoon', 'annual'].includes(String(e.scope))
      && ['pillar', 'ten_god', 'interaction', 'flow', 'strength', 'other'].includes(String(e.factKind))
      && (e.observedValue === undefined || ['string', 'number', 'boolean'].includes(typeof e.observedValue))
      && (e.period === undefined || period(e.period)))
    && strings(v.forbiddenInferences) && v.forbiddenInferences.every((code) => ['actual_past_event',
      'mental_health_diagnosis', 'personality_diagnosis', 'spouse_trait_assertion', 'marriage_or_divorce_prediction',
      'job_change_prediction', 'wealth_event_prediction', 'unverified_ability', 'base_motif_personality',
      'relative_year_without_target_check'].includes(code))
    && Array.isArray(v.suggestedSceneDomains) && v.suggestedSceneDomains.every((d) => record(d)
      && typeof d.claimCode === 'string' && strings(d.domains) && d.domains.every((domain) =>
        ['work_meeting', 'planning', 'solo_reflection', 'close_relationship', 'decision_making'].includes(domain)))
    && (v.motifRef === undefined || record(v.motifRef) && typeof v.motifRef.code === 'string'
      && ['base', 'contextual'].includes(String(v.motifRef.mode))
      && ['standing_tree', 'twining_vine', 'daylight', 'lamplight', 'mountain_ground', 'garden_soil',
        'rough_metal', 'polished_metal', 'river_current', 'rainwater'].includes(String(v.motifRef.materialCode))
      && (v.motifRef.environmentCode === undefined || typeof v.motifRef.environmentCode === 'string')
      && (v.motifRef.tensionCode === undefined || typeof v.motifRef.tensionCode === 'string'))
    && (v.closingBridge === undefined || record(v.closingBridge) && v.closingBridge.toRole === 'closing'
      && typeof v.closingBridge.motifCode === 'string')
    && (v.temporalScope === undefined || record(v.temporalScope) && typeof v.temporalScope.referenceDate === 'string'
      && typeof v.temporalScope.referenceYear === 'number'
      && (v.temporalScope.annualTargetYear === null || typeof v.temporalScope.annualTargetYear === 'number')
      && Array.isArray(v.temporalScope.claims) && v.temporalScope.claims.every((c) => record(c)
        && typeof c.code === 'string' && ['natal', 'daewoon', 'annual'].includes(String(c.scope))
        && ['past', 'current', 'future', 'target'].includes(String(c.temporalRole)) && period(c.period)
        && ['daewoon_phase', 'annual_target_phase', 'daewoon_transition'].includes(String(c.phaseCode))
        && strings(c.activatedThemes) && c.activatedThemes.every((t) => ['peers', 'resource', 'output', 'wealth', 'officer'].includes(t))
        && (c.changeDirection === undefined || ['introduced', 'receded'].includes(String(c.changeDirection)))
        && (c.changeTheme === undefined || ['peers', 'resource', 'output', 'wealth', 'officer'].includes(String(c.changeTheme)))
        && (c.annualTargetYear === undefined || typeof c.annualTargetYear === 'number')))
}

type Access = Parameters<typeof loadEntitledReportSnapshot>[0]
type Snapshot = NonNullable<Awaited<ReturnType<typeof loadEntitledReportSnapshot>>>['snapshot']
type DiagnosticStage = 'request' | 'provider_response' | 'response_parse' | 'validation' | 'snapshot_save'
type SafeFailureCode = AiTransportFailureCode | NarrativeResponseRejectReason
  | 'empty-briefs' | 'input-too-large' | 'no_accepted_chapters' | 'chapter-fallback'
  | 'unexpected_error' | 'snapshot_save_failed'
type SafeFailure = { code: SafeFailureCode; stage: DiagnosticStage; httpStatus?: number;
  providerError?: SafeProviderError }
const safeToken = (value: unknown) => typeof value === 'string' && value.length <= 120
  && /^[A-Za-z0-9_.\[\]-]+$/.test(value) ? value : undefined
const transportStage = (code: AiTransportFailureCode): DiagnosticStage =>
  code === 'provider_http_error' || code === 'provider_response_schema_error' || code === 'empty_output'
    ? 'provider_response' : code === 'response_parse_error' ? 'response_parse' : 'request'
function transportFailure(error: AiTransportFailure): SafeFailure {
  const providerError = error.providerError
  const type = safeToken(providerError?.type)
  const code = safeToken(providerError?.code)
  const param = safeToken(providerError?.param)
  return { code: error.code, stage: transportStage(error.code),
    ...(Number.isInteger(error.httpStatus) && error.httpStatus! >= 100 && error.httpStatus! <= 599
      ? { httpStatus: error.httpStatus } : {}),
    ...(type || code || param ? { providerError: {
      ...(type ? { type } : {}), ...(code ? { code } : {}), ...(param ? { param } : {}),
    } } : {}),
  }
}
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, '0')).join('')

function snapshotText(chapters: readonly NarrativeWriterChapter[], mode: string,
  state: 'generating' | 'complete' | 'fallback_ready') {
  return JSON.stringify({ title: '나의 사주 이야기', intro: '관계와 일, 선택과 흐름을 함께 살펴보세요.', closing: '',
    sections: chapters.map((chapter) => ({ headline: chapter.title,
      body: chapter.paragraphs.map((paragraph) => paragraph.text).join('\n\n'), scopeLabel: `${chapter.chapter}장` })),
    paidNarrative: { version: 'paid-narrative-v1', state, mode },
  })
}

/** Only call with a freshly authorized snapshot. CAS consumes the sole attempt
 * before any provider access; crash/timeout/save failure leaves durable fallback.
 * Existing legacy snapshots are immutable. No purchase/entitlement writes.
 */
export async function completePaidNarrativeSnapshot(context: Access, snapshot: Snapshot,
  getClient: () => Promise<NarrativeJsonClient> = async () => (await import('./openai-narrative')).openAiNarrativeClient,
): Promise<string> {
  if (snapshot.schemaVersion !== 'paid-narrative-v1') return snapshot.reportJson
  let data: unknown
  try { data = JSON.parse(snapshot.reportJson) } catch { return snapshot.reportJson }
  if (!record(data) || !record(data.paidNarrative) || data.paidNarrative.version !== 'paid-narrative-v1'
    || data.paidNarrative.state !== 'pending' || !Array.isArray(data.paidNarrative.briefs)
    || data.paidNarrative.briefs.length > 12 || !data.paidNarrative.briefs.every(writingBrief)) return snapshot.reportJson
  const briefs = data.paidNarrative.briefs
  if (new Set(briefs.map((brief) => brief.chapter)).size !== briefs.length) return snapshot.reportJson
  const deterministic = renderDeterministicNarrative(briefs)
  const generating = snapshotText(deterministic, 'deterministic', 'generating')
  const generatingHash = await hash(generating)
  const fallback = snapshotText(deterministic, 'deterministic', 'fallback_ready')
  const fallbackHash = await hash(fallback)
  const claimed = await context.db.update(reportSnapshots).set({ reportJson: generating, reportHash: generatingHash })
    .where(and(eq(reportSnapshots.id, snapshot.id), eq(reportSnapshots.reportHash, snapshot.reportHash),
      eq(reportSnapshots.reportJson, snapshot.reportJson))).returning({ id: reportSnapshots.id })
  if (claimed.length !== 1) {
    const [current] = await context.db.select({ reportJson: reportSnapshots.reportJson }).from(reportSnapshots)
      .where(eq(reportSnapshots.id, snapshot.id)).limit(1)
    return current?.reportJson ?? fallback
  }
  const startedAt = performance.now()
  let outcome: 'ai' | 'partial_ai' | 'fallback' = 'fallback'
  let fallbackChapterCount = deterministic.length
  let validationRejectCount = 0
  let safeFailure: SafeFailure | undefined
  let stage: DiagnosticStage = 'request'
  let snapshotSaved = false
  let fallbackSaveAttempted = false
  const saveFallback = async () => {
    fallbackSaveAttempted = true
    const saved = await context.db.update(reportSnapshots).set({ reportJson: fallback, reportHash: fallbackHash })
      .where(and(eq(reportSnapshots.id, snapshot.id), eq(reportSnapshots.reportHash, generatingHash)))
      .returning({ id: reportSnapshots.id })
    if (saved.length === 1) { snapshotSaved = true; return fallback }
    const [current] = await context.db.select({ reportJson: reportSnapshots.reportJson }).from(reportSnapshots)
      .where(eq(reportSnapshots.id, snapshot.id)).limit(1)
    return current?.reportJson ?? fallback
  }
  try {
    if (!briefs.length) {
      safeFailure = { code: 'empty-briefs', stage: 'request' }
      stage = 'snapshot_save'
      return await saveFallback()
    }
    const client = await getClient()
    const observedClient: NarrativeJsonClient = { async complete(request) {
      try { return await client.complete(request) }
      catch (error) {
        if (error instanceof AiTransportFailure) safeFailure = transportFailure(error)
        throw error
      }
    } }
    let responseReject: NarrativeResponseRejectReason | undefined
    const result = await renderAiNarrative(briefs, observedClient, undefined,
      () => { validationRejectCount += 1 },
      (reason) => { responseReject = reason })
    fallbackChapterCount = result.chapters.filter((chapter) => chapter.rendererVersion !== 'ai-narrative-writer-v2').length
    if (result.mode === 'deterministic') {
      safeFailure ??= result.reason === 'timeout' ? { code: 'provider_timeout', stage: 'request' }
        : result.reason === 'request-error' ? { code: 'unexpected_error', stage: 'request' }
          : result.reason === 'invalid-response' ? { code: responseReject ?? 'no_accepted_chapters',
            stage: responseReject === 'invalid_json' ? 'response_parse' : 'validation' }
            : { code: result.reason, stage: 'request' }
      stage = 'snapshot_save'
      return await saveFallback()
    }
    const completed = snapshotText(result.chapters, result.mode, 'complete')
    stage = 'snapshot_save'
    const saved = await context.db.update(reportSnapshots).set({ reportJson: completed, reportHash: await hash(completed) })
      .where(and(eq(reportSnapshots.id, snapshot.id), eq(reportSnapshots.reportHash, generatingHash)))
      .returning({ id: reportSnapshots.id })
    if (saved.length === 1) {
      snapshotSaved = true
      outcome = result.mode === 'ai' ? 'ai' : 'partial_ai'
      if (result.mode === 'mixed') safeFailure = { code: result.reason, stage: 'validation' }
      return completed
    }
    safeFailure = { code: 'snapshot_save_failed', stage: 'snapshot_save' }
    return await saveFallback()
  } catch (error) {
    safeFailure = { code: stage === 'snapshot_save' ? 'snapshot_save_failed' : 'unexpected_error', stage }
    if (fallbackSaveAttempted) throw error
    return await saveFallback()
  } finally {
    const diagnostic = { event: 'paid_narrative_generation_complete', outcome,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)), model: AI_NARRATIVE_MODEL,
      fallbackChapterCount, validationRejectCount, snapshotSaved,
      ...(safeFailure ? { safeFailureCode: safeFailure.code, stage: safeFailure.stage,
        ...(safeFailure.httpStatus !== undefined ? { httpStatus: safeFailure.httpStatus } : {}),
        ...(safeFailure.providerError ? { providerError: safeFailure.providerError } : {}),
      } : {}),
    }
    try { console.info(JSON.stringify(diagnostic)) } catch { /* Logging must not change report delivery. */ }
  }
}

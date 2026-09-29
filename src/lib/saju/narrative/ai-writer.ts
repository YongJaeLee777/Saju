import { describeMotifMaterial, describeWritingPoint, forbiddenNarrativeRuleIds,
  renderDeterministicNarrative } from './deterministic-writer'
import type { RenderedNarrativeChapter, RenderedNarrativeParagraph, RenderedNarrativeSourceRef } from './deterministic-writer'
import type { ChapterWritingBrief } from './writing-brief'
import { AI_WRITER_MODEL } from './ai-model'
import { PROVIDER_TIMEOUT_REASON } from './ai-failure'

export const AI_NARRATIVE_TIMEOUT_MS = 60000
export const AI_NARRATIVE_MAX_OUTPUT_TOKENS = 8192
export const AI_NARRATIVE_MAX_INPUT_CHARS = 50_000
export const AI_NARRATIVE_MODEL = AI_WRITER_MODEL

const sourceRefSchema = { anyOf: [
  { type: 'object', properties: { kind: { type: 'string', enum: ['claim'] }, code: { type: 'string' } },
    required: ['kind', 'code'], additionalProperties: false },
  { type: 'object', properties: { kind: { type: 'string', enum: ['motif'] }, code: { type: 'string' } },
    required: ['kind', 'code'], additionalProperties: false },
  { type: 'object', properties: { kind: { type: 'string', enum: ['evidence'] }, factId: { type: 'string' } },
    required: ['kind', 'factId'], additionalProperties: false },
] } as const

/** Mirrors the existing paragraph-level provenance contract. Content checks
 * remain in validateChapter; the schema only constrains JSON shape. */
export const AI_NARRATIVE_RESPONSE_SCHEMA = { name: 'saju_narrative_v2', schema: {
  type: 'object', properties: { chapters: { type: 'array', items: {
    type: 'object', properties: {
      chapter: { type: 'integer' }, title: { type: 'string' },
      paragraphs: { type: 'array', items: { type: 'object', properties: {
        text: { type: 'string' }, sourceRefs: { type: 'array', items: sourceRefSchema },
      }, required: ['text', 'sourceRefs'], additionalProperties: false } },
      sourceRefs: { type: 'array', items: sourceRefSchema },
    }, required: ['chapter', 'title', 'paragraphs', 'sourceRefs'], additionalProperties: false,
  } } }, required: ['chapters'], additionalProperties: false,
} } as const

export interface NarrativeJsonClient {
  /** The sole transport call for the full brief array. It must honor signal. */
  complete(input: { readonly model: string; readonly instructions: string; readonly input: string;
    readonly maxOutputTokens: number; readonly signal: AbortSignal;
    readonly jsonSchema?: { readonly name: string; readonly schema: Record<string, unknown> } }): Promise<{
    readonly text: string
    readonly usage?: { readonly inputTokens: number; readonly outputTokens: number } | null
  }>
}
export interface AiRenderedNarrativeChapter extends Omit<RenderedNarrativeChapter, 'rendererVersion'> {
  readonly rendererVersion: 'ai-narrative-writer-v2'
}
export type NarrativeWriterChapter = RenderedNarrativeChapter | AiRenderedNarrativeChapter
export type NarrativeWriterResult = {
  readonly chapters: readonly NarrativeWriterChapter[]
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null
} & (
  | { readonly mode: 'ai'; readonly semanticGuarantee: false }
  | { readonly mode: 'mixed'; readonly reason: 'chapter-fallback'; readonly semanticGuarantee: false }
  | { readonly mode: 'deterministic'; readonly reason: 'empty-briefs' | 'input-too-large' | 'timeout' | 'request-error' | 'invalid-response' }
)
export type NarrativeResponseRejectReason = 'response_too_large' | 'invalid_json' | 'invalid_response'

type PromptProjection = { readonly instructions: string; readonly input: string;
  readonly evidenceAliases: ReadonlyMap<string, string>;
  readonly claimAliases: ReadonlyMap<string, string>;
  readonly motifAliases: ReadonlyMap<string, string> }
type AliasedSourceRef = { readonly kind: 'claim' | 'motif'; readonly code: string }
  | { readonly kind: 'evidence'; readonly factId: string }
type AliasMaps = Pick<PromptProjection, 'evidenceAliases' | 'claimAliases' | 'motifAliases'>

function allowedSourceAliases(brief: ChapterWritingBrief, aliases: AliasMaps): AliasedSourceRef[] {
  const claims: AliasedSourceRef[] = brief.sourceClaimRefs
    .filter((ref) => brief.coreMessage.sourceCodes.includes(ref.code))
    .flatMap((ref) => {
      const code = aliases.claimAliases.get(ref.code)
      return code ? [{ kind: 'claim' as const, code }] : []
    })
  const motif = brief.motifRef ? aliases.motifAliases.get(brief.motifRef.code) : undefined
  const evidence: AliasedSourceRef[] = brief.evidenceSummary.flatMap((fact) => {
    const factId = aliases.evidenceAliases.get(fact.factId)
    return factId ? [{ kind: 'evidence' as const, factId }] : []
  })
  return [...claims, ...(motif ? [{ kind: 'motif' as const, code: motif }] : []), ...evidence]
}
const SYSTEM_INSTRUCTIONS = [
  '당신은 사주를 새로 해석하는 사람이 아니라, 검증된 해석을 사람에게 들려주는 한국어 작가입니다. 입력의 permittedMeaning과 source alias 밖에서 사실·성향·능력·관계·사건을 만들지 마세요.',
  '한 번의 응답으로 입력된 12개 chapter의 제목과 본문을 작성하세요. 각 장의 coverageMode, primarySourceRefs, secondarySourceRefs, sourceUses.angle을 지키세요. primary는 직접 근거이고 secondary는 검증된 주장을 지정된 관점에서 다시 보는 보조 근거입니다.',
  '같은 source를 여러 장에서 쓸 수 있지만 같은 설명을 반복하지 마세요. 같은 source와 angle 조합을 다른 장의 핵심 메시지로 되풀이하지 마세요. positive_side는 이미 검증된 장점만, shadow는 이미 검증된 그림자만 씁니다.',
  'neutral_bridge의 bridgeSourceRefs와 sourceUses.angle은 이미 검증된 패턴을 연결하기 위한 참조입니다. 그 장의 사회적 모습·관계 성향·반복 문제를 증명하는 근거가 아닙니다. allowedPoints 또는 shadowPoints의 허용 의미만 짧게 연결하고 새 개인 특성을 주장하지 마세요. motif가 있더라도 base motif는 문학적 이미지일 뿐 성격 근거가 아닙니다.',
  'social_context_bridge는 함께 움직이는 상황이라는 맥락만, relationship_context_bridge는 가까운 관계에서 고려할 지점만, pattern_caution_bridge는 확인된 그림자를 주의해서 볼 지점으로만 씁니다. 타인의 평가·실제 관계 행동·반복 경험을 단정하지 마세요.',
  '사주를 잘 보는 사람이 옆에서 차분히 이야기하듯 자연스러운 해요체로 쓰세요. 생활 언어로 시작하고 확인된 패턴을 풀어 준 뒤, 필요할 때만 근거를 한 가지 짚으세요. 본 구조에서는, 해당 신호는, 분석 결과 같은 보고서 표현을 제목이나 본문에 쓰지 마세요.',
  '근거가 충분한 장은 2~4개의 자연스러운 짧은 문단을 쓰고, 근거가 적은 장은 짧게 쓰세요. 길이를 맞추기 위해 내용을 부풀리지 마세요. 제목은 행동·긴장·흐름의 일부를 보여주되 12개가 모두 질문형이 되지 않게 하세요. 별도 제목 생성 요청은 없습니다.',
  'social_lens는 함께 움직이는 상황에 한정하며 사회성·평판을 새로 단정하지 마세요. 특히 Social Lens의 secondary·neutral_bridge에서는 실제 사람들 앞에서 늘 그렇게 행동하거나 보인다고 말하지 말고, 허용된 방식이 그런 맥락에서 참고될 수 있거나 드러날 여지가 있다는 범위로 쓰세요. 제목과 본문 어디에도 반드시·무조건·확실히·틀림없이·분명히·예언·운명적으로 같은 단정어를 쓰지 마세요. choice_lens는 자기 기준과 선택의 관점에 한정하며 속마음이나 혼자 있을 때의 행동을 창작하지 마세요. relationship_lens는 가까운 관계에서 고려할 지점일 뿐 연애 성향, 배우자 성격, 애착유형을 확정하지 마세요.',
  'simultaneous_tension은 검증된 두 힘이 함께 작동할 때 생길 수 있는 지점만 설명합니다. 반복되는 실제 문제라고 단정하지 마세요. synthesis는 앞 장에서 실제 사용한 motif·claim·시간 방향만 회수하고 새 정보를 추가하지 마세요.',
  'suggestedSceneDomains는 가상의 일반 상황을 설명하는 범위입니다. 실제 과거 경험을 아는 듯이 쓰거나 미래의 결혼·이별·이직·재물 사건을 예언하지 마세요. 정신건강 진단이나 검증되지 않은 능력도 쓰지 마세요.',
  'past는 그 시기의 구조적 강조만, future는 다음 시기의 변화 가능성만 설명하세요. 9~11장의 제목과 본문에는 내부 category 이름을 쓰지 말고, 그 시기에 자기 방식과 주변을 맞추는 부분, 맡은 몫과 해야 할 일의 틀, 먼저 확인하고 정리하는 과정처럼 Brief가 허용한 의미만 생활어로 풀어 주세요. 실제 사건은 예측하거나 회고하지 마세요. Brief에 있는 날짜와 대운 기간은 정확히 유지하세요. current의 annualTargetYear가 있으면 해당 숫자 연도를 명시하고 referenceYear와 다르면 올해·금년·이번 해라고 하지 마세요. 현재 대운과 대상 연도 세운은 구분하세요.',
  '모든 제목과 문단은 그 장의 입력 source alias를 sourceRefs에 붙이세요. 입력의 forbiddenInferences를 지키세요. sourceRefs에는 입력된 claim·motif·evidence alias만 사용하세요. raw code를 추측하지 마세요.',
  '최종 제목과 본문은 분석 보고서가 아니라 사주를 펼쳐 놓고 한 사람에게 이야기하는 자연스러운 해요체로 쓰세요. 가능하면 허용된 일반 상황이나 질문에서 시작해, 해당 장의 패턴과 장점 또는 그림자를 짧게 풀고 다음 이야기로 연결하세요. suggestedSceneDomains 밖의 장면이나 실제 경험은 만들지 마세요.',
  '내부 분석 label은 입력을 이해할 때만 쓰세요. 다음 다섯 문자열은 최종 title·prose에 사용하지 마세요: 준비와 분석, 책임과 구조, 독립과 조율, 표현과 생산, 자원과 선택. 자율과 조율, 자원 선택과 현실화, 겉의 방식과 내부의 받침도 분석 label 그대로 옮기지 마세요. permittedMeaning이 허용하는 경우에만 각각 먼저 확인하고 정리하는 과정, 맡은 몫과 해야 할 일의 틀, 자기 방식을 지키면서 주변과 맞추는 부분, 생각을 실제 결과로 옮기는 과정, 시간과 힘을 어디에 둘지 고르는 문제처럼 사람 언어로 풀어 주세요. 이 예시를 새 행동·감정·능력이나 실제 사건으로 확장하지 마세요. 특히 9~12장의 제목과 본문을 다 쓴 뒤 내부 label이 남았는지 확인하고 허용된 생활어로 바꾸세요.',
  '안전 규칙을 본문에서 설명하지 마세요. 단정할 수 없어요, 범위에 한정돼요, 실제 행동을 단정하지 않아요, 결과를 뜻하는 것은 아니에요 같은 메타 문구를 반복하지 말고, 허용된 내용만 조건부 표현으로 쓰세요. 살피다·방향·흐름·기준·놓이다·정리하다·함께와 ~할 수 있어요를 한 리포트에서 습관적으로 되풀이하지 마세요. 문맥에 맞으면 돌아보다·가늠하다·확인하다·나누어 보다·무게를 두다·이어 가다·드러나다 등으로 바꾸되, 단어를 바꾸려고 의미를 더하지 마세요.',
  '12장을 한꺼번에 읽으며 이미 설명한 핵심 의미를 기억하세요. 같은 source가 다시 등장하면 앞 장의 정의를 되풀이하지 말고 sourceUses.angle에 해당하는 부분만 다루세요. behavior는 패턴 자체, work_lens는 일의 맥락, positive_side는 이미 허용된 장점, shadow는 이미 허용된 그림자, bridge angle은 맥락 연결입니다. 서로 다른 angle이어도 같은 핵심 문장을 바꿔 반복하지 마세요.',
  'neutral_bridge는 새 개인 특성을 설명하는 장이 아닙니다. 검증된 source를 해당 관점에 연결하는 짧은 문단 하나를 기본으로 쓰세요. 허용된 의미가 충분하지 않으면 두 번째 문단을 만들어 분량을 늘리지 마세요. 회의·연애·직장 같은 구체 장면은 suggestedSceneDomains와 해당 source 의미가 모두 허용할 때만 쓰고, 근거가 약하면 일반 맥락으로 짧게 연결하세요. 특히 socialSelf, relationship, recurringPattern에서 일반론이나 새 행동을 덧붙이지 마세요.',
  '근거가 충분한 장은 보통 2~3개의 자연스러운 문단으로 쓰되 길이를 맞추려 같은 뜻을 반복하지 마세요. 제목은 분석 category처럼 쓰지 말고 확인된 행동·긴장·상황·시기 변화 중 그 장에 맞는 일부를 짧게 보여 주세요. 서술형·대조형·변화형·장면형·질문형을 자연스럽게 섞되, 문법을 다양하게 하려고 새 성향을 보태지 마세요. 시적인 추상어와 보고서식 제목을 피하세요. 매 장 끝에 ~하면 좋아요·~해 보세요·~하는 것이 좋겠습니다 같은 조언을 붙이지 마세요. 설명이나 장점·그림자에서 끝나도 좋고, 제안은 꼭 필요할 때만 짧게 쓰세요.',
  '1장 hook은 보고서 서론이나 분석 요약으로 시작하지 말고, 허용된 검증 패턴을 생활 언어로 바로 보여주세요. 12장 closing은 앞 장의 claim이나 내부 label을 목록처럼 다시 열거하지 말고, 앞 장에서 실제 사용한 생활어 표현과 핵심 이미지 하나, 허용된 긴장이나 장점 하나, 현재에서 다음 시기로 이어지는 변화 정도만 묶으세요. 앞에서 살핀·다시 떠올려·함께 놓아 보면 같은 요약 문구를 반복하지 말고 새 FACT·CLAIM을 더하지 마세요. 잦아지다는 사건이나 행동의 빈도가 높아질 때만 쓰고 비중·강도·무게가 낮아지거나 특정 방향이 약해지는 뜻에는 쓰지 마세요. 감소를 말할 때는 줄어들다·옅어지다·비중이 낮아지다·무게가 덜 실리다 중 문맥에 맞는 자연스러운 표현을 고르세요. 문법적·의미적 자연스러움을 표현 다양성보다 우선하세요.',
  'JSON object 하나만 반환하세요. 형식: {"chapters":[{"chapter":1,"title":"...","paragraphs":[{"text":"...","sourceRefs":[{"kind":"claim","code":"c1"}]}],"sourceRefs":[{"kind":"claim","code":"c1"}]}]}. HTML·Markdown·추가 필드는 금지합니다.',
].join('\n')

function safeName(value: string | undefined): string | undefined {
  const name = value?.trim()
  return name && name.length <= 30 && /^[\p{L}\p{M} .'-]+$/u.test(name) ? name : undefined
}

/** Only allowlisted WritingBrief fields cross the model boundary. Evidence IDs
 * encode natal chart identity, so the model sees per-request opaque aliases. */
export function buildAiNarrativeRequest(briefs: readonly ChapterWritingBrief[], displayName?: string): PromptProjection {
  const ids = [...new Set(briefs.flatMap((brief) => [
    ...brief.evidenceSummary.map((fact) => fact.factId), ...brief.conditions.map((condition) => condition.factId),
  ]))].sort()
  const aliases = new Map(ids.map((id, index) => [id, `e${index + 1}`]))
  const claimCodes = [...new Set(briefs.flatMap((brief) => brief.sourceClaimRefs.map((ref) => ref.code)))].sort()
  const claimAliases = new Map(claimCodes.map((code, index) => [code, `c${index + 1}`]))
  const motifCodes = [...new Set(briefs.flatMap((brief) => brief.motifRef ? [brief.motifRef.code] : []))].sort()
  const motifAliases = new Map(motifCodes.map((code, index) => [code, `m${index + 1}`]))
  const aliasProjection = { evidenceAliases: aliases, claimAliases, motifAliases }
  const chapters = briefs.map((brief) => ({
    chapter: brief.chapter, role: brief.role, headlineIntent: brief.headlineIntent,
    coverageMode: brief.coverageMode,
    primarySourceRefs: brief.primarySourceRefs.map((ref) => claimAliases.get(ref.code)),
    secondarySourceRefs: brief.secondarySourceRefs.map((ref) => claimAliases.get(ref.code)),
    bridgeSourceRefs: brief.bridgeSourceRefs.map((ref) => claimAliases.get(ref.code)),
    sourceUses: brief.sourceUses.map((use) => ({ sourceRef: claimAliases.get(use.code), angle: use.angle,
      ownership: use.ownership })),
    coreMessage: { kind: brief.coreMessage.kind,
      sourceCodes: brief.coreMessage.sourceCodes.map((code) => claimAliases.get(code)) },
    allowedPoints: brief.allowedPoints.flatMap((point) => {
      const permittedMeaning = describeWritingPoint(brief, point, false)
      const sourceRef = point.source.kind === 'claim' ? claimAliases.get(point.source.claimCode)
        : motifAliases.get(point.source.motifCode)
      return permittedMeaning && sourceRef ? [{ sourceRef, field: point.source.field, permittedMeaning }] : []
    }),
    shadowPoints: brief.shadowPoints.flatMap((point) => {
      const permittedMeaning = describeWritingPoint(brief, point, true)
      const sourceRef = point.source.kind === 'claim' ? claimAliases.get(point.source.claimCode)
        : motifAliases.get(point.source.motifCode)
      return permittedMeaning && sourceRef ? [{ sourceRef, field: point.source.field, permittedMeaning }] : []
    }),
    conditions: brief.conditions.map((condition) => ({ claimRef: claimAliases.get(condition.claimCode),
      code: condition.code, factId: aliases.get(condition.factId), equals: condition.equals })),
    evidenceSummary: brief.evidenceSummary.map((fact) => ({ factId: aliases.get(fact.factId),
      factKind: fact.factKind, scope: fact.scope,
      ...(fact.observedValue !== undefined ? { observedValue: fact.observedValue } : {}),
      ...(fact.period ? { period: fact.period } : {}) })),
    ...(brief.motifRef ? { motifRef: { code: motifAliases.get(brief.motifRef.code),
      mode: brief.motifRef.mode, materialImage: describeMotifMaterial(brief.motifRef) } } : {}),
    ...(brief.temporalScope ? { temporalScope: { ...brief.temporalScope,
      claims: brief.temporalScope.claims.map((claim) => ({ ...claim,
        code: claimAliases.get(claim.code) })) } } : {}),
    forbiddenInferences: brief.forbiddenInferences, suggestedSceneDomains: brief.suggestedSceneDomains
      .map((item) => ({ sourceRef: claimAliases.get(item.claimCode), domains: item.domains })),
    ...(brief.closingBridge ? { closingBridge: { toRole: 'closing',
      motifRef: motifAliases.get(brief.closingBridge.motifCode) } } : {}),
    ...(brief.chapter === 12 ? { allowedSourceRefs: allowedSourceAliases(brief, aliasProjection) } : {}),
  }))
  const name = safeName(displayName)
  return { instructions: SYSTEM_INSTRUCTIONS,
    input: JSON.stringify({ ...(name ? { displayName: name } : {}), chapters }), evidenceAliases: aliases,
    claimAliases, motifAliases }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && keys.every((key, index) => key === actual[index])
}
function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    && !/[<>\p{Cc}\p{Cf}]/u.test(value)
}
function readRefs(value: unknown, brief: ChapterWritingBrief, aliases: PromptProjection): RenderedNarrativeSourceRef[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null
  if (brief.chapter === 12) {
    const allowed = allowedSourceAliases(brief, aliases)
    if (value.some((item) => !record(item) || !allowed.some((ref) => ref.kind === item.kind
      && (ref.kind === 'evidence' ? ref.factId === item.factId : ref.code === item.code)))) return null
  }
  const reverse = new Map([...aliases.evidenceAliases].map(([id, alias]) => [alias, id]))
  const reverseClaims = new Map([...aliases.claimAliases].map(([code, alias]) => [alias, code]))
  const reverseMotifs = new Map([...aliases.motifAliases].map(([code, alias]) => [alias, code]))
  const refs: RenderedNarrativeSourceRef[] = []
  for (const item of value) {
    if (!record(item)) return null
    if (item.kind === 'claim' && exactKeys(item, ['code', 'kind']) && typeof item.code === 'string') {
      const source = brief.sourceClaimRefs.find((ref) => ref.code === reverseClaims.get(item.code as string))
      if (!source || !brief.coreMessage.sourceCodes.includes(source.code)) return null
      refs.push({ kind: 'claim', planField: source.planField, code: source.code })
    } else if (item.kind === 'motif' && exactKeys(item, ['code', 'kind'])
      && brief.motifRef && reverseMotifs.get(item.code as string) === brief.motifRef.code) {
      refs.push({ kind: 'motif', code: brief.motifRef.code })
    } else if (item.kind === 'evidence' && exactKeys(item, ['factId', 'kind']) && typeof item.factId === 'string') {
      const id = reverse.get(item.factId)
      if (!id || !brief.evidenceSummary.some((fact) => fact.factId === id)) return null
      refs.push({ kind: 'evidence', factId: id })
    } else return null
  }
  return [...new Map(refs.map((ref) => [JSON.stringify(ref), ref])).values()]
}

export type ForbiddenContentRuleId = import('./writing-brief').ForbiddenInference
  | 'certainty_assertion' | 'actual_past_event_without_scope' | 'base_motif_trait_assertion'
  | 'base_motif_without_claim_trait' | 'neutral_bridge_trait_assertion'
  | 'unsupported_social_reputation' | 'unsupported_private_emotion'
  | 'unsupported_relationship_trait' | 'unsupported_recurring_problem'
  | 'temporal_scope_without_claim'

export function forbiddenContentRuleIds(brief: ChapterWritingBrief, text: string,
  refs: readonly RenderedNarrativeSourceRef[]): ForbiddenContentRuleId[] {
  const motifOnly = refs.every((ref) => ref.kind === 'motif')
  const matched: ForbiddenContentRuleId[] = [...forbiddenNarrativeRuleIds(brief, text, motifOnly)]
  if (/반드시|무조건|확실히|틀림없이|분명히|예언|운명적으로/.test(text)) matched.push('certainty_assertion')
  if (/지난 (?:회사|직장|학교|연애)|과거에 실제로|당신이.{0,30}(?:했|겪)/.test(text))
    matched.push('actual_past_event_without_scope')
  if (brief.motifRef?.mode === 'base' && refs.some((ref) => ref.kind === 'motif')
    && /(?:나무|덩굴|빛|등불|땅|흙|금속|물줄기|빗물).{0,35}(?:성격|성향|재능|능력|당신은)/.test(text))
    matched.push('base_motif_trait_assertion')
  if (brief.motifRef?.mode === 'base' && brief.sourceClaimRefs.length === 0
    && /성격|성향|재능|능력|판단|습관|행동|마음|당신은|사람(?:입니다|이에요)/.test(text))
    matched.push('base_motif_without_claim_trait')
  if (brief.coverageMode === 'neutral_bridge' && /(?:당신은|당신의|원래|늘|항상).{0,30}(?:성격|성향|습관|행동|마음|능력|재능|선택)/.test(text))
    matched.push('neutral_bridge_trait_assertion')
  if (brief.role === 'socialSelf' && brief.coverageMode !== 'primary'
    && /인기가 많|평판이|사교적|사회성이|사람들이 당신을/.test(text))
    matched.push('unsupported_social_reputation')
  if (brief.role === 'privateSelf' && brief.coverageMode === 'secondary'
    && /속마음은|숨은 감정|혼자 있을 때 (?:항상|늘|반드시|자주)/.test(text))
    matched.push('unsupported_private_emotion')
  if (brief.role === 'relationship' && brief.coverageMode !== 'primary'
    && /연애를 (?:잘|못)|연애 스타일|애착 ?유형|배우자의 성격|사랑에 서툴|가까워질수록.{0,20}(?:늘|항상)/.test(text))
    matched.push('unsupported_relationship_trait')
  if (brief.role === 'recurringPattern' && brief.coverageMode !== 'primary'
    && /(?:늘|항상|매번|자꾸) (?:반복|부딪|갈등)|반복되는 문제|계속 같은 문제/.test(text))
    matched.push('unsupported_recurring_problem')
  if ((brief.role === 'past' || brief.role === 'future') && !brief.temporalScope
    && /(?:그 시기|지난 시기|다음 시기).{0,30}(?:강조|변화|달라)/.test(text))
    matched.push('temporal_scope_without_claim')
  return [...new Set(matched)]
}

export type NarrativeChapterRejectReason = 'invalid_shape' | 'invalid_source_ref' | 'forbidden_content'
  | 'missing_target_year' | 'duplicate_chapter'
export type NarrativeChapterRejectDetails = { readonly ruleIds: readonly ForbiddenContentRuleId[] }

function validateChapter(value: unknown, brief: ChapterWritingBrief,
  aliases: PromptProjection, reject: (reason: NarrativeChapterRejectReason,
    details?: NarrativeChapterRejectDetails) => void): AiRenderedNarrativeChapter | null {
  if (!record(value) || !exactKeys(value, ['chapter', 'paragraphs', 'sourceRefs', 'title'])
    || value.chapter !== brief.chapter || !validText(value.title, 90)
    || !Array.isArray(value.paragraphs) || value.paragraphs.length < 1 || value.paragraphs.length > 4) {
    reject('invalid_shape'); return null
  }
  const chapterRefs = readRefs(value.sourceRefs, brief, aliases)
  if (!chapterRefs) { reject('invalid_source_ref'); return null }
  const titleRules = forbiddenContentRuleIds(brief, value.title, chapterRefs)
  if (titleRules.length) { reject('forbidden_content', { ruleIds: titleRules }); return null }
  const paragraphs: RenderedNarrativeParagraph[] = []
  for (const item of value.paragraphs) {
    if (!record(item) || !exactKeys(item, ['sourceRefs', 'text']) || !validText(item.text, 500)) {
      reject('invalid_shape'); return null
    }
    const refs = readRefs(item.sourceRefs, brief, aliases)
    if (!refs || refs.some((ref) => !chapterRefs.some((parent) => JSON.stringify(parent) === JSON.stringify(ref)))) {
      reject('invalid_source_ref'); return null
    }
    const paragraphRules = forbiddenContentRuleIds(brief, item.text, refs)
    if (paragraphRules.length) { reject('forbidden_content', { ruleIds: paragraphRules }); return null }
    paragraphs.push({ text: item.text, sourceRefs: refs })
  }
  const allText = `${value.title} ${paragraphs.map((item) => item.text).join(' ')}`
  if (brief.role === 'current') {
    const annual = brief.temporalScope?.claims.find((claim) => claim.temporalRole === 'target')
    if (annual?.annualTargetYear && !allText.includes(`${annual.annualTargetYear}년`)) {
      reject('missing_target_year'); return null
    }
  }
  return { chapter: brief.chapter,
    chapterMarkerKey: `chapter_${String(brief.chapter).padStart(2, '0')}_${brief.role}`,
    title: value.title, paragraphs, sourceRefs: chapterRefs, rendererVersion: 'ai-narrative-writer-v2' }
}

function validateResponse(text: string, briefs: readonly ChapterWritingBrief[],
  aliases: PromptProjection, onRejectedChapter?: (chapter: number, reason: NarrativeChapterRejectReason,
    details?: NarrativeChapterRejectDetails) => void,
  onRejectedResponse?: (reason: NarrativeResponseRejectReason) => void,
): Map<number, AiRenderedNarrativeChapter> | null {
  if (text.length > 75_000) { onRejectedResponse?.('response_too_large'); return null }
  let value: unknown
  try { value = JSON.parse(text) } catch { onRejectedResponse?.('invalid_json'); return null }
  if (!record(value) || !exactKeys(value, ['chapters']) || !Array.isArray(value.chapters)) {
    onRejectedResponse?.('invalid_response'); return null
  }
  const byChapter = new Map<number, ChapterWritingBrief>(briefs.map((brief) => [brief.chapter, brief]))
  const output = new Map<number, AiRenderedNarrativeChapter>()
  const seen = new Set<number>()
  const duplicates = new Set<number>()
  for (const item of value.chapters) {
    if (!record(item) || typeof item.chapter !== 'number') continue
    const brief = byChapter.get(item.chapter)
    if (!brief) continue
    if (seen.has(item.chapter)) {
      output.delete(item.chapter); duplicates.add(item.chapter)
      onRejectedChapter?.(item.chapter, 'duplicate_chapter')
      continue
    }
    seen.add(item.chapter)
    if (duplicates.has(item.chapter)) continue
    const validated = validateChapter(item, brief, aliases, (reason, details) =>
      onRejectedChapter?.(brief.chapter, reason, details))
    if (validated) output.set(brief.chapter, validated)
  }
  return output
}

/** One model call for all briefs, never per chapter. A missing AI chapter uses
 * the deterministic version; malformed top-level responses fall back wholly. */
export async function renderAiNarrative(briefs: readonly ChapterWritingBrief[], client: NarrativeJsonClient,
  displayName?: string,
  onRejectedChapter?: (chapter: number, reason: NarrativeChapterRejectReason,
    details?: NarrativeChapterRejectDetails) => void,
  onRejectedResponse?: (reason: NarrativeResponseRejectReason) => void): Promise<NarrativeWriterResult> {
  const fallback = renderDeterministicNarrative(briefs)
  const deterministic = (reason: Extract<NarrativeWriterResult, { mode: 'deterministic' }>['reason']): NarrativeWriterResult =>
    ({ mode: 'deterministic', reason, chapters: fallback, usage: null })
  if (briefs.length === 0) return deterministic('empty-briefs')
  const request = buildAiNarrativeRequest(briefs, displayName)
  if (request.input.length > AI_NARRATIVE_MAX_INPUT_CHARS) return deterministic('input-too-large')
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(PROVIDER_TIMEOUT_REASON); reject(new Error('timeout')) }, AI_NARRATIVE_TIMEOUT_MS)
    })
    const answer = await Promise.race([client.complete({ model: AI_NARRATIVE_MODEL,
      instructions: request.instructions, input: request.input,
      maxOutputTokens: AI_NARRATIVE_MAX_OUTPUT_TOKENS, signal: controller.signal,
      jsonSchema: AI_NARRATIVE_RESPONSE_SCHEMA }), timeout])
    const validated = validateResponse(answer.text, briefs, request, onRejectedChapter, onRejectedResponse)
    if (!validated) return deterministic('invalid-response')
    const chapters = briefs.flatMap<NarrativeWriterChapter>((brief) => {
      const ai = validated.get(brief.chapter)
      return ai ? [ai] : fallback.filter((item) => item.chapter === brief.chapter)
    })
    const usage = answer.usage && Number.isSafeInteger(answer.usage.inputTokens)
      && Number.isSafeInteger(answer.usage.outputTokens) && answer.usage.inputTokens >= 0
      && answer.usage.outputTokens >= 0 ? answer.usage : null
    if (validated.size === 0) return deterministic('invalid-response')
    return validated.size === briefs.length
      ? { mode: 'ai', semanticGuarantee: false, chapters, usage }
      : { mode: 'mixed', reason: 'chapter-fallback', semanticGuarantee: false, chapters, usage }
  } catch {
    return deterministic(controller.signal.aborted ? 'timeout' : 'request-error')
  } finally { clearTimeout(timer) }
}

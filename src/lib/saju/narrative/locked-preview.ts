import { describeWritingBriefTitle } from './deterministic-writer'
import type { ChapterNumber, ChapterWritingBrief } from './writing-brief'

const SLOTS = [
  { chapter: 1, animalKey: 'rat', neutral: '이야기의 첫 장면에서 살펴볼 것' },
  { chapter: 2, animalKey: 'ox', neutral: '나를 설명하는 이미지의 시작' },
  { chapter: 3, animalKey: 'tiger', neutral: '사람들 앞에서 드러나는 방식' },
  { chapter: 4, animalKey: 'rabbit', neutral: '혼자 있을 때 살피게 되는 것' },
  { chapter: 5, animalKey: 'dragon', neutral: '가까운 관계에서 드러나는 방식' },
  { chapter: 6, animalKey: 'snake', neutral: '일의 흐름에서 살펴볼 선택' },
  { chapter: 7, animalKey: 'horse', neutral: '잘 작동하는 방향을 살펴본다면' },
  { chapter: 8, animalKey: 'sheep', neutral: '반복되는 선택에서 볼 수 있는 것' },
  { chapter: 9, animalKey: 'monkey', neutral: '지나온 시기의 흐름을 돌아보면' },
  { chapter: 10, animalKey: 'rooster', neutral: '2026년의 흐름에서 살펴볼 것' },
  { chapter: 11, animalKey: 'dog', neutral: '다음 흐름에서 달라질 수 있는 것' },
  { chapter: 12, animalKey: 'pig', neutral: '이야기의 끝에서 다시 볼 장면' },
] as const satisfies readonly { chapter: ChapterNumber; animalKey: string; neutral: string }[]

export type LockedPreviewChapter = {
  readonly chapter: ChapterNumber
  readonly animalKey: typeof SLOTS[number]['animalKey']
  readonly title: string
  readonly locked: true
  readonly teaser?: string
}

/** Deliberately drops all WritingBrief content except a short, approved title. */
export function buildLockedPreview(briefs: readonly ChapterWritingBrief[]): readonly LockedPreviewChapter[] {
  const byChapter = new Map(briefs.map((brief) => [brief.chapter, brief]))
  const used = new Set<string>()
  return SLOTS.map((slot): LockedPreviewChapter => {
    const brief = byChapter.get(slot.chapter)
    const grounded = brief && brief.evidenceSummary.length > 0
      && (brief.sourceClaimRefs.length > 0 || brief.motifRef !== undefined)
    const candidate = grounded ? describeWritingBriefTitle(brief) : undefined
    const neutral = used.has(slot.neutral) ? `${slot.neutral} 다시 보기` : slot.neutral
    const title = candidate && candidate.length <= 48 && !used.has(candidate) ? candidate : neutral
    used.add(title)
    return { chapter: slot.chapter, animalKey: slot.animalKey, title, locked: true }
  })
}

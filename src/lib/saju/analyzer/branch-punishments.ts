import type { BranchPunishmentAnalysis, BranchPunishmentFinding, BranchPunishmentGroup, RootPillar, SajuResult } from '../types'

const GROUPS: readonly { group: BranchPunishmentGroup; branches: readonly string[] }[] = [
  { group: '인사신', branches: ['인', '사', '신'] },
  { group: '축술미', branches: ['축', '술', '미'] },
]
const SELF_BRANCHES: readonly string[] = ['진', '오', '유', '해']

/** 확정된 존재/위치 정책만 적용하며 강도나 해석은 계산하지 않는다. */
export function analyzeBranchPunishments(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'>,
): BranchPunishmentAnalysis {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const entries = pillars.flatMap((pillar) => {
    const branch = result[pillar].branch
    return branch === null ? [] : [{ pillar, branch }]
  })
  const findings: BranchPunishmentFinding[] = []
  const completeGroups = new Set<BranchPunishmentGroup>()

  for (const { group, branches } of GROUPS) {
    if (!branches.every((branch) => entries.some((entry) => entry.branch === branch))) continue
    const members = entries.filter((entry) => branches.includes(entry.branch))
    completeGroups.add(group)
    findings.push({
      type: 'three-punishment', group, complete: true,
      pillars: members.map(({ pillar }) => pillar),
      branches: members.map(({ branch }) => branch),
    })
  }

  for (const [index, first] of entries.entries()) {
    for (const second of entries.slice(index + 1)) {
      const pair: { pillars: [RootPillar, RootPillar]; branches: [string, string] } = {
        pillars: [first.pillar, second.pillar], branches: [first.branch, second.branch],
      }
      if (first.branch === second.branch) {
        if (SELF_BRANCHES.includes(first.branch)) findings.push({ type: 'self-punishment', ...pair })
        continue
      }
      if ((first.branch === '자' && second.branch === '묘') || (first.branch === '묘' && second.branch === '자')) {
        findings.push({ type: 'mutual-punishment', ...pair })
        continue
      }
      const group = GROUPS.find(({ branches }) => branches.includes(first.branch) && branches.includes(second.branch))
      if (group && !completeGroups.has(group.group)) {
        findings.push({ type: 'three-punishment', group: group.group, complete: false, ...pair })
      }
    }
  }

  return { hasPunishment: findings.length > 0, findings }
}

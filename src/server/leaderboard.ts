import type { PersonStatistics } from "@/server/person-statistics";

export function compareLeaderboardPeople(left: PersonStatistics, right: PersonStatistics) {
  const leftMatchCount = left.matches.length;
  const rightMatchCount = right.matches.length;
  const leftHasMatches = leftMatchCount > 0;
  const rightHasMatches = rightMatchCount > 0;

  if (leftHasMatches !== rightHasMatches) {
    return leftHasMatches ? -1 : 1;
  }

  return right.totalCompetitionPoints - left.totalCompetitionPoints
    || rightMatchCount - leftMatchCount
    || left.person.displayName.localeCompare(right.person.displayName, "zh-CN");
}

import { JobListing } from "../types/job-search.types";
import { ResumeProfile } from "../types/resume.types";

export interface MatchScoreInput {
  title: string;
  summary: string;
  location: string;
  country: string;
  tags: string[];
  salary: string;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const containsKeyword = (text: string, keyword: string): boolean => {
  const normalizedText = normalize(text);
  const normalizedKeyword = normalize(keyword);
  if (normalizedKeyword.length === 0) {
    return false;
  }

  if (normalizedKeyword.includes(" ")) {
    return normalizedText.includes(normalizedKeyword);
  }

  const pattern = new RegExp(`\\b${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return pattern.test(normalizedText);
};

const containsAnyKeyword = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => containsKeyword(text, keyword));

const scoreKeywordCoverage = (text: string, keywords: string[]): number => {
  if (keywords.length === 0) {
    return 0;
  }

  const matched = keywords.filter((keyword) => containsKeyword(text, keyword)).length;
  return Math.round((matched / keywords.length) * 100);
};

const scoreRoleMatch = (jobText: string, profile: ResumeProfile): number => {
  const roles = [profile.currentTitle, profile.secondaryTitle ?? "", ...profile.targetRoles].filter(
    Boolean
  );

  let bestScore = 0;
  for (const role of roles) {
    if (containsKeyword(jobText, role)) {
      bestScore = 100;
      break;
    }

    const roleWords = normalize(role).split(" ").filter((word) => word.length > 2);
    const jobWords = new Set(normalize(jobText).split(" "));
    const overlap = roleWords.filter((word) => jobWords.has(word)).length;
    if (roleWords.length > 0) {
      bestScore = Math.max(bestScore, Math.round((overlap / roleWords.length) * 100));
    }
  }

  return bestScore;
};

const scoreSkillsMatch = (jobText: string, profile: ResumeProfile): number => {
  const mustHaveScore = scoreKeywordCoverage(jobText, profile.mustHaveKeywords);
  const coreScore = scoreKeywordCoverage(jobText, profile.coreSkills);
  const niceToHaveScore = scoreKeywordCoverage(jobText, profile.niceToHaveKeywords);

  return Math.round(mustHaveScore * 0.5 + coreScore * 0.35 + niceToHaveScore * 0.15);
};

const scoreLeadershipMatch = (jobText: string, profile: ResumeProfile): number =>
  scoreKeywordCoverage(jobText, profile.leadershipSkills);

const scoreDomainMatch = (jobText: string, profile: ResumeProfile): number =>
  scoreKeywordCoverage(jobText, profile.domainExperience);

const scoreLocationMatch = (
  job: MatchScoreInput,
  profile: ResumeProfile,
  criteriaCountry: string
): number => {
  const locationText = `${job.location} ${job.country} ${criteriaCountry}`;
  const locationKeywords = [
    ...profile.preferredCountries,
    ...profile.preferredLocations,
    criteriaCountry,
  ].filter(Boolean);

  return scoreKeywordCoverage(locationText, locationKeywords);
};

const scoreSalaryMatch = (job: MatchScoreInput): number => {
  const salaryText = normalize(job.salary);
  if (salaryText.length === 0 || salaryText.includes("not listed")) {
    return 50;
  }

  return /\d/.test(salaryText) ? 80 : 50;
};

const hasExcludedKeyword = (jobText: string, profile: ResumeProfile): boolean =>
  containsAnyKeyword(jobText, profile.excludedKeywords);

export const calculateMatchScore = (
  job: MatchScoreInput,
  profile: ResumeProfile,
  criteriaCountry: string
): number => {
  const jobText = [job.title, job.summary, job.location, job.country, job.tags.join(" ")].join(" ");

  if (hasExcludedKeyword(jobText, profile)) {
    return 0;
  }

  const weights = profile.matchScoringWeights;
  const components = {
    roleMatch: scoreRoleMatch(jobText, profile),
    skillsMatch: scoreSkillsMatch(jobText, profile),
    leadershipMatch: scoreLeadershipMatch(jobText, profile),
    domainMatch: scoreDomainMatch(jobText, profile),
    locationMatch: scoreLocationMatch(job, profile, criteriaCountry),
    salaryMatch: scoreSalaryMatch(job),
  };

  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0) || 100;

  const weightedScore = Object.entries(weights).reduce((sum, [key, weight]) => {
    const componentScore = components[key as keyof typeof components] ?? 0;
    return sum + componentScore * weight;
  }, 0);

  return Math.max(0, Math.min(100, Math.round(weightedScore / totalWeight)));
};

export const applyMatchScores = (
  jobs: JobListing[],
  profile: ResumeProfile,
  criteriaCountry: string
): JobListing[] =>
  jobs
    .map((job) => ({
      ...job,
      matchScore: calculateMatchScore(job, profile, criteriaCountry),
    }))
    .sort((left, right) => right.matchScore - left.matchScore);

export interface ResumeSalaryTarget {
  currency: string;
  minimumMonthly: number;
}

export interface ResumeCompanyPreferences {
  minimumEmployees: number;
  preferredIndustries: string[];
}

export interface ResumeProfile {
  name: string;
  currentTitle: string;
  secondaryTitle?: string;
  totalExperienceYears: number;
  seniorityLevel: string;
  currentLocation: string;
  targetRoles: string[];
  coreSkills: string[];
  aiSkills: string[];
  cloudSkills: string[];
  leadershipSkills: string[];
  domainExperience: string[];
  integrations: string[];
  preferredCountries: string[];
  preferredLocations: string[];
  preferredEmploymentTypes: string[];
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  excludedKeywords: string[];
  targetSalary: Record<string, ResumeSalaryTarget>;
  companyPreferences: ResumeCompanyPreferences;
  matchScoringWeights: Record<string, number>;
}

export interface ProfileResponse {
  success: true;
  profile: ResumeProfile;
}

export interface ProfileSummaryResponse {
  success: true;
  title: string;
  experience: number;
  skills: string[];
}

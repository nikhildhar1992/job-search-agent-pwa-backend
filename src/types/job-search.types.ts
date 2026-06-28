export interface JobSearchRequestBody {
  platform: string;
  country?: string;
  count: number;
  prompt?: string;
  excludeSeen?: boolean;
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  platform: string;
  country: string;
  location: string;
  salary: string;
  posted: string;
  summary: string;
  tags: string[];
  matchScore: number;
  url: string;
}

export interface SearchCriteria {
  role: string;
  skills: string[];
  country: string;
  count: number;
  remote: boolean;
  salaryMin: number | null;
}

export interface JobSearchResponse {
  success: true;
  searchCriteria: SearchCriteria;
  jobs: JobListing[];
}

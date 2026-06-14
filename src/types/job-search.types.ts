export interface JobSearchRequestBody {
  platform: string;
  country: string;
  count: number;
  prompt: string;
  excludeSeen?: boolean;
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  url: string;
}

export interface JobSearchResponse {
  success: true;
  platform: string;
  country: string;
  jobs: JobListing[];
}

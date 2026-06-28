import { JobListing } from "../types/job-search.types";

export interface SearchFilters {
  role: string;
  skills: string[];
  country: string;
  count: number;
}

export interface JobProvider {
  searchJobs(filters: SearchFilters): Promise<JobListing[]>;
}

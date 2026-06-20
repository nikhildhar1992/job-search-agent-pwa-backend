export interface ScrapedJobSearchCriteria {
  role: string;
  country: string;
  skills: string[];
  count: number;
}

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  jobUrl: string;
}

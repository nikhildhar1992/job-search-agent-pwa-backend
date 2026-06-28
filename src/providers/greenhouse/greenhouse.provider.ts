import { FastifyBaseLogger } from "fastify";
import { JobListing } from "../../types/job-search.types";
import { JobProvider, SearchFilters } from "../job-provider.interface";
import {
  matchesCountryFilter,
  normalizeProviderJob,
  resolveProviderCountry,
  resolveProviderCountryFilters,
} from "../provider-normalization";

interface GreenhouseJobLocation {
  name?: string;
}

interface GreenhouseDepartment {
  name?: string;
}

interface GreenhouseJobEntry {
  id?: number;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  location?: GreenhouseJobLocation;
  departments?: GreenhouseDepartment[];
}

interface GreenhouseApiResponse {
  jobs?: GreenhouseJobEntry[];
}

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";
const PAGE_SIZE = 100;
const MAX_PAGES_PER_COMPANY = 20;

export class GreenhouseProvider implements JobProvider {
  constructor(
    private readonly companies: string[],
    private readonly logger?: FastifyBaseLogger
  ) {}

  private async fetchCompanyJobs(company: string, filters: SearchFilters): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const resolvedCountry = resolveProviderCountry("greenhouse", filters.country);
    const countryFilters = resolveProviderCountryFilters("greenhouse", filters.country);

    for (let page = 1; page <= MAX_PAGES_PER_COMPANY; page += 1) {
      const url = `${GREENHOUSE_BASE_URL}/${company}/jobs?page=${page}&content=true&per_page=${PAGE_SIZE}`;

      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Greenhouse API returned ${response.status} for company ${company}`);
      }

      const payload = (await response.json()) as GreenhouseApiResponse;
      const pageJobs = payload.jobs ?? [];

      if (pageJobs.length === 0) {
        break;
      }

      for (const job of pageJobs) {
        const title = job.title?.trim() ?? "";
        const urlValue = job.absolute_url?.trim() ?? "";
        if (!title || !urlValue) {
          continue;
        }

        const location = job.location?.name?.trim() ?? "";
        if (!matchesCountryFilter(location, countryFilters)) {
          continue;
        }

        const tags = [
          ...(job.departments ?? []).map((department) => department.name?.trim() ?? "").filter(Boolean),
          ...filters.skills,
        ];

        jobs.push(
          normalizeProviderJob({
            platform: "Greenhouse",
            country: resolvedCountry,
            title,
            company,
            location,
            url: urlValue,
            tags,
            posted: job.updated_at?.slice(0, 10) ?? "Recently",
            fallbackId: job.id ? String(job.id) : undefined,
          })
        );

        if (jobs.length >= filters.count) {
          return jobs;
        }
      }
    }

    return jobs;
  }

  async searchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const startedAt = Date.now();
    this.logger?.info(
      { provider: "greenhouse", companyCount: this.companies.length, filters },
      "Provider started"
    );

    const merged: JobListing[] = [];

    for (const company of this.companies) {
      try {
        const companyJobs = await this.fetchCompanyJobs(company, filters);
        merged.push(...companyJobs);
      } catch (error) {
        this.logger?.warn({ provider: "greenhouse", company, err: error }, "Provider failed");
      }

      if (merged.length >= filters.count) {
        break;
      }
    }

    const result = merged.slice(0, Math.max(filters.count, 1));
    this.logger?.info(
      { provider: "greenhouse", durationMs: Date.now() - startedAt, jobCount: result.length },
      "Provider completed"
    );
    return result;
  }
}

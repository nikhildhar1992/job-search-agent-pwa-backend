import { FastifyBaseLogger } from "fastify";
import { JobListing } from "../../types/job-search.types";
import { JobProvider, SearchFilters } from "../job-provider.interface";
import { matchesCountryFilter, normalizeProviderJob } from "../provider-normalization";

interface WorkableLocation {
  city?: string;
  country?: string;
  location_str?: string;
}

interface WorkableJobEntry {
  id?: string;
  shortcode?: string;
  title?: string;
  url?: string;
  department?: string;
  location?: WorkableLocation;
  published?: string;
}

interface WorkableApiResponse {
  jobs?: WorkableJobEntry[];
}

const WORKABLE_BASE_URL = "https://apply.workable.com/api/v1/widget/accounts";

const toWorkableJobUrl = (company: string, job: WorkableJobEntry): string => {
  const directUrl = job.url?.trim();
  if (directUrl && directUrl.startsWith("http")) {
    return directUrl;
  }

  const shortCode = job.shortcode?.trim() ?? "";
  if (!shortCode) {
    return "";
  }

  return `https://apply.workable.com/${company}/j/${shortCode}`;
};

export class WorkableProvider implements JobProvider {
  constructor(
    private readonly companies: string[],
    private readonly logger?: FastifyBaseLogger
  ) {}

  private async fetchCompanyJobs(company: string, filters: SearchFilters): Promise<JobListing[]> {
    const url = `${WORKABLE_BASE_URL}/${company}?details=true`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Workable API returned ${response.status} for company ${company}`);
    }

    const payload = (await response.json()) as WorkableApiResponse;
    const jobs = payload.jobs ?? [];

    return jobs
      .map((job) => {
        const title = job.title?.trim() ?? "";
        const urlValue = toWorkableJobUrl(company, job);
        if (!title || !urlValue) {
          return null;
        }

        const location = [
          job.location?.location_str?.trim() ?? "",
          job.location?.city?.trim() ?? "",
          job.location?.country?.trim() ?? "",
        ]
          .filter(Boolean)
          .join(", ");

        if (!matchesCountryFilter(location, filters.country)) {
          return null;
        }

        const tags = [job.department?.trim() ?? "", ...filters.skills].filter(Boolean);

        return normalizeProviderJob({
          platform: "Workable",
          country: filters.country,
          title,
          company,
          location,
          url: urlValue,
          tags,
          posted: job.published?.slice(0, 10),
          fallbackId: job.id ?? job.shortcode,
        });
      })
      .filter((job): job is JobListing => Boolean(job))
      .slice(0, Math.max(filters.count, 1));
  }

  async searchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const startedAt = Date.now();
    this.logger?.info(
      { provider: "workable", companyCount: this.companies.length, filters },
      "Provider started"
    );

    const merged: JobListing[] = [];

    for (const company of this.companies) {
      try {
        const companyJobs = await this.fetchCompanyJobs(company, filters);
        merged.push(...companyJobs);
      } catch (error) {
        this.logger?.warn({ provider: "workable", company, err: error }, "Provider failed");
      }

      if (merged.length >= filters.count) {
        break;
      }
    }

    const result = merged.slice(0, Math.max(filters.count, 1));
    this.logger?.info(
      { provider: "workable", durationMs: Date.now() - startedAt, jobCount: result.length },
      "Provider completed"
    );
    return result;
  }
}

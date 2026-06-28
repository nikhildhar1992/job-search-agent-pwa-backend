import { FastifyBaseLogger } from "fastify";
import { JobListing } from "../../types/job-search.types";
import { JobProvider, SearchFilters } from "../job-provider.interface";
import {
  matchesCountryFilter,
  normalizeProviderJob,
  resolveProviderCountry,
  resolveProviderCountryFilters,
} from "../provider-normalization";

interface AshbyJobEntry {
  id?: string;
  _id?: string;
  title?: string;
  jobUrl?: string;
  url?: string;
  absoluteUrl?: string;
  location?: string;
  locationName?: string;
  departmentName?: string;
  teamName?: string;
  createdAt?: string;
  updatedAt?: string;
}

type AshbyPayload = Record<string, unknown>;

const ASHBY_BOARD_BASE_URL = "https://jobs.ashbyhq.com";

const asObject = (value: unknown): AshbyPayload =>
  typeof value === "object" && value !== null ? (value as AshbyPayload) : {};

const toArray = (value: unknown): AshbyJobEntry[] =>
  Array.isArray(value) ? value.filter((item): item is AshbyJobEntry => typeof item === "object") : [];

const extractAshbyJobs = (payload: unknown): AshbyJobEntry[] => {
  if (Array.isArray(payload)) {
    return toArray(payload);
  }

  const root = asObject(payload);
  const candidates = [
    root.jobs,
    root.openJobs,
    root.jobPostings,
    asObject(root.jobBoard).jobs,
    asObject(asObject(root.data).jobBoard).jobs,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return toArray(candidate);
    }
  }

  return [];
};

const resolveJobUrl = (company: string, job: AshbyJobEntry): string => {
  const candidateUrl = job.absoluteUrl ?? job.jobUrl ?? job.url ?? "";
  if (candidateUrl.startsWith("http")) {
    return candidateUrl;
  }

  const id = (job.id ?? job._id ?? "").trim();
  if (!id) {
    return "";
  }

  return `${ASHBY_BOARD_BASE_URL}/${company}/${id}`;
};

export class AshbyProvider implements JobProvider {
  constructor(
    private readonly companies: string[],
    private readonly logger?: FastifyBaseLogger
  ) {}

  private async fetchCompanyPayload(company: string): Promise<unknown> {
    const endpoints = [
      `${ASHBY_BOARD_BASE_URL}/${company}?format=json`,
      `${ASHBY_BOARD_BASE_URL}/${company}/api/jobs`,
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        continue;
      }

      return response.json();
    }

    throw new Error(`Ashby API lookup failed for company ${company}`);
  }

  private async fetchCompanyJobs(company: string, filters: SearchFilters): Promise<JobListing[]> {
    const resolvedCountry = resolveProviderCountry("ashby", filters.country);
    const countryFilters = resolveProviderCountryFilters("ashby", filters.country);
    const payload = await this.fetchCompanyPayload(company);
    const jobs = extractAshbyJobs(payload);

    return jobs
      .map((job) => {
        const title = job.title?.trim() ?? "";
        const url = resolveJobUrl(company, job).trim();
        if (!title || !url) {
          return null;
        }

        const location = (job.location ?? job.locationName ?? "").trim();
        if (!matchesCountryFilter(location, countryFilters)) {
          return null;
        }

        const tags = [job.departmentName ?? "", job.teamName ?? "", ...filters.skills].filter(Boolean);

        return normalizeProviderJob({
          platform: "Ashby",
          country: resolvedCountry,
          title,
          company,
          location,
          url,
          tags,
          posted: (job.updatedAt ?? job.createdAt ?? "").slice(0, 10),
          fallbackId: job.id ?? job._id,
        });
      })
      .filter((job): job is JobListing => Boolean(job))
      .slice(0, Math.max(filters.count, 1));
  }

  async searchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const startedAt = Date.now();
    this.logger?.info(
      { provider: "ashby", companyCount: this.companies.length, filters },
      "Provider started"
    );

    const merged: JobListing[] = [];

    for (const company of this.companies) {
      try {
        const companyJobs = await this.fetchCompanyJobs(company, filters);
        merged.push(...companyJobs);
      } catch (error) {
        this.logger?.warn({ provider: "ashby", company, err: error }, "Provider failed");
      }

      if (merged.length >= filters.count) {
        break;
      }
    }

    const result = merged.slice(0, Math.max(filters.count, 1));
    this.logger?.info(
      { provider: "ashby", durationMs: Date.now() - startedAt, jobCount: result.length },
      "Provider completed"
    );
    return result;
  }
}

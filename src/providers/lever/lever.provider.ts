import { FastifyBaseLogger } from "fastify";
import { JobListing } from "../../types/job-search.types";
import { JobProvider, SearchFilters } from "../job-provider.interface";
import { matchesCountryFilter, normalizeProviderJob } from "../provider-normalization";

interface LeverPostingCategories {
  location?: string;
  team?: string;
}

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  categories?: LeverPostingCategories;
}

const LEVER_BASE_URL = "https://api.lever.co/v0/postings";

export class LeverProvider implements JobProvider {
  constructor(
    private readonly companies: string[],
    private readonly logger?: FastifyBaseLogger
  ) {}

  private async fetchCompanyJobs(company: string, filters: SearchFilters): Promise<JobListing[]> {
    const url = `${LEVER_BASE_URL}/${company}?mode=json`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Lever API returned ${response.status} for company ${company}`);
    }

    const payload = (await response.json()) as LeverPosting[];

    return payload
      .map((posting) => {
        const title = posting.text?.trim() ?? "";
        const urlValue = posting.hostedUrl?.trim() ?? "";
        if (!title || !urlValue) {
          return null;
        }

        const location = posting.categories?.location?.trim() ?? "";
        if (!matchesCountryFilter(location, filters.country)) {
          return null;
        }

        const tags = [posting.categories?.team?.trim() ?? "", ...filters.skills].filter(Boolean);

        return normalizeProviderJob({
          platform: "Lever",
          country: filters.country,
          title,
          company,
          location,
          url: urlValue,
          tags,
          fallbackId: posting.id,
        });
      })
      .filter((job): job is JobListing => Boolean(job))
      .slice(0, Math.max(filters.count, 1));
  }

  async searchJobs(filters: SearchFilters): Promise<JobListing[]> {
    const startedAt = Date.now();
    this.logger?.info(
      { provider: "lever", companyCount: this.companies.length, filters },
      "Provider started"
    );

    const merged: JobListing[] = [];

    for (const company of this.companies) {
      try {
        const companyJobs = await this.fetchCompanyJobs(company, filters);
        merged.push(...companyJobs);
      } catch (error) {
        this.logger?.warn({ provider: "lever", company, err: error }, "Provider failed");
      }

      if (merged.length >= filters.count) {
        break;
      }
    }

    const result = merged.slice(0, Math.max(filters.count, 1));
    this.logger?.info(
      { provider: "lever", durationMs: Date.now() - startedAt, jobCount: result.length },
      "Provider completed"
    );
    return result;
  }
}

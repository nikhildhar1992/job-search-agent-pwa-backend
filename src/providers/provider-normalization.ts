import {
  getConfiguredCountries,
  getCountryAliases,
  resolveCountryForPlatform,
} from "../config/platform.config";
import { extractJobId } from "../services/seen-jobs.service";
import { JobListing } from "../types/job-search.types";

interface NormalizeJobInput {
  platform: string;
  country: string;
  title: string;
  company: string;
  location: string;
  url: string;
  tags: string[];
  posted?: string;
  salary?: string;
  summary?: string;
  fallbackId?: string;
}

const isAllCountries = (country: string): boolean => country.trim().toLowerCase() === "all";

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const resolveProviderCountry = (platform: string, requestedCountry: string): string =>
  resolveCountryForPlatform(platform, requestedCountry);

export const resolveProviderCountryFilters = (
  platform: string,
  requestedCountry: string
): string[] => {
  if (requestedCountry.trim().toLowerCase() === "all") {
    return getConfiguredCountries(platform);
  }

  const resolved = resolveProviderCountry(platform, requestedCountry);
  return resolved ? [resolved] : getConfiguredCountries(platform);
};

export const matchesCountryFilter = (location: string, countries: string[]): boolean => {
  if (countries.length === 0) {
    return true;
  }

  const normalizedLocation = normalize(location);

  return countries.some((country) =>
    getCountryAliases(country).some((alias) => normalizedLocation.includes(alias))
  );
};

export const normalizeProviderJob = (input: NormalizeJobInput): JobListing => {
  const safeTitle = input.title.trim();
  const safeCompany = input.company.trim() || "Unknown company";
  const safeLocation = input.location.trim() || input.country || "Unknown";
  const safeUrl = input.url.trim();
  const id = extractJobId(safeUrl, input.fallbackId);

  return {
    id,
    title: safeTitle,
    company: safeCompany,
    platform: input.platform,
    country: input.country || "Unknown",
    location: safeLocation,
    salary: input.salary?.trim() || "Not listed",
    posted: input.posted?.trim() || "Recently",
    summary: input.summary?.trim() || [safeTitle, safeCompany, safeLocation].join(" — "),
    tags: input.tags.slice(0, 5),
    matchScore: 0,
    url: safeUrl,
  };
};

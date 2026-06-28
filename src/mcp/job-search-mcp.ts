import { FastifyBaseLogger } from "fastify";
import { mockJobs } from "../data/mock-jobs";
import { AshbyProvider } from "../providers/ashby/ashby.provider";
import { GreenhouseProvider } from "../providers/greenhouse/greenhouse.provider";
import { JobProvider, SearchFilters } from "../providers/job-provider.interface";
import { loadJobSourcesConfig } from "../providers/job-sources.config";
import { LeverProvider } from "../providers/lever/lever.provider";
import { WorkableProvider } from "../providers/workable/workable.provider";
import { applyMatchScores } from "../services/match-score.service";
import { searchGulfTalent } from "../services/gulftalent.service";
import { searchNaukriGulf } from "../services/naukrigulf.service";
import {
  dedupeJobsByUrl,
  extractJobId,
  getSeenJobKeys,
  isJobSeen,
  markJobsAsSeen,
} from "../services/seen-jobs.service";
import { JobListing, SearchCriteria } from "../types/job-search.types";
import { ResumeProfile } from "../types/resume.types";
import {
  resolveJobBoardScrapers,
  JobBoardScraper,
  getAlternateScraper,
  isLegacyPlaywrightScraper,
  isSinglePlatformSelection,
  toListingPlatform,
} from "../utils/platform-routing";

export type JobSearchSource =
  | "combined"
  | "naukrigulf"
  | "gulftalent"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "mock";

export interface McpJobSearchOptions {
  criteria: SearchCriteria;
  platform: string;
  profile: ResumeProfile;
  excludeSeen?: boolean;
  logger?: FastifyBaseLogger;
}

export interface McpJobSearchResult {
  source: JobSearchSource;
  jobs: JobListing[];
  filteredSeenCount: number;
  duplicateCount: number;
  naukrigulfCount: number;
  gulftalentCount: number;
}

const boardCriteria = (criteria: SearchCriteria): SearchFilters => ({
  role: criteria.role,
  country: criteria.country,
  skills: criteria.skills,
  count: criteria.count,
});

const mapScrapedJobToListing = (
  job: { title: string; company: string; location: string; jobUrl: string },
  platform: JobListing["platform"],
  criteria: SearchCriteria
): JobListing => {
  const id = extractJobId(job.jobUrl);
  const summary = [job.title, job.company, job.location].filter(Boolean).join(" — ");

  return {
    id,
    title: job.title,
    company: job.company || "Unknown company",
    platform,
    country: criteria.country || "Unknown",
    location: job.location || criteria.country || "Unknown",
    salary: "Not listed",
    posted: "Recently",
    summary,
    tags: criteria.skills.slice(0, 5),
    matchScore: 0,
    url: job.jobUrl,
  };
};

const finalizeJobs = async (
  jobs: JobListing[],
  profile: ResumeProfile,
  criteria: SearchCriteria,
  excludeSeen: boolean,
  source: JobSearchSource,
  naukrigulfCount: number,
  gulftalentCount: number,
  logger?: FastifyBaseLogger
): Promise<McpJobSearchResult> => {
  const beforeDedupeCount = jobs.length;
  const dedupedJobs = dedupeJobsByUrl(jobs);
  const duplicateCount = beforeDedupeCount - dedupedJobs.length;

  const scoredJobs = applyMatchScores(dedupedJobs, profile, criteria.country);

  let filteredJobs = scoredJobs;
  let filteredSeenCount = 0;

  if (excludeSeen) {
    const seenKeys = await getSeenJobKeys();
    filteredJobs = scoredJobs.filter((job) => {
      const seen = isJobSeen(job, seenKeys);
      if (seen) {
        filteredSeenCount += 1;
      }
      return !seen;
    });
  }

  const resultLimit = Math.max(criteria.count, 1);
  const limitedJobs = filteredJobs.slice(0, resultLimit);

  if (excludeSeen) {
    await markJobsAsSeen(
      limitedJobs.map((job) => ({
        id: job.id,
        url: job.url,
        title: job.title,
        company: job.company,
        platform: job.platform,
      }))
    );
  }

  logger?.info(
    {
      source,
      naukrigulfCount,
      gulftalentCount,
      duplicateCount,
      filteredSeenCount,
      returnedCount: limitedJobs.length,
      topMatchScore: limitedJobs[0]?.matchScore ?? 0,
      excludeSeen,
    },
    excludeSeen
      ? "Job results deduplicated, scored, and seen-jobs updated"
      : "Job results deduplicated and scored (seen-jobs filter skipped)"
  );

  return {
    source,
    jobs: limitedJobs,
    filteredSeenCount,
    duplicateCount,
    naukrigulfCount,
    gulftalentCount,
  };
};

export const fetchJobsViaMcp = async ({
  criteria,
  platform,
  profile,
  excludeSeen = false,
  logger,
}: McpJobSearchOptions): Promise<McpJobSearchResult> => {
  const scrapers = resolveJobBoardScrapers(platform);

  logger?.info(
    {
      platform,
      scrapers,
      role: criteria.role,
      country: criteria.country,
      skills: criteria.skills,
      count: criteria.count,
      excludeSeen,
    },
    "MCP job search started"
  );

  const searchInput = boardCriteria(criteria);
  const jobSources = await loadJobSourcesConfig(logger);

  const apiProviders: Record<"greenhouse" | "lever" | "ashby" | "workable", JobProvider> = {
    greenhouse: new GreenhouseProvider(jobSources.greenhouse, logger),
    lever: new LeverProvider(jobSources.lever, logger),
    ashby: new AshbyProvider(jobSources.ashby, logger),
    workable: new WorkableProvider(jobSources.workable, logger),
  };

  const scrapeByBoard = async (scraper: JobBoardScraper): Promise<JobListing[]> => {
    if (scraper === "gulftalent") {
      const jobs = await searchGulfTalent(searchInput, logger);
      return jobs.map((job) => mapScrapedJobToListing(job, toListingPlatform(scraper), criteria));
    }

    if (scraper === "naukrigulf") {
      const jobs = await searchNaukriGulf(searchInput, logger);
      return jobs.map((job) => mapScrapedJobToListing(job, toListingPlatform(scraper), criteria));
    }

    return apiProviders[scraper].searchJobs(searchInput);
  };

  const runScraperSafely = async (scraper: JobBoardScraper): Promise<JobListing[]> => {
    const startedAt = Date.now();

    try {
      logger?.info({ provider: scraper, filters: searchInput }, "Provider started");
      const jobs = await scrapeByBoard(scraper);
      logger?.info(
        {
          provider: scraper,
          durationMs: Date.now() - startedAt,
          jobCount: jobs.length,
        },
        "Provider completed"
      );
      return jobs;
    } catch (error) {
      logger?.warn(
        {
          err: error,
          provider: scraper,
          durationMs: Date.now() - startedAt,
        },
        "Provider failed"
      );
      return [];
    }
  };

  const providerCounts: Record<JobBoardScraper, number> = {
    naukrigulf: 0,
    gulftalent: 0,
    greenhouse: 0,
    lever: 0,
    ashby: 0,
    workable: 0,
  };
  const mergedJobs: JobListing[] = [];
  let usedBackupPlatform = false;

  for (const scraper of scrapers) {
    const jobs = await runScraperSafely(scraper);
    providerCounts[scraper] = jobs.length;
    mergedJobs.push(...jobs);

    if (scrapers.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  if (
    isSinglePlatformSelection(platform) &&
    scrapers.length === 1 &&
    isLegacyPlaywrightScraper(scrapers[0]) &&
    mergedJobs.length === 0
  ) {
    const backupScraper = getAlternateScraper(scrapers[0]);

    logger?.warn(
      { platform, backupScraper },
      "Primary platform returned no jobs; trying alternate job board"
    );

    usedBackupPlatform = true;
    const backupJobs = await runScraperSafely(backupScraper);
    providerCounts[backupScraper] = backupJobs.length;
    mergedJobs.push(...backupJobs);
  }

  if (mergedJobs.length > 0) {
    const activeSources = (Object.entries(providerCounts) as Array<[JobBoardScraper, number]>)
      .filter(([, count]) => count > 0)
      .map(([provider]) => provider as JobSearchSource);

    const source: JobSearchSource =
      activeSources.length > 1 ? "combined" : (activeSources[0] ?? "combined");

    logger?.info(
      {
        source,
        usedBackupPlatform,
        providerCounts,
      },
      "MCP job search completed with live results"
    );

    return finalizeJobs(
      mergedJobs,
      profile,
      criteria,
      excludeSeen,
      source,
      providerCounts.naukrigulf,
      providerCounts.gulftalent,
      logger
    );
  }

  logger?.error(
    { platform, scrapers },
    "Selected job board scrape(s) returned no results; falling back to mock jobs"
  );

  const mockResult = await finalizeJobs(
    [...mockJobs],
    profile,
    criteria,
    excludeSeen,
    "mock",
    0,
    0,
    logger
  );

  return mockResult;
};

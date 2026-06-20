import { FastifyBaseLogger } from "fastify";
import { mockJobs } from "../data/mock-jobs";
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
import { ScrapedJob } from "../types/scraped-job.types";
import { resolveJobBoardScrapers, JobBoardScraper, getAlternateScraper, isSinglePlatformSelection } from "../utils/platform-routing";

export type JobSearchSource = "combined" | "naukrigulf" | "gulftalent" | "mock";

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

const boardCriteria = (criteria: SearchCriteria) => ({
  role: criteria.role,
  country: criteria.country,
  skills: criteria.skills,
  count: criteria.count,
});

const mapScrapedJobToListing = (
  job: ScrapedJob,
  platform: "NaukriGulf" | "GulfTalent",
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

  const scrapeByBoard = async (scraper: JobBoardScraper): Promise<ScrapedJob[]> => {
    if (scraper === "gulftalent") {
      return searchGulfTalent(searchInput, logger);
    }

    return searchNaukriGulf(searchInput, logger);
  };

  const runScraperSafely = async (scraper: JobBoardScraper): Promise<ScrapedJob[]> => {
    const label = scraper === "gulftalent" ? "GulfTalent" : "NaukriGulf";

    try {
      const jobs = await scrapeByBoard(scraper);
      logger?.info({ scraper: label, jobCount: jobs.length }, `${label} scrape completed`);
      return jobs;
    } catch (error) {
      logger?.warn({ err: error, scraper: label }, `${label} scrape failed`);
      return [];
    }
  };

  let naukrigulfJobs: ScrapedJob[] = [];
  let gulftalentJobs: ScrapedJob[] = [];
  let usedBackupPlatform = false;

  for (const scraper of scrapers) {
    const jobs = await runScraperSafely(scraper);

    if (scraper === "gulftalent") {
      gulftalentJobs = jobs;
    } else {
      naukrigulfJobs = jobs;
    }

    if (scrapers.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  if (
    isSinglePlatformSelection(platform) &&
    naukrigulfJobs.length === 0 &&
    gulftalentJobs.length === 0
  ) {
    const backupScraper = getAlternateScraper(scrapers[0]);
    const backupLabel = backupScraper === "gulftalent" ? "GulfTalent" : "NaukriGulf";

    logger?.warn(
      { platform, backupScraper: backupLabel },
      "Primary platform returned no jobs; trying alternate job board"
    );

    usedBackupPlatform = true;
    const backupJobs = await runScraperSafely(backupScraper);

    if (backupScraper === "gulftalent") {
      gulftalentJobs = backupJobs;
    } else {
      naukrigulfJobs = backupJobs;
    }
  }

  const mergedJobs = [
    ...naukrigulfJobs.map((job) => mapScrapedJobToListing(job, "NaukriGulf", criteria)),
    ...gulftalentJobs.map((job) => mapScrapedJobToListing(job, "GulfTalent", criteria)),
  ];

  if (mergedJobs.length > 0) {
    const source: JobSearchSource =
      naukrigulfJobs.length > 0 && gulftalentJobs.length > 0
        ? "combined"
        : naukrigulfJobs.length > 0
          ? "naukrigulf"
          : "gulftalent";

    logger?.info(
      {
        source,
        usedBackupPlatform,
        naukrigulfCount: naukrigulfJobs.length,
        gulftalentCount: gulftalentJobs.length,
      },
      "MCP job search completed with live results"
    );

    return finalizeJobs(
      mergedJobs,
      profile,
      criteria,
      excludeSeen,
      source,
      naukrigulfJobs.length,
      gulftalentJobs.length,
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

import { mkdirSync, writeFileSync } from "node:fs";
import { FastifyBaseLogger } from "fastify";
import { firefox, type Browser, type Page } from "playwright";
import {
  NaukriGulfJob,
  NaukriGulfSearchCriteria,
} from "../types/naukrigulf.types";

const NAUKRIGULF_BASE_URL = "https://www.naukrigulf.com";
const MAX_JOBS = 5;
const PAGE_TIMEOUT_MS = 60_000;
const RESULTS_WAIT_MS = 8_000;
const ATTEMPTS_PER_URL = 4;
const RETRY_DELAY_MS = 2_000;
const ERROR_PAGE_RETRY_DELAY_MS = 4_000;
const URL_GAP_DELAY_MS = 2_000;
const NO_RESULT_SELECTOR = ".no-result";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const JOB_CARD_SELECTOR = ".srp-tuple";
const JOB_TITLE_SELECTOR = ".designation-title";
const DEBUG_HTML_PATH = "debug/naukrigulf.html";
const MAX_SKILLS_IN_SLUG = 2;

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const normalizeLocationSlug = (country: string): string => {
  const normalized = country.trim().toLowerCase();

  const locationAliases: Record<string, string> = {
    uae: "uae",
    "united arab emirates": "uae",
    dubai: "dubai",
    "abu dhabi": "abu-dhabi",
    "saudi arabia": "saudi-arabia",
    qatar: "qatar",
    kuwait: "kuwait",
    bahrain: "bahrain",
    oman: "oman",
    india: "india",
    germany: "germany",
    "united kingdom": "united-kingdom",
    uk: "united-kingdom",
  };

  return locationAliases[normalized] ?? slugify(country);
};

const buildSkillsSlug = (criteria: NaukriGulfSearchCriteria, maxSkills = MAX_SKILLS_IN_SLUG): string => {
  const skillSlugs = criteria.skills.map((skill) => slugify(skill)).filter(Boolean);
  const uniqueSkillSlugs = [...new Set(skillSlugs)].slice(0, maxSkills);

  if (uniqueSkillSlugs.length > 0) {
    return uniqueSkillSlugs.join("-");
  }

  return slugify(criteria.role);
};

/**
 * Builds candidate search URLs from broadest to most specific. NaukriGulf
 * returns an "Oops" error page when too many skills are joined in one slug.
 */
const buildSearchUrls = (criteria: NaukriGulfSearchCriteria): string[] => {
  const country = criteria.country.trim();
  const normalizedCountry = country.toLowerCase();
  const effectiveCountry =
    normalizedCountry.length === 0 || normalizedCountry === "all" ? "uae" : country;
  const locationSuffix = `-jobs-in-${normalizeLocationSlug(effectiveCountry)}`;

  const candidateSlugs: string[] = [];

  const roleSlug = slugify(criteria.role);
  if (roleSlug) {
    candidateSlugs.push(roleSlug);
  }

  const firstSkillSlug = criteria.skills.map((skill) => slugify(skill)).filter(Boolean)[0];
  if (firstSkillSlug) {
    candidateSlugs.push(firstSkillSlug);
  }

  const limitedSkillsSlug = buildSkillsSlug(criteria, MAX_SKILLS_IN_SLUG);
  if (limitedSkillsSlug && limitedSkillsSlug !== roleSlug && limitedSkillsSlug !== firstSkillSlug) {
    candidateSlugs.push(limitedSkillsSlug);
  }

  candidateSlugs.push("software-developer", "full-stack-developer");

  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  return uniqueSlugs.map((slug) => `${NAUKRIGULF_BASE_URL}/${slug}${locationSuffix}`);
};

const isErrorPage = (html: string): boolean => {
  if (html.includes("srp-tuple")) {
    return false;
  }

  return (
    html.includes("Oops! Something went wrong") || html.includes('class="ng-box-pure no-result"')
  );
};

const waitForResults = async (page: Page, logger?: FastifyBaseLogger): Promise<void> => {
  try {
    await page.waitForSelector(`${JOB_CARD_SELECTOR}, ${NO_RESULT_SELECTOR}`, {
      timeout: RESULTS_WAIT_MS,
    });
    logger?.info("NaukriGulf results (jobs or no-result) rendered");
    return;
  } catch {
    logger?.warn("NaukriGulf results did not render within wait window");
  }

  try {
    await page.waitForSelector(JOB_TITLE_SELECTOR, { timeout: 3_000 });
    logger?.info("NaukriGulf job titles rendered");
  } catch {
    logger?.warn("NaukriGulf job titles did not render within wait window");
  }
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");

const cleanHtmlText = (value: string | null | undefined): string =>
  decodeHtmlEntities((value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

const toAbsoluteUrl = (url: string): string => {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${NAUKRIGULF_BASE_URL}${trimmed}`;
  }
  return trimmed;
};

/**
 * Parses jobs directly from the page HTML string instead of page.evaluate.
 * page.evaluate breaks under tsx/esbuild ("__name is not defined"), so we
 * grep the saved DOM after Playwright has captured it.
 */
const extractJobsFromHtml = (html: string): NaukriGulfJob[] => {
  const jobs: NaukriGulfJob[] = [];

  const cardMarker = /class="[^"]*\bsrp-tuple\b[^"]*"/g;
  const cardStartIndices: number[] = [];
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = cardMarker.exec(html)) !== null) {
    cardStartIndices.push(markerMatch.index);
  }

  for (let i = 0; i < cardStartIndices.length; i += 1) {
    const start = cardStartIndices[i];
    const end = i + 1 < cardStartIndices.length ? cardStartIndices[i + 1] : html.length;
    const card = html.slice(start, end);

    const urlMatch = card.match(/href="([^"]*)"\s+class="info-position/);
    const titleMatch = card.match(/class="designation-title"[^>]*>([\s\S]*?)<\/p>/);
    const companyMatch = card.match(/class="info-org[^"]*"[^>]*>([\s\S]*?)<\/(?:a|p)>/);
    const locationMatch = card.match(
      /class="info-loc[^"]*">\s*<span class="ico"><\/span><span>([\s\S]*?)<\/span>/
    );

    const title = cleanHtmlText(titleMatch?.[1]);
    const jobUrl = toAbsoluteUrl(urlMatch?.[1] ?? "");
    const company = cleanHtmlText(companyMatch?.[1]);
    const location = cleanHtmlText(locationMatch?.[1]);

    if (title.length > 0 && jobUrl.length > 0) {
      jobs.push({ title, company, location, jobUrl });
    }
  }

  return jobs;
};

const launchBrowser = async (logger?: FastifyBaseLogger): Promise<Browser> => {
  logger?.info("Launching Playwright browser for NaukriGulf (headless)");

  return firefox.launch({
    headless: true,
    args: [
      "--disable-http2",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });
};

const scrapeJobsFromUrl = async (
  page: Page,
  searchUrl: string,
  attempt: number,
  logger?: FastifyBaseLogger
): Promise<NaukriGulfJob[]> => {
  logger?.info({ searchUrl, attempt }, "Navigating to NaukriGulf search page");

  let response;
  try {
    response = await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch (error) {
    logger?.warn({ err: error, searchUrl, attempt }, "NaukriGulf navigation failed");
    throw error;
  }

  await waitForResults(page, logger);
  await page.waitForTimeout(2_500);

  const html = await page.content();
  mkdirSync("debug", { recursive: true });
  writeFileSync(DEBUG_HTML_PATH, html);

  const extractedJobs = extractJobsFromHtml(html);
  const errorPage = isErrorPage(html);

  logger?.info(
    {
      searchUrl,
      attempt,
      status: response?.status(),
      finalUrl: page.url(),
      extractedCount: extractedJobs.length,
      isErrorPage: errorPage,
    },
    "NaukriGulf extraction attempt completed"
  );

  if (errorPage) {
    return [];
  }

  return extractedJobs;
};

export const searchNaukriGulf = async (
  criteria: NaukriGulfSearchCriteria,
  logger?: FastifyBaseLogger
): Promise<NaukriGulfJob[]> => {
  const searchUrls = buildSearchUrls(criteria);
  const limit = Math.min(Math.max(criteria.count, 1), MAX_JOBS);

  logger?.info(
    {
      role: criteria.role,
      country: criteria.country,
      skills: criteria.skills,
      requestedCount: criteria.count,
      limit,
      searchUrls,
    },
    "Starting NaukriGulf Playwright search"
  );

  let browser: Browser | null = null;

  try {
    browser = await launchBrowser(logger);

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const page = await context.newPage();

    for (const searchUrl of searchUrls) {
      for (let attempt = 1; attempt <= ATTEMPTS_PER_URL; attempt += 1) {
        let extractedJobs: NaukriGulfJob[] = [];
        let lastHtml = "";

        try {
          extractedJobs = await scrapeJobsFromUrl(page, searchUrl, attempt, logger);
          lastHtml = await page.content();
        } catch (navigationError) {
          logger?.warn(
            { err: navigationError, searchUrl, attempt },
            "NaukriGulf navigation failed; trying next attempt or fallback URL"
          );

          if (attempt < ATTEMPTS_PER_URL) {
            await page.waitForTimeout(RETRY_DELAY_MS);
          }
          continue;
        }

        if (extractedJobs.length > 0) {
          const jobs = extractedJobs.slice(0, limit);
          logger?.info(
            {
              searchUrl,
              attempt,
              extractedCount: extractedJobs.length,
              returnedCount: jobs.length,
              jobs: jobs.map((job) => ({
                title: job.title,
                company: job.company,
                location: job.location,
                jobUrl: job.jobUrl,
              })),
            },
            "NaukriGulf job extraction succeeded"
          );
          return jobs;
        }

        if (attempt < ATTEMPTS_PER_URL) {
          const retryDelay = isErrorPage(lastHtml) ? ERROR_PAGE_RETRY_DELAY_MS : RETRY_DELAY_MS;
          logger?.warn(
            { searchUrl, attempt, isErrorPage: isErrorPage(lastHtml), retryDelay },
            "No NaukriGulf jobs found; retrying same URL"
          );
          await page.waitForTimeout(retryDelay);
        }
      }

      logger?.warn({ searchUrl }, "No NaukriGulf jobs found; trying next fallback URL");
      await page.waitForTimeout(URL_GAP_DELAY_MS);
    }

    throw new Error("No NaukriGulf jobs extracted after all retries and fallback URLs");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger?.error({ err: error, searchUrls }, "NaukriGulf Playwright search failed");
    throw new Error(`NaukriGulf search failed: ${reason}`);
  } finally {
    if (browser) {
      await browser.close();
      logger?.info("Playwright browser closed");
    }
  }
};

import { mkdirSync, writeFileSync } from "node:fs";
import { FastifyBaseLogger } from "fastify";
import { firefox, type Browser, type Page } from "playwright";
import { ScrapedJob, ScrapedJobSearchCriteria } from "../types/scraped-job.types";

const GULFTALENT_BASE_URL = "https://www.gulftalent.com";
const GULFTALENT_SEARCH_PATH = "/jobs/search";
const MAX_JOBS = 5;
const PAGE_TIMEOUT_MS = 60_000;
const RESULTS_WAIT_MS = 10_000;
const ATTEMPTS_PER_URL = 4;
const RETRY_DELAY_MS = 2_000;
const EMPTY_PAGE_RETRY_DELAY_MS = 4_000;
const URL_GAP_DELAY_MS = 2_000;
const JOB_ROW_MARKER = '<tr class="content-visibility-auto"';
const JOB_LINK_SELECTOR = 'a.ga-job-impression[data-cy="job-link"]';
const DEBUG_HTML_PATH = "debug/gulftalent.html";

const GULFTALENT_COUNTRY_IDS: Record<string, string> = {
  uae: "10111111000000",
  "united arab emirates": "10111111000000",
  dubai: "10111111000000",
  "abu dhabi": "10111111000000",
  sharjah: "10111111000000",
  ajman: "10111111000000",
  "saudi arabia": "10111112000000",
  saudi: "10111112000000",
  ksa: "10111112000000",
  riyadh: "10111112000000",
  jeddah: "10111112000000",
  qatar: "10111114000000",
  doha: "10111114000000",
  kuwait: "10111113000000",
  bahrain: "10111115000000",
  oman: "10111116000000",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const resolveCountryId = (country: string): string => {
  const normalized = country.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "all") {
    return "";
  }

  return GULFTALENT_COUNTRY_IDS[normalized] ?? "";
};

const hasGulfTalentCountryFilter = (country: string): boolean =>
  resolveCountryId(country).length > 0;

const buildSearchKeywords = (criteria: ScrapedJobSearchCriteria): string[] => {
  const keywords: string[] = [];
  const skills = [...new Set(criteria.skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean))];
  const role = criteria.role.trim().toLowerCase();

  if (skills.length > 0) {
    keywords.push(skills.join(" "));
    keywords.push(skills.slice(0, 2).join(" "));
    keywords.push(skills[0]);
  }

  if (role) {
    keywords.push(role);
  }

  return [...new Set(keywords.filter(Boolean))];
};

const buildSearchUrl = (searchKeyword: string, countryId: string): string => {
  const params = new URLSearchParams({
    category: "",
    city: "",
    country: countryId,
    employment_type: "",
    has_external_application: "",
    industry: "",
    search_keyword: searchKeyword,
    seniority: "",
  });

  return `${GULFTALENT_BASE_URL}${GULFTALENT_SEARCH_PATH}?${params.toString()}`;
};

const buildSearchUrls = (criteria: ScrapedJobSearchCriteria): string[] => {
  const countryId = resolveCountryId(criteria.country);
  const keywords = buildSearchKeywords(criteria);

  return keywords.map((searchKeyword) => buildSearchUrl(searchKeyword, countryId));
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
    return `${GULFTALENT_BASE_URL}${trimmed}`;
  }
  return trimmed;
};

const normalizeCountrySlug = (country: string): string => {
  const normalized = country.trim().toLowerCase();

  const aliases: Record<string, string> = {
    uae: "uae",
    "united arab emirates": "uae",
    dubai: "uae",
    "abu dhabi": "uae",
    "saudi arabia": "saudi-arabia",
    qatar: "qatar",
    kuwait: "kuwait",
    bahrain: "bahrain",
    oman: "oman",
  };

  return aliases[normalized] ?? slugify(country);
};

const matchesCountry = (job: ScrapedJob, country: string): boolean => {
  const normalizedCountry = country.trim().toLowerCase();
  if (normalizedCountry.length === 0 || normalizedCountry === "all") {
    return true;
  }

  const countrySlug = normalizeCountrySlug(country);
  const haystack = `${job.jobUrl} ${job.location}`.toLowerCase();

  if (haystack.includes(`/${countrySlug}/`)) {
    return true;
  }

  return haystack.includes(normalizedCountry);
};

const extractJobUrl = (row: string): string => {
  const classFirstMatch = row.match(/class="[^"]*\bga-job-impression\b[^"]*"[^>]*href="([^"]+)"/);
  if (classFirstMatch?.[1]) {
    return classFirstMatch[1];
  }

  const hrefFirstMatch = row.match(/href="([^"]+)"[^>]*class="[^"]*\bga-job-impression\b/);
  return hrefFirstMatch?.[1] ?? "";
};

const extractJobsFromHtml = (html: string): ScrapedJob[] => {
  const jobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  const appendJob = (title: string, jobUrl: string, company: string, location: string) => {
    const normalizedUrl = toAbsoluteUrl(jobUrl);
    if (title.length === 0 || normalizedUrl.length === 0 || seenUrls.has(normalizedUrl)) {
      return;
    }

    seenUrls.add(normalizedUrl);
    jobs.push({ title, company, location, jobUrl: normalizedUrl });
  };

  const rows = html.split(JOB_ROW_MARKER).slice(1);

  for (const row of rows) {
    const titleMatch = row.match(/<strong>([^<]+)<\/strong>/);
    const companyMatch = row.match(/<\/a>[\s\S]*?<span>([^<]+)<\/span>/);
    const locationMatch = row.match(/<span title="([^"]+)"/);

    appendJob(
      cleanHtmlText(titleMatch?.[1]),
      extractJobUrl(row),
      cleanHtmlText(companyMatch?.[1]),
      cleanHtmlText(locationMatch?.[1])
    );
  }

  if (jobs.length > 0) {
    return jobs;
  }

  const cardPattern =
    /<a[^>]*class="[^"]*\bga-job-impression\b[^"]*"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?<\/a>/g;
  let cardMatch: RegExpExecArray | null;

  while ((cardMatch = cardPattern.exec(html)) !== null) {
    const card = cardMatch[0];
    const trailing = html.slice(cardMatch.index, cardMatch.index + card.length + 400);
    const companyMatch = trailing.match(/<\/a>[\s\S]*?<span>([^<]+)<\/span>/);
    const locationMatch = trailing.match(/<span title="([^"]+)"/);

    appendJob(
      cleanHtmlText(cardMatch[1]),
      extractJobUrl(card),
      cleanHtmlText(companyMatch?.[1]),
      cleanHtmlText(locationMatch?.[1])
    );
  }

  return jobs;
};

const waitForResults = async (page: Page, logger?: FastifyBaseLogger): Promise<void> => {
  try {
    await page.waitForSelector(JOB_LINK_SELECTOR, { timeout: RESULTS_WAIT_MS });
    logger?.info("GulfTalent job links rendered");
    return;
  } catch {
    logger?.warn("GulfTalent job links did not render within wait window");
  }

  try {
    await page.waitForSelector("table.table-section tbody tr", { timeout: 3_000 });
    logger?.info("GulfTalent job table rendered");
  } catch {
    logger?.warn("GulfTalent job table did not render within wait window");
  }
};

const launchBrowser = async (logger?: FastifyBaseLogger): Promise<Browser> => {
  logger?.info("Launching Playwright browser for GulfTalent (headless)");

  return firefox.launch({
    headless: true,
    args: ["--disable-http2", "--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
};

const scrapeJobsFromUrl = async (
  page: Page,
  searchUrl: string,
  criteria: ScrapedJobSearchCriteria,
  attempt: number,
  logger?: FastifyBaseLogger
): Promise<ScrapedJob[]> => {
  logger?.info({ searchUrl, attempt }, "Navigating to GulfTalent search page");

  let response;
  try {
    response = await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch (error) {
    logger?.warn({ err: error, searchUrl, attempt }, "GulfTalent navigation failed");
    throw error;
  }

  await waitForResults(page, logger);
  await page.waitForTimeout(2_500);

  const html = await page.content();
  mkdirSync("debug", { recursive: true });
  writeFileSync(DEBUG_HTML_PATH, html);

  const extractedJobs = extractJobsFromHtml(html);
  const shouldFilterByCountry = hasGulfTalentCountryFilter(criteria.country);
  const filteredJobs = shouldFilterByCountry
    ? extractedJobs.filter((job) => matchesCountry(job, criteria.country))
    : extractedJobs;

  logger?.info(
    {
      searchUrl,
      attempt,
      status: response?.status(),
      finalUrl: page.url(),
      extractedCount: extractedJobs.length,
      filteredCount: filteredJobs.length,
      countryFilterApplied: shouldFilterByCountry,
      country: criteria.country,
      pageHasJobsBanner: /Jobs found/i.test(html),
    },
    "GulfTalent extraction attempt completed"
  );

  return filteredJobs;
};

export const searchGulfTalent = async (
  criteria: ScrapedJobSearchCriteria,
  logger?: FastifyBaseLogger
): Promise<ScrapedJob[]> => {
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
    "Starting GulfTalent Playwright search"
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
        let extractedJobs: ScrapedJob[] = [];
        let lastHtml = "";

        try {
          extractedJobs = await scrapeJobsFromUrl(page, searchUrl, criteria, attempt, logger);
          lastHtml = await page.content();
        } catch (navigationError) {
          logger?.warn(
            { err: navigationError, searchUrl, attempt },
            "GulfTalent navigation failed; trying next attempt or fallback URL"
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
            },
            "GulfTalent job extraction succeeded"
          );
          return jobs;
        }

        if (attempt < ATTEMPTS_PER_URL) {
          const retryDelay =
            /Jobs found/i.test(lastHtml) && extractedJobs.length === 0
              ? EMPTY_PAGE_RETRY_DELAY_MS
              : RETRY_DELAY_MS;

          logger?.warn({ searchUrl, attempt, retryDelay }, "No GulfTalent jobs found; retrying same URL");
          await page.waitForTimeout(retryDelay);
        }
      }

      logger?.warn({ searchUrl }, "No GulfTalent jobs found; trying next fallback URL");
      await page.waitForTimeout(URL_GAP_DELAY_MS);
    }

    throw new Error("No GulfTalent jobs extracted after all retries and fallback URLs");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger?.error({ err: error, searchUrls }, "GulfTalent Playwright search failed");
    throw new Error(`GulfTalent search failed: ${reason}`);
  } finally {
    if (browser) {
      await browser.close();
      logger?.info("GulfTalent Playwright browser closed");
    }
  }
};

export type JobBoardScraper =
  | "naukrigulf"
  | "gulftalent"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable";

const ALL_FILTER_VALUE = "all";

export const normalizePlatform = (platform: string): string =>
  platform.trim().toLowerCase().replace(/\s+/g, " ");

export const resolveJobBoardScrapers = (platform: string): JobBoardScraper[] => {
  const normalized = normalizePlatform(platform);

  if (normalized.length === 0 || normalized === ALL_FILTER_VALUE) {
    return ["gulftalent", "naukrigulf"];
  }

  if (normalized.includes("greenhouse")) {
    return ["greenhouse"];
  }

  if (normalized.includes("lever")) {
    return ["lever"];
  }

  if (normalized.includes("ashby")) {
    return ["ashby"];
  }

  if (normalized.includes("workable")) {
    return ["workable"];
  }

  if (normalized.includes("gulftalent") || normalized.includes("gulf talent")) {
    return ["gulftalent"];
  }

  if (normalized.includes("naukri")) {
    return ["naukrigulf"];
  }

  return ["gulftalent", "naukrigulf"];
};

export const isLegacyPlaywrightScraper = (scraper: JobBoardScraper): boolean =>
  scraper === "gulftalent" || scraper === "naukrigulf";

export const getAlternateScraper = (scraper: JobBoardScraper): JobBoardScraper =>
  scraper === "gulftalent" ? "naukrigulf" : "gulftalent";

export const isSinglePlatformSelection = (platform: string): boolean =>
  resolveJobBoardScrapers(platform).length === 1;

export const toListingPlatform = (
  scraper: JobBoardScraper
): "NaukriGulf" | "GulfTalent" | "Greenhouse" | "Lever" | "Ashby" | "Workable" => {
  if (scraper === "gulftalent") {
    return "GulfTalent";
  }
  if (scraper === "greenhouse") {
    return "Greenhouse";
  }
  if (scraper === "lever") {
    return "Lever";
  }
  if (scraper === "ashby") {
    return "Ashby";
  }
  if (scraper === "workable") {
    return "Workable";
  }

  return "NaukriGulf";
};

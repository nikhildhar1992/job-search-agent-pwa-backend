export type JobBoardScraper = "naukrigulf" | "gulftalent";

const ALL_FILTER_VALUE = "all";

export const normalizePlatform = (platform: string): string =>
  platform.trim().toLowerCase().replace(/\s+/g, " ");

export const resolveJobBoardScrapers = (platform: string): JobBoardScraper[] => {
  const normalized = normalizePlatform(platform);

  if (normalized.length === 0 || normalized === ALL_FILTER_VALUE) {
    return ["gulftalent", "naukrigulf"];
  }

  if (normalized.includes("gulftalent") || normalized.includes("gulf talent")) {
    return ["gulftalent"];
  }

  if (normalized.includes("naukri")) {
    return ["naukrigulf"];
  }

  return ["gulftalent", "naukrigulf"];
};

export const getAlternateScraper = (scraper: JobBoardScraper): JobBoardScraper =>
  scraper === "gulftalent" ? "naukrigulf" : "gulftalent";

export const isSinglePlatformSelection = (platform: string): boolean =>
  resolveJobBoardScrapers(platform).length === 1;

export const toListingPlatform = (scraper: JobBoardScraper): "NaukriGulf" | "GulfTalent" =>
  scraper === "gulftalent" ? "GulfTalent" : "NaukriGulf";

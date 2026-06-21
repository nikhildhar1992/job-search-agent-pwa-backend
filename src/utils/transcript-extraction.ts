import {
  getAllConfiguredCountries,
  getCountryAliases,
  getPlatformLabel,
  PLATFORM_CONFIG,
} from "../config/platform.config";

interface MatchRule {
  canonical: string;
  aliases: string[];
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const COUNTRY_RULES: MatchRule[] = getAllConfiguredCountries().map((country) => ({
  canonical: country,
  aliases: getCountryAliases(country),
}));

const PLATFORM_RULES: MatchRule[] = (
  Object.keys(PLATFORM_CONFIG) as Array<keyof typeof PLATFORM_CONFIG>
).map((platformKey) => {
  const label = getPlatformLabel(platformKey);
  const baseAliases = [platformKey, label, label.replace(/\s+/g, "")];

  if (platformKey === "naukrigulf") {
    baseAliases.push("naukri", "naukri gulf");
  }

  if (platformKey === "gulftalent") {
    baseAliases.push("gulf talent");
  }

  return {
    canonical: label,
    aliases: baseAliases,
  };
});

const matchRule = (normalizedText: string, rules: MatchRule[]): string => {
  for (const rule of rules) {
    const matched = rule.aliases.some((alias) => {
      const normalizedAlias = normalize(alias);
      const wordBoundary = new RegExp(`\\b${normalizedAlias.replace(/\s+/g, "\\s+")}\\b`);
      return wordBoundary.test(normalizedText);
    });

    if (matched) {
      return rule.canonical;
    }
  }

  return "";
};

export const extractCountry = (transcript: string): string =>
  matchRule(normalize(transcript), COUNTRY_RULES);

export const extractPlatform = (transcript: string): string =>
  matchRule(normalize(transcript), PLATFORM_RULES);

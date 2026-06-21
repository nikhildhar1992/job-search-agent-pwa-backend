export const PLATFORM_CONFIG = {
  naukrigulf: {
    type: "playwright",
    countries: ["United Arab Emirates"],
  },
  gulftalent: {
    type: "playwright",
    countries: ["United Arab Emirates"],
  },
  greenhouse: {
    type: "api",
    countries: ["Germany", "Netherlands"],
  },
  lever: {
    type: "api",
    countries: ["Germany", "Netherlands"],
  },
  ashby: {
    type: "api",
    countries: ["Ireland", "Germany"],
  },
  workable: {
    type: "api",
    countries: ["Finland", "Ireland"],
  },
} as const;

export type PlatformKey = keyof typeof PLATFORM_CONFIG;

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const acronym = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toLowerCase() ?? "")
    .join("");

const PLATFORM_ALIASES: Record<PlatformKey, string[]> = {
  naukrigulf: ["naukrigulf", "naukri gulf", "naukri"],
  gulftalent: ["gulftalent", "gulf talent"],
  greenhouse: ["greenhouse", "green house"],
  lever: ["lever", "lever co", "lever.co"],
  ashby: ["ashby", "ashbyhq", "ashby hq"],
  workable: ["workable", "workable com", "workable.com"],
};

export const getPlatformLabel = (platform: PlatformKey): string => {
  if (platform === "naukrigulf") {
    return "Naukri Gulf";
  }
  if (platform === "gulftalent") {
    return "GulfTalent";
  }

  return platform.charAt(0).toUpperCase() + platform.slice(1);
};

export const resolvePlatformKey = (platform: string): PlatformKey | null => {
  const normalized = normalize(platform);
  const keys = Object.keys(PLATFORM_ALIASES) as PlatformKey[];

  for (const key of keys) {
    const aliases = PLATFORM_ALIASES[key].map((alias) => normalize(alias));
    if (aliases.includes(normalized)) {
      return key;
    }
  }

  return null;
};

export const getConfiguredCountries = (platform: string): string[] => {
  const key = resolvePlatformKey(platform);
  if (!key) {
    return [];
  }

  return [...PLATFORM_CONFIG[key].countries];
};

export const isCountryAllowedForPlatform = (platform: string, country: string): boolean => {
  const configuredCountries = getConfiguredCountries(platform);
  const normalizedCountry = normalize(country);
  if (!normalizedCountry) {
    return false;
  }

  return configuredCountries.some((configured) => {
    const normalizedConfigured = normalize(configured);
    return (
      normalizedConfigured === normalizedCountry ||
      acronym(configured) === normalizedCountry ||
      normalizedConfigured.includes(normalizedCountry) ||
      normalizedCountry.includes(normalizedConfigured)
    );
  });
};

export const resolveCountryForPlatform = (platform: string, requestedCountry?: string): string => {
  const configuredCountries = getConfiguredCountries(platform);
  const normalizedRequested = requestedCountry?.trim() ?? "";

  if (normalizedRequested.length > 0 && normalizedRequested.toLowerCase() !== "all") {
    if (isCountryAllowedForPlatform(platform, normalizedRequested)) {
      const exact = configuredCountries.find(
        (configured) => normalize(configured) === normalize(normalizedRequested)
      );
      return exact ?? configuredCountries[0] ?? normalizedRequested;
    }
  }

  return configuredCountries[0] ?? normalizedRequested;
};

export const getAllConfiguredCountries = (): string[] => {
  const unique = new Set<string>();
  for (const config of Object.values(PLATFORM_CONFIG)) {
    for (const country of config.countries) {
      unique.add(country);
    }
  }

  return [...unique];
};

export const getCountryAliases = (country: string): string[] => {
  const values = new Set<string>();
  values.add(normalize(country));
  const countryAcronym = acronym(country);
  if (countryAcronym) {
    values.add(countryAcronym);
    values.add(countryAcronym.split("").join(" "));
  }
  return [...values].filter(Boolean);
};

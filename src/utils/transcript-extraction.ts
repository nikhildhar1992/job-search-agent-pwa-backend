interface MatchRule {
  canonical: string;
  aliases: string[];
}

const COUNTRY_RULES: MatchRule[] = [
  {
    canonical: "UAE",
    aliases: [
      "uae",
      "u a e",
      "united arab emirates",
      "emirates",
      "dubai",
      "abu dhabi",
      "sharjah",
      "ajman",
    ],
  },
  {
    canonical: "Saudi Arabia",
    aliases: ["saudi arabia", "saudi", "ksa", "riyadh", "jeddah", "dammam", "mecca", "medina"],
  },
  { canonical: "Qatar", aliases: ["qatar", "doha"] },
  { canonical: "Bahrain", aliases: ["bahrain", "manama"] },
  { canonical: "Kuwait", aliases: ["kuwait", "kuwait city"] },
];

const PLATFORM_RULES: MatchRule[] = [
  {
    canonical: "Greenhouse",
    aliases: ["greenhouse", "green house"],
  },
  {
    canonical: "Lever",
    aliases: ["lever", "lever.co"],
  },
  {
    canonical: "Ashby",
    aliases: ["ashby", "ashbyhq", "ashby h q"],
  },
  {
    canonical: "Workable",
    aliases: ["workable", "workable.com"],
  },
  {
    canonical: "GulfTalent",
    aliases: ["gulf talent", "gulftalent", "gulf talent.com", "gulf talents"],
  },
  {
    canonical: "Naukri Gulf",
    aliases: ["naukri gulf", "naukrigulf", "naukri", "nokri gulf", "nokri", "nakri"],
  },
];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

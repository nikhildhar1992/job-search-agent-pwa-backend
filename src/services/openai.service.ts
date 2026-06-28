import { FastifyBaseLogger } from "fastify";
import OpenAI from "openai";
import { env } from "../config/env";
import {
  getAllConfiguredCountries,
  getConfiguredCountries,
  getPlatformLabel,
  PLATFORM_CONFIG,
  resolveCountryForPlatform,
} from "../config/platform.config";
import { SearchCriteria } from "../types/job-search.types";
import { ResumeProfile } from "../types/resume.types";
import { VoiceTargetHints } from "../types/transcribe.types";

export interface CriteriaDefaults {
  platform: string;
  country: string;
  count: number;
}

const ALL_FILTER_VALUE = "All";

let cachedClient: OpenAI | null = null;

const getClient = (): OpenAI | null => {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  return cachedClient;
};

const buildSystemPrompt = (): string =>
  [
    "You are a job-search assistant.",
    "Convert the user's request together with their resume profile into structured search filters.",
    "Respond ONLY with a JSON object using exactly these keys:",
    "- role (string)",
    "- skills (array of strings)",
    "- country (string)",
    "- count (number)",
    "- remote (boolean)",
    "- salaryMin (number or null)",
    "Do not include any other keys, comments, or text.",
  ].join("\n");

const buildUserPrompt = (prompt: string, profile: ResumeProfile, defaults: CriteriaDefaults): string =>
  (() => {
    const platformCountries = getConfiguredCountries(defaults.platform);
    return [
      "User request:",
      prompt.trim().length > 0 ? prompt.trim() : "(no specific prompt provided)",
      "",
      "Target job board:",
      defaults.platform.trim().length > 0 ? defaults.platform : "(not specified)",
      "Allowed countries for this platform:",
      platformCountries.length > 0 ? platformCountries.join(", ") : "(not specified)",
      "Target country:",
      defaults.country.trim().length > 0 ? defaults.country : "(not specified)",
      "Requested result count:",
      String(defaults.count),
      "",
      "Resume profile (JSON):",
      JSON.stringify(profile),
    ];
  })().join("\n");

const buildFallbackCriteria = (
  profile: ResumeProfile,
  defaults: CriteriaDefaults
): SearchCriteria => {
  const resolvedCountry = resolveCountryForPlatform(
    defaults.platform,
    defaults.country === ALL_FILTER_VALUE ? "" : defaults.country
  );

  return {
    role: profile.currentTitle,
    skills: profile.coreSkills.slice(0, 5),
    country: resolvedCountry || profile.preferredCountries[0] || "",
    count: defaults.count,
    remote: profile.preferredLocations.some((location) => location.toLowerCase() === "remote"),
    salaryMin: null,
  };
};

const normalizeCriteria = (
  parsed: unknown,
  fallback: SearchCriteria,
  defaults: CriteriaDefaults
): SearchCriteria => {
  if (typeof parsed !== "object" || parsed === null) {
    return fallback;
  }

  const data = parsed as Record<string, unknown>;

  return {
    role:
      typeof data.role === "string" && data.role.trim().length > 0 ? data.role : fallback.role,
    skills: Array.isArray(data.skills)
      ? data.skills.filter((skill): skill is string => typeof skill === "string")
      : fallback.skills,
    country:
      typeof data.country === "string" && data.country.trim().length > 0
        ? resolveCountryForPlatform(defaults.platform, data.country)
        : fallback.country,
    count:
      typeof data.count === "number" && Number.isFinite(data.count) && data.count > 0
        ? Math.trunc(data.count)
        : fallback.count,
    remote: typeof data.remote === "boolean" ? data.remote : fallback.remote,
    salaryMin:
      typeof data.salaryMin === "number" && Number.isFinite(data.salaryMin)
        ? data.salaryMin
        : null,
  };
};

export const generateSearchCriteria = async (
  prompt: string,
  profile: ResumeProfile,
  defaults: CriteriaDefaults,
  logger?: FastifyBaseLogger
): Promise<SearchCriteria> => {
  const fallbackCriteria = buildFallbackCriteria(profile, defaults);
  const client = getClient();

  if (!client) {
    logger?.warn("OPENAI_API_KEY is not set; returning fallback search criteria");
    return fallbackCriteria;
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(prompt, profile, defaults) },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";

    logger?.info(
      { model: env.OPENAI_MODEL, openaiResponse: rawContent },
      "OpenAI search criteria response"
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      logger?.error(
        { err: parseError, rawContent },
        "Failed to parse OpenAI response as JSON; returning fallback search criteria"
      );
      return fallbackCriteria;
    }

    return normalizeCriteria(parsed, fallbackCriteria, defaults);
  } catch (error) {
    logger?.error({ err: error }, "OpenAI request failed; returning fallback search criteria");
    return fallbackCriteria;
  }
};

const VOICE_TARGET_COUNTRIES = [...new Set([...getAllConfiguredCountries(), "All"])];
const VOICE_TARGET_PLATFORMS = [
  ...new Set(
    [
      ...(Object.keys(PLATFORM_CONFIG) as Array<keyof typeof PLATFORM_CONFIG>).map((key) =>
        getPlatformLabel(key)
      ),
      "All",
    ].filter(Boolean)
  ),
];

const normalizeVoiceTarget = (value: unknown, allowed: readonly string[]): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const match = allowed.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return match ?? "";
};

export const inferVoiceTargetsFromTranscript = async (
  transcript: string,
  logger?: FastifyBaseLogger
): Promise<VoiceTargetHints> => {
  const empty: VoiceTargetHints = { country: "", platform: "" };
  const client = getClient();

  if (!client || transcript.trim().length === 0) {
    return empty;
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Extract the job search country and job board platform from a voice transcript.",
            "Respond ONLY with JSON using exactly these keys:",
            `- country (string, one of: "${VOICE_TARGET_COUNTRIES.join('", "')}", or "" if unknown)`,
            `- platform (string, one of: "${VOICE_TARGET_PLATFORMS.join('", "')}", or "" if unknown)`,
          ].join("\n"),
        },
        {
          role: "user",
          content: transcript.trim(),
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(rawContent) as Record<string, unknown>;

    const result: VoiceTargetHints = {
      country: normalizeVoiceTarget(parsed.country, VOICE_TARGET_COUNTRIES),
      platform: normalizeVoiceTarget(parsed.platform, VOICE_TARGET_PLATFORMS),
    };

    logger?.info({ result, model: env.OPENAI_MODEL }, "OpenAI voice target extraction completed");
    return result;
  } catch (error) {
    logger?.warn({ err: error }, "OpenAI voice target extraction failed");
    return empty;
  }
};

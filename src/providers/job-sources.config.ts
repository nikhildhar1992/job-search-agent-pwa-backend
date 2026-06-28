import { readFile } from "node:fs/promises";
import path from "node:path";
import { FastifyBaseLogger } from "fastify";

interface RawJobSourcesConfig {
  greenhouse?: unknown;
  lever?: unknown;
  ashby?: unknown;
  workable?: unknown;
}

export interface JobSourcesConfig {
  greenhouse: string[];
  lever: string[];
  ashby: string[];
  workable: string[];
}

const JOB_SOURCES_PATH = path.resolve(process.cwd(), "config", "job-sources.json");

const normalizeSourceList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

export const loadJobSourcesConfig = async (logger?: FastifyBaseLogger): Promise<JobSourcesConfig> => {
  try {
    const raw = await readFile(JOB_SOURCES_PATH, "utf-8");
    const parsed = JSON.parse(raw) as RawJobSourcesConfig;

    const config: JobSourcesConfig = {
      greenhouse: normalizeSourceList(parsed.greenhouse),
      lever: normalizeSourceList(parsed.lever),
      ashby: normalizeSourceList(parsed.ashby),
      workable: normalizeSourceList(parsed.workable),
    };

    logger?.info(
      {
        greenhouse: config.greenhouse.length,
        lever: config.lever.length,
        ashby: config.ashby.length,
        workable: config.workable.length,
      },
      "Job sources configuration loaded"
    );

    return config;
  } catch (error) {
    logger?.error({ err: error, path: JOB_SOURCES_PATH }, "Failed to load job sources configuration");
    return {
      greenhouse: [],
      lever: [],
      ashby: [],
      workable: [],
    };
  }
};

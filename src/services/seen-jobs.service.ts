import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SeenJobRecord, SeenJobsStore } from "../types/seen-jobs.types";

const SEEN_JOBS_PATH = path.resolve(__dirname, "..", "seen-jobs.json");

const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    return parsed.href.replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
};

export const extractJobId = (url: string, fallbackId?: string): string => {
  const normalizedFallback = fallbackId?.trim();
  if (normalizedFallback && normalizedFallback.length > 0) {
    return normalizedFallback;
  }

  try {
    const pathname = new URL(url).pathname;
    const trailingId = pathname.match(/(\d+)\/?$/);
    if (trailingId) {
      return trailingId[1];
    }

    const slug = pathname.replace(/^\//, "").replace(/\/$/, "");
    return slug.length > 0 ? slug : normalizeUrl(url);
  } catch {
    return url.trim();
  }
};

const readSeenJobsStore = async (): Promise<SeenJobsStore> => {
  try {
    const raw = await readFile(SEEN_JOBS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SeenJobsStore;

    if (!Array.isArray(parsed.jobs)) {
      return { jobs: [] };
    }

    return parsed;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("ENOENT")) {
      return { jobs: [] };
    }
    throw new Error(`Unable to read seen jobs at ${SEEN_JOBS_PATH}: ${reason}`);
  }
};

const writeSeenJobsStore = async (store: SeenJobsStore): Promise<void> => {
  try {
    await writeFile(SEEN_JOBS_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to write seen jobs at ${SEEN_JOBS_PATH}: ${reason}`);
  }
};

export const getSeenJobKeys = async (): Promise<Set<string>> => {
  const store = await readSeenJobsStore();
  const keys = new Set<string>();

  for (const job of store.jobs) {
    keys.add(job.id);
    keys.add(normalizeUrl(job.url));
  }

  return keys;
};

export const isJobSeen = (job: { id: string; url: string }, seenKeys: Set<string>): boolean =>
  seenKeys.has(job.id) || seenKeys.has(normalizeUrl(job.url));

export const markJobsAsSeen = async (
  jobs: Array<Pick<SeenJobRecord, "id" | "url" | "title" | "company" | "platform">>
): Promise<void> => {
  if (jobs.length === 0) {
    return;
  }

  const store = await readSeenJobsStore();
  const existingKeys = new Set<string>();

  for (const job of store.jobs) {
    existingKeys.add(job.id);
    existingKeys.add(normalizeUrl(job.url));
  }

  const now = new Date().toISOString();

  for (const job of jobs) {
    const id = job.id.trim();
    const url = normalizeUrl(job.url);
    if (existingKeys.has(id) || existingKeys.has(url)) {
      continue;
    }

    store.jobs.push({
      id,
      url,
      title: job.title,
      company: job.company,
      platform: job.platform,
      firstSeenAt: now,
    });

    existingKeys.add(id);
    existingKeys.add(url);
  }

  await writeSeenJobsStore(store);
};

export const dedupeJobsByUrl = <T extends { id: string; url: string }>(jobs: T[]): T[] => {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const job of jobs) {
    const key = normalizeUrl(job.url) || job.id;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(job);
  }

  return deduped;
};

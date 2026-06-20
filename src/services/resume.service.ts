import { readFile } from "node:fs/promises";
import path from "node:path";
import { ResumeProfile } from "../types/resume.types";

const RESUME_PROFILE_PATH = path.resolve(__dirname, "..", "resume-profile.json");

export const getResumeText = async (): Promise<string> => {
  try {
    return await readFile(RESUME_PROFILE_PATH, "utf-8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read resume profile at ${RESUME_PROFILE_PATH}: ${reason}`);
  }
};

export const getResumeProfile = async (): Promise<ResumeProfile> => {
  const rawProfile = await getResumeText();

  try {
    return JSON.parse(rawProfile) as ResumeProfile;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Resume profile file contains invalid JSON: ${reason}`);
  }
};

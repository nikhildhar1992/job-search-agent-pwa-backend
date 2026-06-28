import dotenv from "dotenv";
import { z } from "zod";

// Load a real .env first (takes precedence), then fall back to .env.example
// so values defined only in the example file are still picked up.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.example" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("*"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_WHISPER_MODEL: z.string().default("whisper-1"),
  OPENAI_WHISPER_LANGUAGE: z.string().default("en"),
  JOBPASSWORD: z.string().min(1).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(
    `Invalid environment configuration: ${parsedEnv.error.flatten().formErrors.join(", ")}`
  );
}

export const env = parsedEnv.data;

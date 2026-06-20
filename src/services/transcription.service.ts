import { FastifyBaseLogger } from "fastify";
import OpenAI, { toFile } from "openai";
import { env } from "../config/env";

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

export const transcribeAudio = async (
  audio: Buffer,
  filename: string,
  logger?: FastifyBaseLogger
): Promise<string> => {
  const client = getClient();

  if (!client) {
    throw new Error("OPENAI_API_KEY is not configured; cannot transcribe audio");
  }

  const file = await toFile(audio, filename, { type: "audio/webm" });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: env.OPENAI_WHISPER_MODEL,
    language: env.OPENAI_WHISPER_LANGUAGE,
  });

  const transcript = transcription.text?.trim() ?? "";

  logger?.info(
    { model: env.OPENAI_WHISPER_MODEL, transcriptLength: transcript.length },
    "Whisper transcription completed"
  );

  return transcript;
};

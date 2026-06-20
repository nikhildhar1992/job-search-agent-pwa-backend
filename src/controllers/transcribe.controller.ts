import { FastifyReply, FastifyRequest } from "fastify";
import { inferVoiceTargetsFromTranscript } from "../services/openai.service";
import { transcribeAudio } from "../services/transcription.service";
import { TranscribeResult } from "../types/transcribe.types";
import { extractCountry, extractPlatform } from "../utils/transcript-extraction";

export const transcribe = async (request: FastifyRequest, reply: FastifyReply) => {
  const data = await request.file();

  if (!data) {
    reply.status(400).send({
      success: false,
      message: "No audio file uploaded. Send a multipart/form-data request with an audio file.",
    });
    return;
  }

  const audioBuffer = await data.toBuffer();

  if (audioBuffer.length === 0) {
    reply.status(400).send({
      success: false,
      message: "Uploaded audio file is empty.",
    });
    return;
  }

  const filename = data.filename || "recording.webm";

  const transcript = await transcribeAudio(audioBuffer, filename, request.log);

  const keywordCountry = extractCountry(transcript);
  const keywordPlatform = extractPlatform(transcript);

  let country = keywordCountry;
  let platform = keywordPlatform;

  if (!country || !platform) {
    const inferred = await inferVoiceTargetsFromTranscript(transcript, request.log);
    country = country || inferred.country;
    platform = platform || inferred.platform;
  }

  const result: TranscribeResult = {
    success: true,
    transcript,
    country,
    platform,
  };

  request.log.info(
    {
      country: result.country,
      platform: result.platform,
      keywordCountry,
      keywordPlatform,
      transcriptLength: transcript.length,
    },
    "Transcription request completed"
  );

  reply.status(200).send(result);
};

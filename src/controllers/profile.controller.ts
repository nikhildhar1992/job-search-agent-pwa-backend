import { FastifyReply, FastifyRequest } from "fastify";
import { getResumeProfile } from "../services/resume.service";
import { ProfileResponse, ProfileSummaryResponse } from "../types/resume.types";

export const getProfile = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const profile = await getResumeProfile();

    const response: ProfileResponse = {
      success: true,
      profile,
    };

    reply.status(200).send(response);
  } catch (error) {
    request.log.error({ err: error }, "Failed to load resume profile");
    reply.status(500).send({
      success: false,
      message: "Failed to load resume profile",
    });
  }
};

export const getProfileSummary = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const profile = await getResumeProfile();

    const response: ProfileSummaryResponse = {
      success: true,
      title: profile.currentTitle,
      experience: profile.totalExperienceYears,
      skills: profile.coreSkills,
    };

    reply.status(200).send(response);
  } catch (error) {
    request.log.error({ err: error }, "Failed to build resume profile summary");
    reply.status(500).send({
      success: false,
      message: "Failed to load resume profile summary",
    });
  }
};

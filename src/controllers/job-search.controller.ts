import { FastifyReply, FastifyRequest } from "fastify";
import { resolveCountryForPlatform } from "../config/platform.config";
import { fetchJobsViaMcp } from "../mcp/job-search-mcp";
import { generateSearchCriteria } from "../services/openai.service";
import { getResumeProfile } from "../services/resume.service";
import { JobSearchRequestBody, JobSearchResponse } from "../types/job-search.types";

type JobSearchRequest = FastifyRequest<{ Body: JobSearchRequestBody }>;

export const searchJobs = async (request: JobSearchRequest, reply: FastifyReply) => {
  const { platform, country, count, prompt = "", excludeSeen = false } = request.body;

  try {
    const profile = await getResumeProfile();
    const resolvedCountry = resolveCountryForPlatform(platform, country);

    const searchCriteria = await generateSearchCriteria(
      prompt,
      profile,
      { platform, country: resolvedCountry, count },
      request.log
    );

    searchCriteria.country = resolvedCountry;

    if (count > 0) {
      searchCriteria.count = count;
    } else if (searchCriteria.count <= 0) {
      searchCriteria.count = 5;
    }

    const { source, jobs, filteredSeenCount, duplicateCount, naukrigulfCount, gulftalentCount } =
      await fetchJobsViaMcp({
        criteria: searchCriteria,
        platform,
        profile,
        excludeSeen,
        logger: request.log,
      });

    request.log.info(
      {
        platform,
        requestedCountry: country,
        resolvedCountry,
        source,
        jobCount: jobs.length,
        naukrigulfCount,
        gulftalentCount,
        filteredSeenCount,
        duplicateCount,
        searchCriteria,
      },
      "Job search request completed"
    );

    const response: JobSearchResponse = {
      success: true,
      searchCriteria,
      jobs,
    };

    reply.status(200).send(response);
  } catch (error) {
    request.log.error({ err: error }, "Job search request failed");
    reply.status(500).send({
      success: false,
      message: "Failed to process job search request",
    });
  }
};

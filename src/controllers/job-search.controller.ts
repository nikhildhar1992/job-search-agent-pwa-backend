import { FastifyReply, FastifyRequest } from "fastify";
import { mockJobs } from "../data/mock-jobs";
import { JobSearchRequestBody, JobSearchResponse } from "../types/job-search.types";

type JobSearchRequest = FastifyRequest<{ Body: JobSearchRequestBody }>;

const seenJobIds = new Set(["3", "7"]);

export const searchJobs = async (request: JobSearchRequest, reply: FastifyReply) => {
  const { platform, country, count, excludeSeen = false } = request.body;

  const filteredJobs = excludeSeen ? mockJobs.filter((job) => !seenJobIds.has(job.id)) : mockJobs;
  const jobs = filteredJobs.slice(0, count);

  const response: JobSearchResponse = {
    success: true,
    platform,
    country,
    jobs,
  };

  reply.status(200).send(response);
};

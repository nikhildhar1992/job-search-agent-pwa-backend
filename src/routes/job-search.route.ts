import { FastifyPluginAsync } from "fastify";
import { searchJobs } from "../controllers/job-search.controller";

const jobSearchRoute: FastifyPluginAsync = async (app) => {
  app.post(
    "/api/job-search",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            platform: { type: "string", minLength: 1 },
            country: { type: "string", minLength: 1 },
            count: { type: "integer", minimum: 1, maximum: 100 },
            prompt: { type: "string", minLength: 1 },
            excludeSeen: { type: "boolean" },
          },
          required: ["platform", "country", "count"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              searchCriteria: {
                type: "object",
                properties: {
                  role: { type: "string" },
                  skills: { type: "array", items: { type: "string" } },
                  country: { type: "string" },
                  count: { type: "integer" },
                  remote: { type: "boolean" },
                  salaryMin: { type: ["number", "null"] },
                },
                required: ["role", "skills", "country", "count", "remote", "salaryMin"],
                additionalProperties: false,
              },
              jobs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    company: { type: "string" },
                    platform: { type: "string" },
                    country: { type: "string" },
                    location: { type: "string" },
                    salary: { type: "string" },
                    posted: { type: "string" },
                    summary: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    matchScore: { type: "number" },
                    url: { type: "string" },
                  },
                  required: [
                    "id",
                    "title",
                    "company",
                    "platform",
                    "country",
                    "location",
                    "salary",
                    "posted",
                    "summary",
                    "tags",
                    "matchScore",
                    "url",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["success", "searchCriteria", "jobs"],
            additionalProperties: false,
          },
        },
      },
    },
    searchJobs
  );
};

export default jobSearchRoute;

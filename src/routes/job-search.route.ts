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
          required: ["platform", "country", "count", "prompt"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              platform: { type: "string" },
              country: { type: "string" },
              jobs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    company: { type: "string" },
                    location: { type: "string" },
                    matchScore: { type: "number" },
                    url: { type: "string" },
                  },
                  required: ["id", "title", "company", "location", "matchScore", "url"],
                  additionalProperties: false,
                },
              },
            },
            required: ["success", "platform", "country", "jobs"],
            additionalProperties: false,
          },
        },
      },
    },
    searchJobs
  );
};

export default jobSearchRoute;

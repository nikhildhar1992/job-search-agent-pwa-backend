import { FastifyPluginAsync } from "fastify";
import { getProfile, getProfileSummary } from "../controllers/profile.controller";

const profileRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/profile",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              profile: { type: "object", additionalProperties: true },
            },
            required: ["success", "profile"],
            additionalProperties: false,
          },
        },
      },
    },
    getProfile
  );

  app.get(
    "/api/profile/summary",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              title: { type: "string" },
              experience: { type: "number" },
              skills: { type: "array", items: { type: "string" } },
            },
            required: ["success", "title", "experience", "skills"],
            additionalProperties: false,
          },
        },
      },
    },
    getProfileSummary
  );
};

export default profileRoute;

import { FastifyPluginAsync } from "fastify";
import { transcribe } from "../controllers/transcribe.controller";

const transcribeRoute: FastifyPluginAsync = async (app) => {
  app.post(
    "/api/transcribe",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              transcript: { type: "string" },
              country: { type: "string" },
              platform: { type: "string" },
            },
            required: ["success", "transcript", "country", "platform"],
            additionalProperties: false,
          },
        },
      },
    },
    transcribe
  );
};

export default transcribeRoute;

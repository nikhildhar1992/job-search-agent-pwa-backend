import { FastifyPluginAsync } from "fastify";
import { getHealth } from "../controllers/health.controller";

const healthRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
            required: ["success", "message"],
            additionalProperties: false,
          },
        },
      },
    },
    getHealth
  );
};

export default healthRoute;

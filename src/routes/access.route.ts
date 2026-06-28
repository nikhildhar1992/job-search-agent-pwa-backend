import { FastifyPluginAsync } from "fastify";
import { verifyAccess } from "../controllers/access.controller";

const accessRoute: FastifyPluginAsync = async (app) => {
  app.post(
    "/api/access/verify",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            password: { type: "string", minLength: 1 },
          },
          required: ["password"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
            },
            required: ["success"],
            additionalProperties: false,
          },
        },
      },
    },
    verifyAccess
  );
};

export default accessRoute;

import multipart from "@fastify/multipart";
import Fastify, { FastifyError, FastifySchemaValidationError } from "fastify";
import { env } from "./config/env";
import corsPlugin from "./plugins/cors";
import healthRoute from "./routes/health.route";
import jobSearchRoute from "./routes/job-search.route";
import profileRoute from "./routes/profile.route";
import transcribeRoute from "./routes/transcribe.route";

export const buildApp = () => {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    trustProxy: true
  });

  app.register(corsPlugin);
  app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
    },
  });
  app.register(healthRoute);
  app.register(jobSearchRoute);
  app.register(profileRoute);
  app.register(transcribeRoute);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Request failed");

    if (error.validation) {
      reply.status(400).send({
        success: false,
        message: "Validation error",
        errors: error.validation.map((issue: FastifySchemaValidationError) => ({
          field: issue.instancePath || issue.params?.missingProperty || "request",
          message: issue.message,
        })),
      });
      return;
    }

    const statusCode =
      typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;

    reply.status(statusCode).send({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
    });
  });

  return app;
};

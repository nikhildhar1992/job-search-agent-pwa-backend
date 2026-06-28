import cors from "@fastify/cors";
import { FastifyPluginAsync } from "fastify";
import { env } from "../config/env";

const corsPlugin: FastifyPluginAsync = async (app) => {
  const allowAllOrigins = env.CORS_ORIGIN.trim() === "*";
  const configuredOrigins = allowAllOrigins
    ? true
    : env.CORS_ORIGIN.split(",").map((origin) => origin.trim());

  await app.register(cors, {
    origin: configuredOrigins,
    methods: ["GET", "POST", "OPTIONS"],
  });
};

export default corsPlugin;

import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { AccessVerifyRequestBody } from "../types/access.types";

type AccessVerifyRequest = FastifyRequest<{ Body: AccessVerifyRequestBody }>;

export const verifyAccess = async (request: AccessVerifyRequest, reply: FastifyReply) => {
  const { password } = request.body;

  if (!env.JOBPASSWORD) {
    request.log.error("JOBPASSWORD is not configured on the server");
    reply.status(503).send({
      success: false,
      message: "Job search access is not configured on the server.",
    });
    return;
  }

  if (password !== env.JOBPASSWORD) {
    reply.status(401).send({
      success: false,
      message: "Incorrect password. Please try again.",
    });
    return;
  }

  reply.status(200).send({ success: true });
};

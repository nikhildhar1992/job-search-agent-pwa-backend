import { FastifyReply, FastifyRequest } from "fastify";

export const getHealth = async (_request: FastifyRequest, reply: FastifyReply) => {
  reply.status(200).send({
    success: true,
    message: "Career Agent API Running",
  });
};

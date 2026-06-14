import { buildApp } from "./app";
import { env } from "./config/env";

const start = async () => {
  const app = buildApp();

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exit(1);
  }
};

void start();

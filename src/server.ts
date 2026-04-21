import Fastify from 'fastify';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';

export async function buildServer() {
  const app = Fastify({ logger: false });

  app.get('/', async () => ({ ok: true, service: 'chatbot-farmacias' }));

  app.get('/health', async () => {
    const farmaciasCount = await prisma.farmacia.count({ where: { activa: true } });
    return { status: 'ok', farmaciasActivas: farmaciasCount };
  });

  return app;
}

export async function startServer() {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`HTTP server listening on ${config.HOST}:${config.PORT}`);
  return app;
}

import Fastify from 'fastify';
import type { Context, Telegraf } from 'telegraf';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';

export async function buildServer(telegramBot?: Telegraf<Context>) {
  const app = Fastify({ logger: false });

  app.get('/', async () => ({ ok: true, service: 'chatbot-farmacias' }));

  app.get('/health', async () => {
    const farmaciasCount = await prisma.farmacia.count({ where: { activa: true } });
    return { status: 'ok', farmaciasActivas: farmaciasCount };
  });

  if (telegramBot && config.TELEGRAM_WEBHOOK_URL) {
    const webhookPath = new URL(config.TELEGRAM_WEBHOOK_URL).pathname || '/telegram/webhook';
    app.post(webhookPath, async (request, reply) => {
      if (config.TELEGRAM_WEBHOOK_SECRET) {
        const secret = request.headers['x-telegram-bot-api-secret-token'];
        if (secret !== config.TELEGRAM_WEBHOOK_SECRET) {
          reply.code(401);
          return { ok: false };
        }
      }

      await telegramBot.handleUpdate(request.body as Parameters<typeof telegramBot.handleUpdate>[0]);
      return { ok: true };
    });
    logger.info({ webhookPath }, 'Telegram webhook route registrado');
  }

  return app;
}

export async function startServer(telegramBot?: Telegraf<Context>) {
  const app = await buildServer(telegramBot);
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`HTTP server listening on ${config.HOST}:${config.PORT}`);
  return app;
}

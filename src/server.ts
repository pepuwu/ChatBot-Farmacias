import Fastify from 'fastify';
import QRCode from 'qrcode';
import type { Context, Telegraf } from 'telegraf';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { sessionManager } from './whatsapp/session-manager.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function buildServer(telegramBot?: Telegraf<Context>) {
  const app = Fastify({ logger: false });

  app.get('/', async () => ({ ok: true, service: 'chatbot-farmacias' }));

  app.get('/health', async () => {
    const farmaciasCount = await prisma.farmacia.count({ where: { activa: true } });
    return { status: 'ok', farmaciasActivas: farmaciasCount };
  });

  app.get<{ Params: { sessionId: string } }>('/qr/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    reply.type('text/html; charset=utf-8');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>QR — ${escapeHtml(sessionId)}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #111; color: #eee; text-align: center; padding: 40px 16px; margin: 0; }
  h1 { font-weight: 500; font-size: 20px; }
  .qr-wrap { display: inline-block; background: white; padding: 20px; border-radius: 12px; margin: 20px 0; min-height: 280px; min-width: 280px; }
  img { display: block; width: 280px; height: 280px; }
  .status { color: #aaa; font-size: 14px; }
</style>
</head>
<body>
  <h1>Sesión: ${escapeHtml(sessionId)}</h1>
  <div class="qr-wrap"><img id="qr" alt="QR" style="display:none"></div>
  <p class="status" id="status">⏳ Esperando QR...</p>
  <p class="status">Se actualiza cada 15s</p>
  <script>
    const img = document.getElementById('qr');
    const status = document.getElementById('status');
    async function tick() {
      try {
        const r = await fetch(location.pathname + '/image?t=' + Date.now());
        if (r.ok) {
          const blob = await r.blob();
          img.src = URL.createObjectURL(blob);
          img.style.display = '';
          status.textContent = 'Escaneá con WhatsApp → Dispositivos vinculados';
        } else if (r.status === 204) {
          img.style.display = 'none';
          status.textContent = '✅ Sesión ya emparejada';
        } else {
          img.style.display = 'none';
          status.textContent = '⏳ Esperando QR...';
        }
      } catch {
        status.textContent = '⚠️ Error de conexión';
      }
    }
    tick();
    setInterval(tick, 15000);
  </script>
</body>
</html>`;
  });

  app.get<{ Params: { sessionId: string } }>('/qr/:sessionId/image', async (request, reply) => {
    const { sessionId } = request.params;
    if (sessionManager.isReady(sessionId)) {
      reply.code(204);
      return null;
    }
    const qr = sessionManager.getLastQR(sessionId);
    if (!qr) {
      reply.code(404);
      return { error: 'no QR available' };
    }
    const png = await QRCode.toBuffer(qr, { width: 280, margin: 1 });
    reply.type('image/png').header('cache-control', 'no-store');
    return png;
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

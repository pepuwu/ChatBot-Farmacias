import { config } from './config.js';
import { logger } from './logger.js';
import { prisma } from './db.js';
import { startServer } from './server.js';
import { startAllPharmacySessions, registerPharmacyHandler } from './whatsapp/customer-bot.js';
import { startAdminSession, registerAdminHandler } from './whatsapp/admin-bot.js';
import { startTelegramBot } from './telegram/bot.js';
import { startCleanupInterval } from './services/cleanup.js';

async function main() {
  logger.info({ model: config.OPENAI_MODEL }, 'Chatbot Farmacias — iniciando');

  // Verificar conexión a DB
  await prisma.$connect();

  // Registrar handlers de mensajes antes de iniciar sesiones
  registerPharmacyHandler();
  registerAdminHandler();

  // HTTP server para health checks
  await startServer();

  // Bot de Telegram (super admin) — no depende de Baileys, lo arrancamos primero
  const tgBot = await startTelegramBot();

  // Sesiones de WhatsApp
  await startAdminSession();
  await startAllPharmacySessions();

  // Cleanup de sesiones inactivas
  startCleanupInterval();

  logger.info('✅ Sistema listo');

  // Shutdown limpio
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Apagando...');
    tgBot.stop(signal);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal');
  process.exit(1);
});

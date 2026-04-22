import { Telegraf, type Context } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { prisma } from '../db.js';
import { sessionManager } from '../whatsapp/session-manager.js';
import { pharmacySessionId, startPharmacySession } from '../whatsapp/customer-bot.js';
import { ADMIN_SESSION_ID, startAdminSession } from '../whatsapp/admin-bot.js';

/**
 * Bot de Telegram para vos (super admin). Sirve para:
 * - Dar de alta / listar / dar de baja farmacias
 * - Dar de alta farmacéuticos (admins por farmacia)
 * - Ver estado de las sesiones de WhatsApp
 */

export function buildTelegramBot() {
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx: Context, next) => {
    if (ctx.from?.id !== config.TELEGRAM_SUPER_ADMIN_ID) {
      await ctx.reply('No autorizado.');
      return;
    }
    await next();
  });

  bot.start((ctx) =>
    ctx.reply(
      `🤖 Panel de control — Chatbot Farmacias\n\n` +
        `Comandos:\n` +
        `/farmacias — listar farmacias\n` +
        `/nueva_farmacia <nombre>|<whatsappNumber>|<direccion> — alta de farmacia\n` +
        `/nuevo_admin <farmaciaId>|<whatsappNumber>|<nombre> — alta de farmacéutico\n` +
        `/farmacia <id> — detalle\n` +
        `/desactivar <id> — desactivar farmacia\n` +
        `/activar <id> — reactivar farmacia\n` +
        `/sesiones — estado de las sesiones de WhatsApp\n` +
        `/qr <farmaciaId> — forzar re-escaneo (reinicia la sesión)\n`,
    ),
  );

  bot.command('farmacias', async (ctx) => {
    const lista = await prisma.farmacia.findMany({ orderBy: { createdAt: 'asc' } });
    if (lista.length === 0) return ctx.reply('No hay farmacias cargadas.');
    const lines = lista.map(
      (f) =>
        `${f.activa ? '🟢' : '🔴'} ${f.nombre}\n   id: ${f.id}\n   wa: ${f.whatsappNumber}`,
    );
    return ctx.reply(lines.join('\n\n'));
  });

  bot.command('nueva_farmacia', async (ctx) => {
    const raw = ctx.message.text.replace(/^\/nueva_farmacia\s*/, '');
    const parts = raw.split('|').map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return ctx.reply('Uso: /nueva_farmacia <nombre>|<whatsappNumber>|<direccion opcional>');
    }
    const [nombre, whatsappNumberRaw, direccion = ''] = parts;
    const whatsappNumber = whatsappNumberRaw.replace(/[^0-9]/g, '');

    try {
      const f = await prisma.farmacia.create({
        data: {
          nombre,
          whatsappNumber,
          direccion,
          horarios: {
            semana: 'Lunes a Viernes 8:00 a 20:00',
            sabado: '9:00 a 14:00',
            domingo: 'Cerrado',
          },
        },
      });
      await startPharmacySession(f.id).catch((err) =>
        logger.error({ err }, 'Error iniciando sesión de nueva farmacia'),
      );
      return ctx.reply(
        `✅ Farmacia creada.\nid: ${f.id}\n\nEscaneá el QR que aparece en los logs del servidor para emparejar el número ${whatsappNumber}.`,
      );
    } catch (err: unknown) {
      logger.error({ err }, 'Error creando farmacia');
      const msg = err instanceof Error ? err.message : 'desconocido';
      return ctx.reply(`❌ Error: ${msg}`);
    }
  });

  bot.command('nuevo_admin', async (ctx) => {
    const raw = ctx.message.text.replace(/^\/nuevo_admin\s*/, '');
    const parts = raw.split('|').map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return ctx.reply('Uso: /nuevo_admin <farmaciaId>|<whatsappNumber>|<nombre opcional>');
    }
    const [farmaciaId, whatsappNumberRaw, nombre = ''] = parts;
    const whatsappNumber = whatsappNumberRaw.replace(/[^0-9]/g, '');

    try {
      const admin = await prisma.admin.create({
        data: { farmaciaId, whatsappNumber, nombre },
      });
      return ctx.reply(`✅ Farmacéutico registrado.\nid: ${admin.id}\nwa: ${admin.whatsappNumber}`);
    } catch (err: unknown) {
      logger.error({ err }, 'Error creando admin');
      const msg = err instanceof Error ? err.message : 'desconocido';
      return ctx.reply(`❌ Error: ${msg}`);
    }
  });

  bot.command('farmacia', async (ctx) => {
    const id = ctx.message.text.replace(/^\/farmacia\s*/, '').trim();
    if (!id) return ctx.reply('Uso: /farmacia <id>');
    const f = await prisma.farmacia.findUnique({
      where: { id },
      include: { admins: true, _count: { select: { clientes: true, conversaciones: true } } },
    });
    if (!f) return ctx.reply('No encontrada.');
    const adminsStr = f.admins.map((a) => `  • ${a.whatsappNumber} (${a.nombre || '—'})`).join('\n') || '  —';
    return ctx.reply(
      `${f.activa ? '🟢' : '🔴'} ${f.nombre}\n` +
        `id: ${f.id}\n` +
        `wa: ${f.whatsappNumber}\n` +
        `dirección: ${f.direccion || '—'}\n` +
        `delivery: ${f.delivery ? 'Sí' : 'No'} (${f.zonaDelivery || '—'})\n` +
        `clientes: ${f._count.clientes}\n` +
        `conversaciones: ${f._count.conversaciones}\n` +
        `admins:\n${adminsStr}`,
    );
  });

  bot.command('desactivar', async (ctx) => {
    const id = ctx.message.text.replace(/^\/desactivar\s*/, '').trim();
    if (!id) return ctx.reply('Uso: /desactivar <id>');
    await prisma.farmacia.update({ where: { id }, data: { activa: false } });
    await sessionManager.stopSession(pharmacySessionId(id)).catch(() => {});
    return ctx.reply('🔴 Desactivada.');
  });

  bot.command('activar', async (ctx) => {
    const id = ctx.message.text.replace(/^\/activar\s*/, '').trim();
    if (!id) return ctx.reply('Uso: /activar <id>');
    await prisma.farmacia.update({ where: { id }, data: { activa: true } });
    await startPharmacySession(id).catch((err) =>
      logger.error({ err }, 'Error iniciando sesión al reactivar'),
    );
    return ctx.reply('🟢 Activada.');
  });

  bot.command('sesiones', async (ctx) => {
    const sessions = sessionManager.listSessions();
    if (sessions.length === 0) return ctx.reply('No hay sesiones activas.');
    const lines = sessions.map(
      (s) => `${sessionManager.isReady(s) ? '🟢' : '🟡'} ${s}`,
    );
    return ctx.reply(lines.join('\n'));
  });

  bot.command('qr', async (ctx) => {
    const arg = ctx.message.text.replace(/^\/qr\s*/, '').trim();
    if (!arg) return ctx.reply('Uso: /qr <farmaciaId> | /qr admin');

    const isAdmin = arg.toLowerCase() === 'admin';
    const sid = isAdmin ? ADMIN_SESSION_ID : pharmacySessionId(arg);

    await sessionManager.stopSession(sid).catch(() => {});
    resetQRPushCount(sid);
    const restart = isAdmin ? startAdminSession() : startPharmacySession(arg);
    restart.catch((err) => logger.error({ err, sid }, 'Error reiniciando sesión'));

    return ctx.reply(
      `🔗 Escaneá el QR desde acá (se actualiza automáticamente):\n${qrLink(sid)}`,
      { link_preview_options: { is_disabled: true } },
    );
  });

  bot.catch((err, ctx) => {
    logger.error({ err, update: ctx.update }, 'Error en Telegraf');
  });

  return bot;
}

/**
 * Empuja automáticamente al super admin cualquier QR emitido por cualquier
 * sesión de WhatsApp (admin o farmacia), como imagen PNG.
 */
const qrLinkSent = new Set<string>();

export function resetQRPushCount(sessionId: string) {
  qrLinkSent.delete(sessionId);
}

function qrLink(sessionId: string): string {
  const base = config.PUBLIC_URL?.replace(/\/$/, '') ?? '';
  return `${base}/qr/${encodeURIComponent(sessionId)}`;
}

export function registerQRPushToSuperAdmin(bot: Telegraf) {
  return sessionManager.onQR(async (sessionId) => {
    if (qrLinkSent.has(sessionId)) return;
    qrLinkSent.add(sessionId);

    try {
      await bot.telegram.sendMessage(
        config.TELEGRAM_SUPER_ADMIN_ID,
        `🔗 Escaneá el QR desde acá (se actualiza automáticamente):\n${qrLink(sessionId)}`,
        { link_preview_options: { is_disabled: true } },
      );
    } catch (err) {
      logger.error({ err, sessionId }, 'Error mandando link de QR al super admin');
    }
  });
}

export async function startTelegramBot(bot = buildTelegramBot()) {
  if (config.TELEGRAM_WEBHOOK_URL) {
    await bot.telegram.setWebhook(
      config.TELEGRAM_WEBHOOK_URL,
      config.TELEGRAM_WEBHOOK_SECRET ? { secret_token: config.TELEGRAM_WEBHOOK_SECRET } : undefined,
    );
    const info = await bot.telegram.getWebhookInfo();
    logger.info(
      { url: info.url, pending: info.pending_update_count, lastError: info.last_error_message },
      'Bot de Telegram iniciado (webhook)',
    );
    return bot;
  }

  await bot.telegram.deleteWebhook();
  bot.launch().catch((err) => logger.error({ err }, 'bot.launch() falló'));
  logger.info('Bot de Telegram iniciado (polling)');
  return bot;
}

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

// ---------------------------------------------------------------------------
// Onboarding conversacional — /nueva_farmacia
// ---------------------------------------------------------------------------

type OnboardingStep =
  | 'nombre'
  | 'whatsapp'
  | 'direccion'
  | 'telefonoFijo'
  | 'horarioSemana'
  | 'horarioSabado'
  | 'horarioDomingo'
  | 'delivery'
  | 'zonaDelivery'
  | 'obrasSociales'
  | 'servicios'
  | 'productosExcluidos'
  | 'farmaceutico'
  | 'confirmacion';

interface OnboardingData {
  nombre: string;
  whatsapp: string;
  direccion: string;
  telefonoFijo: string | null;
  horarioSemana: string;
  horarioSabado: string;
  horarioDomingo: string;
  delivery: boolean;
  zonaDelivery: string;
  obrasSociales: string[];
  servicios: string[];
  productosExcluidos: string[];
  farmaceutico: string;
}

interface OnboardingState {
  step: OnboardingStep;
  data: Partial<OnboardingData>;
}

const onboardingMap = new Map<number, OnboardingState>();

const QUESTIONS: Record<Exclude<OnboardingStep, 'confirmacion'>, string> = {
  nombre:             '🏪 ¿Cuál es el nombre de la farmacia?',
  whatsapp:           '📱 ¿Cuál es el número de WhatsApp? (solo números, sin +, sin espacios)\nEj: 5491123456789',
  direccion:          '📍 ¿Cuál es la dirección?',
  telefonoFijo:       '☎️ ¿Tienen teléfono fijo? (o escribí "-" si no tienen)',
  horarioSemana:      '🕐 Horario de lunes a viernes (ej: "8:00 a 20:00")',
  horarioSabado:      '🕐 Horario del sábado (ej: "9:00 a 13:00", o "-" si no abre)',
  horarioDomingo:     '🕐 Horario del domingo (ej: "10:00 a 13:00", o "-" si no abre)',
  delivery:           '🛵 ¿Hacen delivery? Respondé "si" o "no"',
  zonaDelivery:       '📦 ¿Cuál es la zona de cobertura? (ej: "radio 5km" o listá los barrios)',
  obrasSociales:      '🏥 Obras sociales aceptadas (ej: "OSDE, PAMI, Swiss Medical" o "-" si ninguna)',
  servicios:          '⚕️ Servicios especiales (ej: "Inyectables, Análisis" o "-" si ninguno)',
  productosExcluidos: '🚫 Productos que NO manejan (ej: "Homeopatía, Veterinaria" o "-" si manejan todo)',
  farmaceutico:       '👤 ¿Cómo se llama el farmacéutico/a principal?',
};

/** Devuelve la lista de pasos en orden, omitiendo zonaDelivery si delivery=false */
function stepsFor(delivery: boolean): OnboardingStep[] {
  return [
    'nombre', 'whatsapp', 'direccion', 'telefonoFijo',
    'horarioSemana', 'horarioSabado', 'horarioDomingo',
    'delivery',
    ...(delivery ? (['zonaDelivery'] as OnboardingStep[]) : []),
    'obrasSociales', 'servicios', 'productosExcluidos',
    'farmaceutico', 'confirmacion',
  ];
}

function nextStep(current: OnboardingStep, delivery: boolean): OnboardingStep | null {
  const steps = stepsFor(delivery);
  const idx = steps.indexOf(current);
  return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
}

function splitList(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildSummary(data: Partial<OnboardingData>): string {
  const obras = data.obrasSociales?.length ? data.obrasSociales.join(', ') : 'Ninguna';
  const servicios = data.servicios?.length ? data.servicios.join(', ') : 'Ninguno';
  const excluidos = data.productosExcluidos?.length ? data.productosExcluidos.join(', ') : 'Ninguno';
  const sabado = data.horarioSabado === '-' ? 'No abre' : data.horarioSabado;
  const domingo = data.horarioDomingo === '-' ? 'No abre' : data.horarioDomingo;

  return (
    `📋 *Resumen de la farmacia*\n\n` +
    `🏪 *Nombre:* ${data.nombre}\n` +
    `📱 *WhatsApp:* +${data.whatsapp}\n` +
    `📍 *Dirección:* ${data.direccion}\n` +
    `☎️ *Tel\\. fijo:* ${data.telefonoFijo ?? '—'}\n` +
    `🕐 *L\\-V:* ${data.horarioSemana}\n` +
    `🕐 *Sábado:* ${sabado}\n` +
    `🕐 *Domingo:* ${domingo}\n` +
    `🛵 *Delivery:* ${data.delivery ? `Sí — ${data.zonaDelivery}` : 'No'}\n` +
    `🏥 *Obras sociales:* ${obras}\n` +
    `⚕️ *Servicios:* ${servicios}\n` +
    `🚫 *Excluidos:* ${excluidos}\n` +
    `👤 *Farmacéutico/a:* ${data.farmaceutico}\n\n` +
    `¿Guardamos? Respondé *si* para confirmar o *no* para cancelar\\.`
  );
}

// ---------------------------------------------------------------------------
// Bot principal
// ---------------------------------------------------------------------------

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
        `/nueva_farmacia — alta de farmacia (flujo paso a paso)\n` +
        `/cancelar — cancelar flujo activo\n` +
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

  // --- Alta de farmacia: flujo conversacional ---
  bot.command('nueva_farmacia', async (ctx) => {
    const chatId = ctx.chat.id;
    // Si ya hay un flujo activo, lo reinicia
    onboardingMap.set(chatId, { step: 'nombre', data: {} });
    return ctx.reply(
      '🆕 *Alta de nueva farmacia* — Vamos paso a paso\\.\n' +
        'En cualquier momento escribí /cancelar para salir\\.\n\n' +
        QUESTIONS.nombre,
      { parse_mode: 'MarkdownV2' },
    );
  });

  bot.command('cancelar', async (ctx) => {
    const chatId = ctx.chat.id;
    if (onboardingMap.has(chatId)) {
      onboardingMap.delete(chatId);
      return ctx.reply('❌ Flujo cancelado. Los datos no fueron guardados.');
    }
    return ctx.reply('No hay ningún flujo activo para cancelar.');
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

  // --- Handler del flujo conversacional ---
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = onboardingMap.get(chatId);
    if (!state) return;

    const text = ctx.message.text.trim();
    // Los comandos los manejan sus handlers; acá solo procesamos respuestas libres
    if (text.startsWith('/')) return;

    const { step, data } = state;

    // --- Paso de confirmación ---
    if (step === 'confirmacion') {
      const resp = text.toLowerCase();
      if (resp === 'si') {
        onboardingMap.delete(chatId);
        try {
          const f = await prisma.farmacia.create({
            data: {
              nombre:             data.nombre!,
              whatsappNumber:     data.whatsapp!,
              direccion:          data.direccion!,
              telefonoFijo:       data.telefonoFijo ?? null,
              horarios: {
                semana:  data.horarioSemana!,
                sabado:  data.horarioSabado === '-' ? '' : data.horarioSabado!,
                domingo: data.horarioDomingo === '-' ? '' : data.horarioDomingo!,
              },
              delivery:           data.delivery!,
              zonaDelivery:       data.zonaDelivery ?? '',
              obrasSociales:      data.obrasSociales ?? [],
              servicios:          data.servicios ?? [],
              productosExcluidos: data.productosExcluidos ?? [],
            },
          });
          await startPharmacySession(f.id).catch((err) =>
            logger.error({ err }, 'Error iniciando sesión de nueva farmacia'),
          );
          return ctx.reply(
            `✅ Farmacia creada.\nid: ${f.id}\n\n` +
              `Para registrar a ${data.farmaceutico} como farmacéutico/a:\n` +
              `/nuevo_admin ${f.id}|<número_WA>|${data.farmaceutico}\n\n` +
              `Escaneá el QR que aparece en los logs para emparejar el número +${data.whatsapp}.`,
          );
        } catch (err: unknown) {
          logger.error({ err }, 'Error creando farmacia en onboarding');
          const msg = err instanceof Error ? err.message : 'desconocido';
          return ctx.reply(`❌ Error al guardar: ${msg}`);
        }
      } else if (resp === 'no') {
        onboardingMap.delete(chatId);
        return ctx.reply('❌ Cancelado. Los datos no fueron guardados.');
      } else {
        return ctx.reply('Respondé "si" para guardar o "no" para cancelar.');
      }
    }

    // --- Validación y almacenamiento por paso ---
    let error: string | null = null;

    switch (step) {
      case 'nombre':
        if (!text) { error = 'El nombre no puede estar vacío.'; break; }
        data.nombre = text;
        break;

      case 'whatsapp': {
        const nums = text.replace(/[^0-9]/g, '');
        if (nums.length < 10) { error = 'Número inválido. Ingresá solo números (mínimo 10 dígitos).'; break; }
        data.whatsapp = nums;
        break;
      }

      case 'direccion':
        data.direccion = text;
        break;

      case 'telefonoFijo':
        data.telefonoFijo = text === '-' ? null : text;
        break;

      case 'horarioSemana':
        data.horarioSemana = text;
        break;

      case 'horarioSabado':
        data.horarioSabado = text;
        break;

      case 'horarioDomingo':
        data.horarioDomingo = text;
        break;

      case 'delivery': {
        const v = text.toLowerCase();
        if (v !== 'si' && v !== 'no') { error = 'Respondé "si" o "no".'; break; }
        data.delivery = v === 'si';
        break;
      }

      case 'zonaDelivery':
        data.zonaDelivery = text;
        break;

      case 'obrasSociales':
        data.obrasSociales = text === '-' ? [] : splitList(text);
        break;

      case 'servicios':
        data.servicios = text === '-' ? [] : splitList(text);
        break;

      case 'productosExcluidos':
        data.productosExcluidos = text === '-' ? [] : splitList(text);
        break;

      case 'farmaceutico':
        data.farmaceutico = text;
        break;
    }

    if (error) {
      return ctx.reply(`⚠️ ${error}`);
    }

    // Avanzar al siguiente paso
    const next = nextStep(step, data.delivery ?? false);
    if (!next) return;
    state.step = next;

    if (next === 'confirmacion') {
      return ctx.reply(buildSummary(data), { parse_mode: 'MarkdownV2' });
    }

    return ctx.reply(QUESTIONS[next]);
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

import { Telegraf, Markup, type Context } from 'telegraf';
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
 * - Editar datos de farmacias con panel interactivo
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
// Panel de edición de farmacia
// ---------------------------------------------------------------------------

type EditableField =
  | 'nombre' | 'direccion' | 'telefonoFijo'
  | 'horarioSemana' | 'horarioSabado' | 'horarioDomingo'
  | 'delivery' | 'zonaDelivery'
  | 'obrasSociales' | 'servicios' | 'productosExcluidos'
  | 'mensajeBienvenida' | 'mensajeDerivacion' | 'tiempoSesionMinutos' | 'promptSistema';

interface EditState { farmaciaId: string; field: EditableField | null }
const editMap = new Map<number, EditState>();

const FIELD_LABELS: Record<EditableField, string> = {
  nombre: 'Nombre', direccion: 'Dirección', telefonoFijo: 'Tel. fijo',
  horarioSemana: 'Horario L-V', horarioSabado: 'Horario Sáb', horarioDomingo: 'Horario Dom',
  delivery: 'Delivery', zonaDelivery: 'Zona delivery',
  obrasSociales: 'Obras sociales', servicios: 'Servicios', productosExcluidos: 'Excluidos',
  mensajeBienvenida: 'Bienvenida', mensajeDerivacion: 'Derivación',
  tiempoSesionMinutos: 'Tiempo sesión', promptSistema: 'Prompt custom',
};

const FIELD_PROMPTS: Record<EditableField, string> = {
  nombre:             '¿Cuál es el nuevo nombre?',
  direccion:          '¿Cuál es la nueva dirección?',
  telefonoFijo:       '¿Cuál es el nuevo teléfono fijo? (o "-" para eliminar)',
  horarioSemana:      '¿Nuevo horario L-V? (ej: "8:00 a 20:00")',
  horarioSabado:      '¿Nuevo horario sábado? (ej: "9:00 a 13:00", o "-" si no abre)',
  horarioDomingo:     '¿Nuevo horario domingo? (ej: "10:00 a 13:00", o "-" si no abre)',
  delivery:           '¿Hace delivery? Respondé "si" o "no"',
  zonaDelivery:       '¿Cuál es la zona de cobertura?',
  obrasSociales:      '¿Cuáles obras sociales? (separadas por comas, o "-" para ninguna)',
  servicios:          '¿Cuáles servicios? (separados por comas, o "-" para ninguno)',
  productosExcluidos: '¿Qué productos excluyen? (separados por comas, o "-" para ninguno)',
  mensajeBienvenida:  '¿Cuál es el nuevo mensaje de bienvenida?',
  mensajeDerivacion:  '¿Cuál es el nuevo mensaje de derivación al farmacéutico?',
  tiempoSesionMinutos: '¿Cuántos minutos dura la sesión sin actividad? (número entero)',
  promptSistema:      '¿Cuál es el nuevo prompt del sistema? (o "-" para usar el por defecto)',
};

type FarmaciaRow = {
  id: string; nombre: string; direccion: string; telefonoFijo: string | null;
  horarios: unknown; delivery: boolean; zonaDelivery: string;
  obrasSociales: string[]; servicios: string[]; productosExcluidos: string[];
  mensajeBienvenida: string; mensajeDerivacion: string;
  tiempoSesionMinutos: number; promptSistema: string | null;
};

function buildFarmaciaPanel(f: FarmaciaRow): string {
  const h = (f.horarios as { semana?: string; sabado?: string; domingo?: string }) ?? {};
  const obras = f.obrasSociales.length ? f.obrasSociales.join(', ') : '—';
  const servs = f.servicios.length ? f.servicios.join(', ') : '—';
  const excl = f.productosExcluidos.length ? f.productosExcluidos.join(', ') : '—';
  return (
    `📋 ${f.nombre}\n` +
    `id: ${f.id}\n\n` +
    `📍 Dirección: ${f.direccion || '—'}\n` +
    `☎️ Tel. fijo: ${f.telefonoFijo || '—'}\n` +
    `🕐 L-V: ${h.semana || '—'}\n` +
    `🕐 Sáb: ${h.sabado || '—'}\n` +
    `🕐 Dom: ${h.domingo || '—'}\n` +
    `🛵 Delivery: ${f.delivery ? `Sí — ${f.zonaDelivery || '—'}` : 'No'}\n` +
    `🏥 Obras sociales: ${obras}\n` +
    `⚕️ Servicios: ${servs}\n` +
    `🚫 Excluidos: ${excl}\n` +
    `💬 Bienvenida: ${f.mensajeBienvenida || '—'}\n` +
    `🔀 Derivación: ${f.mensajeDerivacion}\n` +
    `⏱ Sesión: ${f.tiempoSesionMinutos} min\n` +
    `🤖 Prompt custom: ${f.promptSistema ? '✅ configurado' : '—'}\n\n` +
    `Tocá un campo para editarlo:`
  );
}

function buildEditKeyboard(farmaciaId: string) {
  const fields: EditableField[] = [
    'nombre', 'direccion', 'telefonoFijo',
    'horarioSemana', 'horarioSabado', 'horarioDomingo',
    'delivery', 'zonaDelivery',
    'obrasSociales', 'servicios', 'productosExcluidos',
    'mensajeBienvenida', 'mensajeDerivacion', 'tiempoSesionMinutos', 'promptSistema',
  ];
  const rows = [];
  for (let i = 0; i < fields.length; i += 2) {
    const row = [Markup.button.callback(`✏️ ${FIELD_LABELS[fields[i]!]}`, `ec:${farmaciaId}:${fields[i]}`)];
    if (fields[i + 1]) row.push(Markup.button.callback(`✏️ ${FIELD_LABELS[fields[i + 1]!]}`, `ec:${farmaciaId}:${fields[i + 1]}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback('✅ Cerrar', 'ec_close')]);
  return Markup.inlineKeyboard(rows);
}

async function applyFieldEdit(farmaciaId: string, field: EditableField, value: string): Promise<string | null> {
  switch (field) {
    case 'nombre':
      if (!value) return 'El nombre no puede estar vacío.';
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { nombre: value } });
      break;
    case 'direccion':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { direccion: value } });
      break;
    case 'telefonoFijo':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { telefonoFijo: value === '-' ? null : value } });
      break;
    case 'horarioSemana':
    case 'horarioSabado':
    case 'horarioDomingo': {
      const key = field === 'horarioSemana' ? 'semana' : field === 'horarioSabado' ? 'sabado' : 'domingo';
      const cur = await prisma.farmacia.findUnique({ where: { id: farmaciaId }, select: { horarios: true } });
      const h = ((cur?.horarios ?? {}) as Record<string, string>);
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { horarios: { ...h, [key]: value === '-' ? '' : value } } });
      break;
    }
    case 'delivery': {
      const v = value.toLowerCase();
      if (v !== 'si' && v !== 'sí' && v !== 'no') return 'Respondé "si" o "no".';
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { delivery: v !== 'no' } });
      break;
    }
    case 'zonaDelivery':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { zonaDelivery: value } });
      break;
    case 'obrasSociales':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { obrasSociales: value === '-' ? [] : splitList(value) } });
      break;
    case 'servicios':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { servicios: value === '-' ? [] : splitList(value) } });
      break;
    case 'productosExcluidos':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { productosExcluidos: value === '-' ? [] : splitList(value) } });
      break;
    case 'mensajeBienvenida':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { mensajeBienvenida: value } });
      break;
    case 'mensajeDerivacion':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { mensajeDerivacion: value } });
      break;
    case 'tiempoSesionMinutos': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1) return 'Ingresá un número válido (mínimo 1).';
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { tiempoSesionMinutos: n } });
      break;
    }
    case 'promptSistema':
      await prisma.farmacia.update({ where: { id: farmaciaId }, data: { promptSistema: value === '-' ? null : value } });
      break;
  }
  return null;
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
        `/editar [farmaciaId] — editar datos de una farmacia\n` +
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
    if (onboardingMap.has(chatId) || editMap.has(chatId)) {
      onboardingMap.delete(chatId);
      editMap.delete(chatId);
      return ctx.reply('❌ Flujo cancelado.');
    }
    return ctx.reply('No hay ningún flujo activo para cancelar.');
  });

  // --- Editar farmacia ---
  bot.command('editar', async (ctx) => {
    const arg = ctx.message.text.replace(/^\/editar\s*/, '').trim();

    if (arg) {
      const f = await prisma.farmacia.findUnique({ where: { id: arg } });
      if (!f) return ctx.reply('Farmacia no encontrada.');
      editMap.set(ctx.chat.id, { farmaciaId: f.id, field: null });
      return ctx.reply(buildFarmaciaPanel(f), buildEditKeyboard(f.id));
    }

    const lista = await prisma.farmacia.findMany({ orderBy: { createdAt: 'asc' } });
    if (lista.length === 0) return ctx.reply('No hay farmacias cargadas.');
    if (lista.length === 1) {
      const f = lista[0]!;
      editMap.set(ctx.chat.id, { farmaciaId: f.id, field: null });
      return ctx.reply(buildFarmaciaPanel(f), buildEditKeyboard(f.id));
    }
    const buttons = lista.map((f) => [Markup.button.callback(`${f.activa ? '🟢' : '🔴'} ${f.nombre}`, `ef:${f.id}`)]);
    return ctx.reply('¿Cuál farmacia querés editar?', Markup.inlineKeyboard(buttons));
  });

  // Callback: selección de farmacia desde lista
  bot.action(/^ef:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const farmaciaId = ctx.match[1]!;
    const f = await prisma.farmacia.findUnique({ where: { id: farmaciaId } });
    if (!f) return;
    editMap.set(ctx.chat!.id, { farmaciaId: f.id, field: null });
    return ctx.editMessageText(buildFarmaciaPanel(f), buildEditKeyboard(f.id));
  });

  // Callback: selección de campo a editar
  bot.action(/^ec:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const farmaciaId = ctx.match[1]!;
    const field = ctx.match[2]!;
    editMap.set(ctx.chat!.id, { farmaciaId, field: field as EditableField });
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    return ctx.reply(`${FIELD_PROMPTS[field as EditableField]}\n\n/cancelar para cancelar`);
  });

  // Callback: cerrar panel
  bot.action('ec_close', async (ctx) => {
    await ctx.answerCbQuery();
    editMap.delete(ctx.chat!.id);
    return ctx.editMessageReplyMarkup({ inline_keyboard: [] });
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

  // --- Handler de texto libre (onboarding + edición) ---
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    // Edición de campo
    const editState = editMap.get(chatId);
    if (editState?.field) {
      const err = await applyFieldEdit(editState.farmaciaId, editState.field, text);
      editState.field = null;
      if (err) return ctx.reply(`⚠️ ${err}`);
      const updated = await prisma.farmacia.findUnique({ where: { id: editState.farmaciaId } });
      if (!updated) return;
      await ctx.reply('✅ Guardado.');
      return ctx.reply(buildFarmaciaPanel(updated), buildEditKeyboard(updated.id));
    }

    // Onboarding
    const state = onboardingMap.get(chatId);
    if (!state) return;

    const { step, data } = state;

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

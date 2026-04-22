import type { Farmacia } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { sessionManager, type IncomingMessage } from './session-manager.js';
import {
  agregarAListaEspera,
  cambiarEstadoConversacion,
  getClientesEsperandoProducto,
  getConversacionesEnEspera,
  getListaEspera,
  liberarConversacionesDeFarmacia,
  marcarNotificados,
  tomarControl,
} from '../services/conversation.js';
import { generarMensajeOferta } from '../ai/openai.js';

export const ADMIN_SESSION_ID = 'admin';

const PHARMACY_PREFIX = 'pharmacy:';
function pharmacySessionId(farmaciaId: string) {
  return `${PHARMACY_PREFIX}${farmaciaId}`;
}
async function sendFromPharmacy(farmaciaId: string, telefono: string, text: string) {
  await sessionManager.sendText(pharmacySessionId(farmaciaId), telefono, text);
}
async function getClientesCount(farmaciaId: string) {
  return prisma.cliente.count({ where: { farmaciaId } });
}
async function getClientesTelefonos(farmaciaId: string) {
  const rows = await prisma.cliente.findMany({ where: { farmaciaId }, select: { telefono: true } });
  return rows.map((r) => r.telefono);
}

interface OfertaPendiente {
  farmaciaId: string;
  descripcionOriginal: string;
  mensajeActual: string;
}
interface ControlActivo {
  farmaciaId: string;
  telefonoCliente: string;
  conversacionId: string;
}

// Estado en memoria por farmacéutico
const ofertasPendientes = new Map<string, OfertaPendiente>();
const controlesActivos = new Map<string, ControlActivo>();
// WhatsApp moderno entrega JIDs `@lid` anónimos; guardamos el último JID visto
// por cada número para poder responder al JID correcto.
const pnToJid = new Map<string, string>();

// ─── Boot ────────────────────────────────────────────────────────────────────

export async function startAdminSession() {
  await sessionManager.startSession(ADMIN_SESSION_ID);
}

export function registerAdminHandler() {
  return sessionManager.onMessage(async (sessionId, msg) => {
    if (sessionId !== ADMIN_SESSION_ID || msg.isFromMe) return;
    await handleAdminMessage(msg);
  });
}

// ─── Envío ───────────────────────────────────────────────────────────────────

async function reply(telefono: string, text: string) {
  try {
    await sessionManager.sendText(ADMIN_SESSION_ID, telefono, text);
  } catch (errPhone) {
    // Fallback: si el JID por número falla, probar el @lid cacheado del sender.
    const jid = pnToJid.get(telefono);
    if (!jid) {
      logger.error({ err: errPhone, telefono }, 'Error enviando desde sesión admin');
      return;
    }
    try {
      await sessionManager.sendToJid(ADMIN_SESSION_ID, jid, text);
    } catch (errLid) {
      logger.error({ errPhone, errLid, telefono, jid }, 'Error enviando desde sesión admin (ambos intentos)');
    }
  }
}

// ─── Notificación de pedido ──────────────────────────────────────────────────

export async function notificarPedido(farmacia: Farmacia, telefonoCliente: string, textoPedido: string) {
  const admins = await prisma.admin.findMany({ where: { farmaciaId: farmacia.id } });
  if (admins.length === 0) {
    logger.warn({ farmaciaId: farmacia.id }, 'Pedido sin admins registrados');
    return;
  }

  const msg =
    `⚠️ Pedido nuevo - ${farmacia.nombre}\n\n` +
    `👤 Cliente: ${telefonoCliente}\n` +
    `🛒 Productos: ${textoPedido}\n\n` +
    `Respondé "tomar ${telefonoCliente}" para atenderlo`;

  for (const a of admins) {
    await reply(a.whatsappNumber, msg);
  }
}

// ─── Router principal ────────────────────────────────────────────────────────

async function handleAdminMessage(msg: IncomingMessage) {
  const remitente = msg.phoneNumber;
  pnToJid.set(remitente, msg.from);

  const admin = await prisma.admin.findUnique({
    where: { whatsappNumber: remitente },
    include: { farmacia: true },
  });

  if (!admin) {
    await reply(remitente, 'No estás registrado como farmacéutico. Contactá al administrador del sistema.');
    return;
  }

  const farmacia = admin.farmacia;
  const text = msg.text.trim();
  const lower = text.toLowerCase();

  logger.info({ remitente, farmacia: farmacia.nombre, text }, 'Msg de farmacéutico');

  // ── Oferta pendiente de confirmación ──
  const pendiente = ofertasPendientes.get(remitente);
  if (pendiente) {
    if (lower === 'sí' || lower === 'si') { await confirmarOferta(remitente, pendiente); return; }
    if (lower === 'no') { await cancelarOferta(remitente); return; }
    if (lower.startsWith('editar ')) { await editarOferta(remitente, pendiente, text.slice(7).trim()); return; }
  }

  // ── Control activo: reenviar texto libre al cliente ──
  const control = controlesActivos.get(remitente);
  if (control && !esComando(lower)) {
    await reenviarAlCliente(remitente, control, text);
    return;
  }

  // ── Comandos (sin slash, lenguaje natural) ──
  if (lower.startsWith('tomar '))       { await handleTomar(remitente, farmacia, text); return; }
  if (lower === 'fin')                   { await handleFin(remitente, farmacia); return; }
  if (lower === 'cola')                  { await handleCola(remitente, farmacia); return; }
  if (lower.startsWith('oferta '))       { await handleOferta(remitente, farmacia, text); return; }
  if (lower === 'oferta')                { await reply(remitente, 'Uso: oferta [descripción]\nEj: oferta Ibuprofeno 400mg x20 $2500 solo hoy'); return; }
  if (lower.startsWith('espera '))       { await handleAgregarEspera(remitente, farmacia, text); return; }
  if (lower === 'lista_espera' || lower === 'espera') { await handleListaEspera(remitente, farmacia); return; }
  if (lower.startsWith('avisar '))       { await handleAvisar(remitente, farmacia, text); return; }
  if (lower === 'ayuda' || lower === 'help' || lower === 'hola') { await handleAyuda(remitente, farmacia); return; }

  // Default: si no hay control activo, mostrar ayuda
  if (!control) await handleAyuda(remitente, farmacia);
}

function esComando(lower: string): boolean {
  return (
    lower.startsWith('tomar ') ||
    lower === 'fin' ||
    lower === 'cola' ||
    lower.startsWith('oferta') ||
    lower.startsWith('espera') ||
    lower === 'lista_espera' ||
    lower.startsWith('avisar ') ||
    lower === 'ayuda' ||
    lower === 'sí' ||
    lower === 'si' ||
    lower === 'no' ||
    lower.startsWith('editar ')
  );
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleTomar(remitente: string, farmacia: Farmacia, text: string) {
  const telefono = text.replace(/^tomar\s+/i, '').replace(/[^0-9]/g, '');
  if (!telefono) {
    await reply(remitente, 'Uso: tomar [número del cliente]\nEj: tomar 5491123456789');
    return;
  }

  const conv = await tomarControl(farmacia.id, telefono);
  if (!conv) {
    await reply(remitente, `No encontré conversación con ${telefono}. Puede que no haya hablado con tu farmacia aún.`);
    return;
  }

  controlesActivos.set(remitente, {
    farmaciaId: farmacia.id,
    telefonoCliente: telefono,
    conversacionId: conv.id,
  });

  await reply(
    remitente,
    `✅ Estás hablando con ${telefono}.\nTodo lo que escribas le llega directo.\nEscribí "fin" cuando termines.`,
  );
}

async function handleFin(remitente: string, farmacia: Farmacia) {
  controlesActivos.delete(remitente);
  const liberadas = await liberarConversacionesDeFarmacia(farmacia.id);
  if (liberadas.length === 0) {
    await reply(remitente, 'No tenías ninguna conversación activa.');
    return;
  }
  await reply(remitente, `✅ ${liberadas.length} conversación(es) devuelta(s) al bot.`);
}

async function handleCola(remitente: string, farmacia: Farmacia) {
  const cola = await getConversacionesEnEspera(farmacia.id);
  if (cola.length === 0) {
    await reply(remitente, '✅ No hay clientes en espera.');
    return;
  }
  const lineas = cola.map(
    (c, i) => `${i + 1}. ${c.cliente.telefono} — desde ${c.updatedAt.toISOString().slice(11, 16)} hs`,
  );
  await reply(remitente, `⏳ Clientes en espera:\n\n${lineas.join('\n')}`);
}

async function handleOferta(remitente: string, farmacia: Farmacia, text: string) {
  const descripcion = text.replace(/^oferta\s+/i, '').trim();
  if (!descripcion) {
    await reply(remitente, 'Uso: oferta [descripción]\nEj: oferta Ibuprofeno 400mg x20 $2500 solo hoy');
    return;
  }

  const cantidad = await getClientesCount(farmacia.id);
  if (cantidad === 0) {
    await reply(remitente, 'Todavía no hay clientes registrados en tu farmacia.');
    return;
  }

  await reply(remitente, '⏳ Generando mensaje con IA...');
  const mensajeGenerado = await generarMensajeOferta(farmacia, descripcion, null);
  ofertasPendientes.set(remitente, { farmaciaId: farmacia.id, descripcionOriginal: descripcion, mensajeActual: mensajeGenerado });
  await reply(remitente, buildPreview(mensajeGenerado, cantidad));
}

async function confirmarOferta(remitente: string, pendiente: OfertaPendiente) {
  ofertasPendientes.delete(remitente);
  await reply(remitente, '📤 Enviando...');
  const telefonos = await getClientesTelefonos(pendiente.farmaciaId);
  let ok = 0;
  for (const t of telefonos) {
    try { await sendFromPharmacy(pendiente.farmaciaId, t, pendiente.mensajeActual); ok++; }
    catch (err) { logger.error({ err, to: t }, 'Error enviando oferta'); }
  }
  await reply(remitente, `✅ Oferta enviada a ${ok}/${telefonos.length} clientes.`);
}

async function cancelarOferta(remitente: string) {
  ofertasPendientes.delete(remitente);
  await reply(remitente, '❌ Oferta cancelada.');
}

async function editarOferta(remitente: string, pendiente: OfertaPendiente, instrucciones: string) {
  if (!instrucciones) {
    await reply(remitente, 'Indicá cómo modificar el mensaje. Ej: editar más formal y sin emojis');
    return;
  }
  const farmacia = await prisma.farmacia.findUnique({ where: { id: pendiente.farmaciaId } });
  if (!farmacia) return;

  await reply(remitente, '⏳ Regenerando...');
  const nuevo = await generarMensajeOferta(farmacia, pendiente.descripcionOriginal, instrucciones);
  ofertasPendientes.set(remitente, { ...pendiente, mensajeActual: nuevo });
  const cantidad = await getClientesCount(pendiente.farmaciaId);
  await reply(remitente, buildPreview(nuevo, cantidad));
}

async function reenviarAlCliente(remitente: string, control: ControlActivo, texto: string) {
  try {
    await sendFromPharmacy(control.farmaciaId, control.telefonoCliente, texto);
    await prisma.mensaje.create({
      data: { conversacionId: control.conversacionId, role: 'farmaceutico', contenido: texto },
    });
    await cambiarEstadoConversacion(control.conversacionId, 'farmaceutico');
  } catch (err) {
    logger.error({ err }, 'Error reenviando al cliente');
    await reply(remitente, '❌ No pude enviar el mensaje al cliente. ¿La sesión de WhatsApp de tu farmacia está conectada?');
  }
}

// ─── Lista de espera ─────────────────────────────────────────────────────────

async function handleAgregarEspera(remitente: string, farmacia: Farmacia, text: string) {
  // "espera [teléfono] [producto]"
  const partes = text.replace(/^espera\s+/i, '').trim().split(/\s+/, 2);
  if (partes.length < 2) {
    await reply(remitente, 'Uso: espera [teléfono] [producto]\nEj: espera 5491123456789 Ibuprofeno 400mg');
    return;
  }
  const [telefonoRaw, ...productoParts] = text.replace(/^espera\s+/i, '').trim().split(/\s+/);
  const telefono = (telefonoRaw ?? '').replace(/[^0-9]/g, '');
  const producto = productoParts.join(' ');

  if (!telefono || !producto) {
    await reply(remitente, 'Uso: espera [teléfono] [producto]\nEj: espera 5491123456789 Ibuprofeno 400mg');
    return;
  }

  try {
    const resultado = await agregarAListaEspera(farmacia.id, telefono, producto);
    if (!resultado) {
      await reply(remitente, `ℹ️ ${telefono} ya estaba en lista de espera para ${producto}.`);
    } else {
      await reply(remitente, `✅ ${telefono} agregado a lista de espera para: ${producto}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al agregar a lista de espera';
    await reply(remitente, `❌ ${msg}`);
  }
}

async function handleListaEspera(remitente: string, farmacia: Farmacia) {
  const lista = await getListaEspera(farmacia.id);
  if (lista.length === 0) {
    await reply(remitente, '✅ No hay nadie en lista de espera.');
    return;
  }
  const lineas = lista.map(
    (e, i) => `${i + 1}. ${e.cliente.telefono} — ${e.producto} (${e.createdAt.toLocaleDateString('es-AR')})`,
  );
  await reply(remitente, `📋 Lista de espera:\n\n${lineas.join('\n')}\n\nUsá "avisar [producto]" para notificarlos.`);
}

async function handleAvisar(remitente: string, farmacia: Farmacia, text: string) {
  const producto = text.replace(/^avisar\s+/i, '').trim();
  if (!producto) {
    await reply(remitente, 'Uso: avisar [producto]\nEj: avisar Ibuprofeno 400mg');
    return;
  }

  const esperas = await getClientesEsperandoProducto(farmacia.id, producto);
  if (esperas.length === 0) {
    await reply(remitente, `No hay nadie esperando "${producto}".`);
    return;
  }

  await reply(remitente, `📤 Notificando a ${esperas.length} cliente(s)...`);

  const mensaje =
    `¡Buenas noticias! 🎉\n` +
    `Llegó *${producto}* a ${farmacia.nombre}.\n` +
    `Pasá a buscarlo o pedí delivery. ¡Te esperamos!`;

  let ok = 0;
  for (const e of esperas) {
    try {
      await sendFromPharmacy(farmacia.id, e.cliente.telefono, mensaje);
      ok++;
    } catch (err) {
      logger.error({ err, to: e.cliente.telefono }, 'Error notificando lista de espera');
    }
  }

  await marcarNotificados(esperas.map((e) => e.id));
  await reply(remitente, `✅ Notificados ${ok}/${esperas.length} clientes para "${producto}".`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPreview(mensaje: string, cantidad: number): string {
  return (
    `📣 Vista previa:\n\n${mensaje}\n\n` +
    `─────────────────\n` +
    `Se enviará a ${cantidad} cliente(s).\n\n` +
    `✅ "sí" → enviar\n` +
    `✏️ "editar [instrucciones]" → regenerar\n` +
    `❌ "no" → cancelar`
  );
}

async function handleAyuda(remitente: string, farmacia: Farmacia) {
  const control = controlesActivos.get(remitente);
  const estadoControl = control
    ? `\n📞 Ahora mismo estás hablando con ${control.telefonoCliente}. Escribí "fin" para terminar.\n`
    : '';

  await reply(
    remitente,
    `🤖 *${farmacia.nombre}* — comandos disponibles:\n` +
      `${estadoControl}\n` +
      `*Atención al cliente:*\n` +
      `tomar [número] — tomar control de una conv.\n` +
      `fin — devolver al bot\n` +
      `cola — clientes en espera\n\n` +
      `*Ofertas:*\n` +
      `oferta [descripción] — crear y enviar oferta\n\n` +
      `*Lista de espera (sin stock):*\n` +
      `espera [teléfono] [producto] — agregar cliente\n` +
      `lista_espera — ver lista\n` +
      `avisar [producto] — notificar que llegó\n\n` +
      `*Tip:* cuando tomás control, todo lo que escribas le llega al cliente.`,
  );
}

import type { Farmacia } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { sessionManager, type IncomingMessage } from './session-manager.js';
import {
  cambiarEstadoConversacion,
  getConversacionesEnEspera,
  liberarConversacionesDeFarmacia,
  tomarControl,
} from '../services/conversation.js';
import { generarMensajeOferta } from '../ai/openai.js';

const PHARMACY_PREFIX = 'pharmacy:';
function pharmacySessionId(farmaciaId: string): string {
  return `${PHARMACY_PREFIX}${farmaciaId}`;
}

async function sendFromPharmacy(farmaciaId: string, telefonoCliente: string, text: string) {
  await sessionManager.sendText(pharmacySessionId(farmaciaId), telefonoCliente, text);
}

async function getClientesCount(farmaciaId: string): Promise<number> {
  return prisma.cliente.count({ where: { farmaciaId } });
}

async function getClientesTelefonos(farmaciaId: string): Promise<string[]> {
  const clientes = await prisma.cliente.findMany({
    where: { farmaciaId },
    select: { telefono: true },
  });
  return clientes.map((c) => c.telefono);
}

/** Session ID fija de la sesión admin compartida. */
export const ADMIN_SESSION_ID = 'admin';

/** Estado efímero por farmacéutico: borrador de oferta en confirmación. */
interface OfertaPendiente {
  farmaciaId: string;
  descripcionOriginal: string;
  mensajeActual: string;
}

/** Conversación activa "tomada" por un farmacéutico: mapea farmacéutico → cliente al que está respondiendo. */
interface ControlActivo {
  farmaciaId: string;
  telefonoCliente: string;
  conversacionId: string;
}

const ofertasPendientes = new Map<string, OfertaPendiente>(); // key: whatsappNumber del farmacéutico
const controlesActivos = new Map<string, ControlActivo>();     // key: whatsappNumber del farmacéutico

export async function startAdminSession() {
  await sessionManager.startSession(ADMIN_SESSION_ID);
}

export function registerAdminHandler() {
  return sessionManager.onMessage(async (sessionId, msg) => {
    if (sessionId !== ADMIN_SESSION_ID) return;
    if (msg.isFromMe) return;
    await handleAdminMessage(msg);
  });
}

async function enviarAdmin(telefono: string, text: string) {
  try {
    await sessionManager.sendText(ADMIN_SESSION_ID, telefono, text);
  } catch (err) {
    logger.error({ err, telefono }, 'Error enviando mensaje desde sesión admin');
  }
}

/**
 * Notifica al farmacéutico (admin de la farmacia) cuando se detecta un pedido.
 * Se manda desde la sesión admin a todos los admins registrados para esa farmacia.
 */
export async function notificarPedido(farmacia: Farmacia, telefonoCliente: string, textoPedido: string) {
  const admins = await prisma.admin.findMany({ where: { farmaciaId: farmacia.id } });
  if (admins.length === 0) {
    logger.warn({ farmaciaId: farmacia.id }, 'Pedido detectado pero la farmacia no tiene admins cargados');
    return;
  }

  const mensaje =
    `⚠️ Pedido nuevo — ${farmacia.nombre}\n\n` +
    `👤 Cliente: ${telefonoCliente}\n` +
    `🛒 Mensaje: ${textoPedido}\n` +
    `📍 Delivery: ${farmacia.delivery ? 'Sí' : 'No'}\n\n` +
    `Respondé:\n` +
    `/tomar ${telefonoCliente} — para hablar con el cliente\n` +
    `/fin — cuando esté resuelto`;

  for (const a of admins) {
    await enviarAdmin(a.whatsappNumber, mensaje);
  }
}

async function admitirFarmaceutico(whatsappNumber: string) {
  const admin = await prisma.admin.findUnique({
    where: { whatsappNumber },
    include: { farmacia: true },
  });
  return admin;
}

async function handleAdminMessage(msg: IncomingMessage) {
  const remitente = msg.phoneNumber;

  // Super admin (vos) puede usar el mismo número pero su admin principal es Telegram.
  // Aquí solo contemplamos farmacéuticos registrados.
  const admin = await admitirFarmaceutico(remitente);
  if (!admin) {
    await enviarAdmin(remitente, 'No estás registrado como farmacéutico. Contactá al administrador del sistema.');
    return;
  }

  const farmacia = admin.farmacia;
  const text = msg.text.trim();
  const lower = text.toLowerCase();

  logger.info({ remitente, farmacia: farmacia.nombre, text }, 'Comando de farmacéutico');

  const pendiente = ofertasPendientes.get(remitente);
  if (pendiente) {
    if (lower === 'sí' || lower === 'si') return confirmarOferta(remitente, pendiente);
    if (lower === 'no') return cancelarOferta(remitente);
    if (lower.startsWith('editar ')) return editarOferta(remitente, pendiente, text.slice(7).trim());
  }

  // Si el farmacéutico ya tiene tomada una conversación y escribe un texto normal,
  // lo reenviamos al cliente desde la sesión de la farmacia.
  const control = controlesActivos.get(remitente);
  if (control && !text.startsWith('/') && !pendiente) {
    return reenviarAlCliente(remitente, control, text);
  }

  if (text.startsWith('/tomar')) return handleTomar(remitente, farmacia, text);
  if (text.startsWith('/fin')) return handleFin(remitente, farmacia);
  if (text.startsWith('/cola')) return handleCola(remitente, farmacia);
  if (text.startsWith('/oferta')) return handleOferta(remitente, farmacia, text);
  if (text === '/start' || text.startsWith('/ayuda') || text === '/help') return handleAyuda(remitente, farmacia);

  return handleAyuda(remitente, farmacia);
}

async function handleTomar(remitente: string, farmacia: Farmacia, text: string) {
  const [, telefonoRaw] = text.split(/\s+/, 2);
  if (!telefonoRaw) {
    await enviarAdmin(remitente, 'Uso: /tomar [número del cliente]');
    return;
  }
  const telefono = telefonoRaw.replace(/[^0-9]/g, '');

  const conv = await tomarControl(farmacia.id, telefono);
  if (!conv) {
    await enviarAdmin(remitente, `No encontré una conversación con ${telefono} en ${farmacia.nombre}.`);
    return;
  }

  controlesActivos.set(remitente, {
    farmaciaId: farmacia.id,
    telefonoCliente: telefono,
    conversacionId: conv.id,
  });

  await enviarAdmin(
    remitente,
    `✅ Tomaste control de la conversación con ${telefono} (${farmacia.nombre}).\n` +
      `Todo lo que escribas (sin /) se reenvía al cliente.\n` +
      `Usá /fin cuando termines.`,
  );
}

async function handleFin(remitente: string, farmacia: Farmacia) {
  controlesActivos.delete(remitente);
  const liberadas = await liberarConversacionesDeFarmacia(farmacia.id);
  if (liberadas.length === 0) {
    await enviarAdmin(remitente, 'No había conversaciones bajo tu control.');
    return;
  }
  await enviarAdmin(remitente, `✅ ${liberadas.length} conversación(es) devuelta(s) al bot.`);
}

async function handleCola(remitente: string, farmacia: Farmacia) {
  const cola = await getConversacionesEnEspera(farmacia.id);
  if (cola.length === 0) {
    await enviarAdmin(remitente, 'No hay clientes en espera.');
    return;
  }
  const lineas = cola.map((c, i) => `${i + 1}. ${c.cliente.telefono} — desde ${c.updatedAt.toISOString().slice(11, 16)}`);
  await enviarAdmin(remitente, `⏳ Clientes esperando:\n\n${lineas.join('\n')}`);
}

async function handleOferta(remitente: string, farmacia: Farmacia, text: string) {
  const descripcion = text.slice('/oferta'.length).trim();
  if (!descripcion) {
    await enviarAdmin(
      remitente,
      'Uso: /oferta [texto]\nEj: /oferta Ibuprofeno 400mg x20 comp $2500 solo hoy',
    );
    return;
  }

  const cantidad = await getClientesCount(farmacia.id);
  if (cantidad === 0) {
    await enviarAdmin(remitente, 'No hay clientes registrados aún en tu farmacia.');
    return;
  }

  const mensajeGenerado = await generarMensajeOferta(farmacia, descripcion, null);
  ofertasPendientes.set(remitente, {
    farmaciaId: farmacia.id,
    descripcionOriginal: descripcion,
    mensajeActual: mensajeGenerado,
  });

  await enviarAdmin(remitente, buildPreview(mensajeGenerado, cantidad));
}

async function confirmarOferta(remitente: string, pendiente: OfertaPendiente) {
  ofertasPendientes.delete(remitente);
  const telefonos = await getClientesTelefonos(pendiente.farmaciaId);
  let enviados = 0;
  for (const t of telefonos) {
    try {
      await sendFromPharmacy(pendiente.farmaciaId, t, pendiente.mensajeActual);
      enviados++;
    } catch (err) {
      logger.error({ err, to: t }, 'Error enviando oferta');
    }
  }
  await enviarAdmin(remitente, `✅ Oferta enviada a ${enviados}/${telefonos.length} cliente(s).`);
}

async function cancelarOferta(remitente: string) {
  ofertasPendientes.delete(remitente);
  await enviarAdmin(remitente, '❌ Oferta cancelada.');
}

async function editarOferta(remitente: string, pendiente: OfertaPendiente, instrucciones: string) {
  if (!instrucciones) {
    await enviarAdmin(remitente, "Indicá cómo modificar. Ej: 'editar más formal y sin emojis'");
    return;
  }
  const farmacia = await prisma.farmacia.findUnique({ where: { id: pendiente.farmaciaId } });
  if (!farmacia) return;

  const nuevo = await generarMensajeOferta(farmacia, pendiente.descripcionOriginal, instrucciones);
  ofertasPendientes.set(remitente, { ...pendiente, mensajeActual: nuevo });

  const cantidad = await getClientesCount(pendiente.farmaciaId);
  await enviarAdmin(remitente, buildPreview(nuevo, cantidad));
}

async function reenviarAlCliente(remitente: string, control: ControlActivo, texto: string) {
  try {
    await sendFromPharmacy(control.farmaciaId, control.telefonoCliente, texto);
    await prisma.mensaje.create({
      data: { conversacionId: control.conversacionId, role: 'farmaceutico', contenido: texto },
    });
    await cambiarEstadoConversacion(control.conversacionId, 'farmaceutico');
  } catch (err) {
    logger.error({ err }, 'Error reenviando mensaje del farmacéutico al cliente');
    await enviarAdmin(remitente, '❌ No pude enviarle el mensaje al cliente.');
  }
}

function buildPreview(mensaje: string, cantidad: number): string {
  return (
    `📣 Vista previa de la oferta:\n\n${mensaje}\n\n` +
    `Se enviará a ${cantidad} cliente(s).\n` +
    `✅ 'sí' para enviar\n` +
    `✏️ 'editar [instrucciones]' para modificar\n` +
    `❌ 'no' para cancelar`
  );
}

async function handleAyuda(remitente: string, farmacia: Farmacia) {
  await enviarAdmin(
    remitente,
    `🤖 Bot de ${farmacia.nombre}\n\n` +
      'Comandos:\n' +
      '• /tomar [número] — tomar control de un cliente\n' +
      '• /fin — devolver el control al bot\n' +
      '• /cola — ver clientes en espera\n' +
      '• /oferta [texto] — enviar oferta a todos tus clientes\n' +
      '• /ayuda — este mensaje\n\n' +
      '👉 Cuando tomás control, cualquier texto sin / se le manda al cliente.',
  );
}

// Utilidad para que super-admin pueda mandar mensajes arbitrarios desde la sesión admin.
export async function superAdminSend(telefono: string, text: string) {
  await sessionManager.sendText(ADMIN_SESSION_ID, telefono, text);
}

export function isSuperAdminWhatsApp(num: string): boolean {
  return num.replace(/[^0-9]/g, '') === config.ADMIN_WHATSAPP_NUMBER.replace(/[^0-9]/g, '');
}

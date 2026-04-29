import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { handleIncomingMessage } from '../services/conversation.js';
import { sessionManager, type IncomingMessage } from './session-manager.js';
import { notificarPedido } from './admin-bot.js';

export const pharmacySessionPrefix = 'pharmacy:';

export function pharmacySessionId(farmaciaId: string): string {
  return `${pharmacySessionPrefix}${farmaciaId}`;
}

function parsePharmacySessionId(sessionId: string): string | null {
  if (!sessionId.startsWith(pharmacySessionPrefix)) return null;
  return sessionId.slice(pharmacySessionPrefix.length);
}

export async function startAllPharmacySessions() {
  const farmacias = await prisma.farmacia.findMany({ where: { activa: true } });
  logger.info({ total: farmacias.length }, 'Iniciando sesiones de farmacias');
  for (const f of farmacias) {
    await sessionManager.startSession(pharmacySessionId(f.id));
  }
}

export async function startPharmacySession(farmaciaId: string) {
  return sessionManager.startSession(pharmacySessionId(farmaciaId));
}

async function handlePharmacyMessage(sessionId: string, msg: IncomingMessage) {
  const farmaciaId = parsePharmacySessionId(sessionId);
  if (!farmaciaId || msg.isFromMe) return;

  const farmacia = await prisma.farmacia.findUnique({ where: { id: farmaciaId } });
  if (!farmacia?.activa) {
    logger.warn({ farmaciaId }, 'Mensaje a farmacia inexistente/inactiva');
    return;
  }

  const result = await handleIncomingMessage(farmacia, msg.phoneNumber, msg.text);

  if (result.respuesta) {
    try {
      await sessionManager.sendToJid(sessionId, msg.from, result.respuesta);
    } catch (err) {
      logger.error({ err, farmaciaId, to: msg.phoneNumber }, 'Error enviando respuesta WhatsApp al cliente');
    }
  }

  if (result.pedidoConfirmado) {
    const { productos, modalidad, direccion } = result.pedidoConfirmado;
    const resumen = `${productos}\nEntrega: ${modalidad === 'delivery' ? `Delivery a ${direccion ?? '—'}` : 'Retiro en local'}`;
    await notificarPedido(farmacia, msg.phoneNumber, resumen).catch((err) =>
      logger.error({ err }, 'Error notificando pedido al farmacéutico'),
    );
  }
}

export function registerPharmacyHandler() {
  return sessionManager.onMessage(async (sessionId, msg) => {
    if (!sessionId.startsWith(pharmacySessionPrefix)) return;
    await handlePharmacyMessage(sessionId, msg);
  });
}

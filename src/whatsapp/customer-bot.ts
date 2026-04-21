import type { Farmacia } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { handleIncomingMessage } from '../services/conversation.js';
import { sessionManager, type IncomingMessage } from './session-manager.js';
import { notificarPedido } from './admin-bot.js';

/** Prefijo de sessionId para sesiones de farmacias (clientes). */
export const pharmacySessionPrefix = 'pharmacy:';

export function pharmacySessionId(farmaciaId: string): string {
  return `${pharmacySessionPrefix}${farmaciaId}`;
}

export function parsePharmacySessionId(sessionId: string): string | null {
  if (!sessionId.startsWith(pharmacySessionPrefix)) return null;
  return sessionId.slice(pharmacySessionPrefix.length);
}

/**
 * Arranca sesiones Baileys para todas las farmacias activas.
 * Cada farmacia tiene su propia sesión identificada por su ID.
 */
export async function startAllPharmacySessions() {
  const farmacias = await prisma.farmacia.findMany({ where: { activa: true } });
  logger.info({ total: farmacias.length }, 'Iniciando sesiones de farmacias');
  for (const f of farmacias) {
    await sessionManager.startSession(pharmacySessionId(f.id));
  }
}

/** Inicia una sesión para una farmacia puntual (usado al dar de alta una nueva). */
export async function startPharmacySession(farmaciaId: string) {
  return sessionManager.startSession(pharmacySessionId(farmaciaId));
}

/**
 * Handler: reacciona a mensajes entrantes en sesiones de farmacia.
 */
export async function handlePharmacyMessage(sessionId: string, msg: IncomingMessage) {
  const farmaciaId = parsePharmacySessionId(sessionId);
  if (!farmaciaId) return;
  if (msg.isFromMe) return;

  const farmacia = await prisma.farmacia.findUnique({ where: { id: farmaciaId } });
  if (!farmacia || !farmacia.activa) {
    logger.warn({ farmaciaId }, 'Mensaje a farmacia inexistente/inactiva');
    return;
  }

  const result = await handleIncomingMessage(farmacia, msg.phoneNumber, msg.text);

  if (result.respuesta) {
    try {
      await sessionManager.sendText(sessionId, msg.phoneNumber, result.respuesta);
    } catch (err) {
      logger.error({ err, farmaciaId, to: msg.phoneNumber }, 'Error enviando respuesta WhatsApp');
    }
  }

  if (result.pedidoDetectado) {
    await notificarPedido(farmacia, msg.phoneNumber, msg.text).catch((err) =>
      logger.error({ err }, 'Error notificando pedido al farmacéutico'),
    );
  }
}

/** Registra el handler con el session manager. Llamar una sola vez al boot. */
export function registerPharmacyHandler() {
  return sessionManager.onMessage(async (sessionId, msg) => {
    if (!sessionId.startsWith(pharmacySessionPrefix)) return;
    await handlePharmacyMessage(sessionId, msg);
  });
}

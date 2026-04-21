import { prisma } from '../db.js';
import { logger } from '../logger.js';

/**
 * Cierra conversaciones en estado "bot" cuya última interacción excede el
 * `tiempoSesionMinutos` de la farmacia. Se corre periódicamente.
 */
export async function cerrarSesionesInactivas() {
  const farmacias = await prisma.farmacia.findMany({ where: { activa: true } });

  let total = 0;
  for (const f of farmacias) {
    const limite = new Date(Date.now() - f.tiempoSesionMinutos * 60_000);
    const { count } = await prisma.conversacion.updateMany({
      where: { farmaciaId: f.id, estado: 'bot', updatedAt: { lt: limite } },
      data: { estado: 'cerrada' },
    });
    total += count;
  }

  if (total > 0) logger.info({ total }, 'Sesiones cerradas por inactividad');
  return total;
}

export function startCleanupInterval(intervalMs = 60_000) {
  const timer = setInterval(() => {
    cerrarSesionesInactivas().catch((err) => logger.error({ err }, 'cleanup failed'));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

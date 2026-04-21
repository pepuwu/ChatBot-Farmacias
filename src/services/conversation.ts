import type { Conversacion, Farmacia, Mensaje } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { generarRespuesta } from '../ai/openai.js';

const PALABRAS_PEDIDO = [
  'pedido', 'delivery', 'enviame', 'enviá', 'envíame', 'enviar',
  'quiero que me envíen', 'quiero que me envien', 'reservar', 'reserva',
  'mandar', 'mandame', 'mandá', 'llevar', 'necesito que me traigan',
  'a domicilio', 'me lo mandas', 'me lo mandás',
];

export interface HandleResult {
  respuesta: string | null;
  pedidoDetectado: boolean;
  esClienteNuevo: boolean;
  conversacionId: string;
  clienteTelefono: string;
}

async function obtenerOCrearCliente(farmaciaId: string, telefono: string) {
  let esNuevo = false;
  const existente = await prisma.cliente.findUnique({
    where: { farmaciaId_telefono: { farmaciaId, telefono } },
  });
  if (!existente) {
    esNuevo = true;
    const creado = await prisma.cliente.create({
      data: { farmaciaId, telefono, nombre: telefono, ultimaInteraccion: new Date() },
    });
    return { cliente: creado, esNuevo };
  }
  await prisma.cliente.update({
    where: { id: existente.id },
    data: { ultimaInteraccion: new Date() },
  });
  return { cliente: existente, esNuevo };
}

async function obtenerConversacionActiva(farmacia: Farmacia, clienteId: string): Promise<Conversacion> {
  const ultima = await prisma.conversacion.findFirst({
    where: { clienteId, farmaciaId: farmacia.id },
    orderBy: { updatedAt: 'desc' },
  });

  const timeoutMs = farmacia.tiempoSesionMinutos * 60_000;
  const expirada = ultima && Date.now() - ultima.updatedAt.getTime() > timeoutMs;

  if (!ultima || expirada || ultima.estado === 'cerrada') {
    return prisma.conversacion.create({
      data: { clienteId, farmaciaId: farmacia.id, estado: 'bot' },
    });
  }

  return ultima;
}

async function obtenerHistorial(conversacionId: string): Promise<Mensaje[]> {
  const msgs = await prisma.mensaje.findMany({
    where: { conversacionId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return msgs.reverse();
}

function esPedido(textoCliente: string, respuestaAI: string): boolean {
  const combinado = `${textoCliente} ${respuestaAI}`.toLowerCase();
  return PALABRAS_PEDIDO.some((p) => combinado.includes(p));
}

export async function handleIncomingMessage(
  farmacia: Farmacia,
  telefono: string,
  texto: string,
): Promise<HandleResult> {
  logger.info({ farmacia: farmacia.nombre, telefono, texto }, 'Mensaje entrante');

  const { cliente, esNuevo } = await obtenerOCrearCliente(farmacia.id, telefono);
  const conversacion = await obtenerConversacionActiva(farmacia, cliente.id);

  // Farmacéutico al mando → bot silenciado, solo guardar el mensaje
  if (conversacion.estado === 'farmaceutico') {
    await prisma.mensaje.create({
      data: { conversacionId: conversacion.id, role: 'user', contenido: texto },
    });
    await prisma.conversacion.update({
      where: { id: conversacion.id },
      data: { updatedAt: new Date() },
    });
    return {
      respuesta: null,
      pedidoDetectado: false,
      esClienteNuevo: false,
      conversacionId: conversacion.id,
      clienteTelefono: telefono,
    };
  }

  await prisma.mensaje.create({
    data: { conversacionId: conversacion.id, role: 'user', contenido: texto },
  });

  const historial = await obtenerHistorial(conversacion.id);
  const respuesta = await generarRespuesta(farmacia, historial, texto, esNuevo);

  await prisma.mensaje.create({
    data: { conversacionId: conversacion.id, role: 'assistant', contenido: respuesta },
  });
  await prisma.conversacion.update({
    where: { id: conversacion.id },
    data: { updatedAt: new Date() },
  });

  return {
    respuesta,
    pedidoDetectado: esPedido(texto, respuesta),
    esClienteNuevo: esNuevo,
    conversacionId: conversacion.id,
    clienteTelefono: telefono,
  };
}

export async function cambiarEstadoConversacion(conversacionId: string, nuevoEstado: string) {
  return prisma.conversacion.update({
    where: { id: conversacionId },
    data: { estado: nuevoEstado, updatedAt: new Date() },
  });
}

export async function tomarControl(farmaciaId: string, telefonoCliente: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { farmaciaId_telefono: { farmaciaId, telefono: telefonoCliente } },
  });
  if (!cliente) return null;

  const conv = await prisma.conversacion.findFirst({
    where: { clienteId: cliente.id, farmaciaId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!conv) return null;

  return prisma.conversacion.update({
    where: { id: conv.id },
    data: { estado: 'farmaceutico', updatedAt: new Date() },
  });
}

export async function liberarConversacionesDeFarmacia(farmaciaId: string) {
  const convs = await prisma.conversacion.findMany({
    where: { farmaciaId, estado: 'farmaceutico' },
    include: { cliente: true },
  });
  await prisma.conversacion.updateMany({
    where: { farmaciaId, estado: 'farmaceutico' },
    data: { estado: 'bot', updatedAt: new Date() },
  });
  return convs;
}

export async function getConversacionesEnEspera(farmaciaId: string) {
  return prisma.conversacion.findMany({
    where: { farmaciaId, estado: 'espera' },
    include: { cliente: true },
    orderBy: { updatedAt: 'asc' },
  });
}

// ─── Lista de espera ──────────────────────────────────────────────────────────

export async function agregarAListaEspera(farmaciaId: string, telefono: string, producto: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { farmaciaId_telefono: { farmaciaId, telefono } },
  });
  if (!cliente) throw new Error(`Cliente ${telefono} no encontrado en farmacia ${farmaciaId}`);

  // No duplicar si ya está esperando el mismo producto
  const yaEsta = await prisma.listaEspera.findFirst({
    where: { farmaciaId, clienteId: cliente.id, producto: { equals: producto, mode: 'insensitive' }, notificado: false },
  });
  if (yaEsta) return null;

  return prisma.listaEspera.create({
    data: { farmaciaId, clienteId: cliente.id, producto },
  });
}

export async function getListaEspera(farmaciaId: string) {
  return prisma.listaEspera.findMany({
    where: { farmaciaId, notificado: false },
    include: { cliente: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getClientesEsperandoProducto(farmaciaId: string, producto: string) {
  return prisma.listaEspera.findMany({
    where: {
      farmaciaId,
      notificado: false,
      producto: { contains: producto, mode: 'insensitive' },
    },
    include: { cliente: true },
  });
}

export async function marcarNotificados(ids: string[]) {
  return prisma.listaEspera.updateMany({
    where: { id: { in: ids } },
    data: { notificado: true },
  });
}

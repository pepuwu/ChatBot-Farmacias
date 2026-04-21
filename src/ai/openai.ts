import OpenAI from 'openai';
import type { Farmacia, Mensaje } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

type Horarios = { semana?: string; sabado?: string; domingo?: string };

function buildSystemPrompt(farmacia: Farmacia): string {
  if (farmacia.promptSistema && farmacia.promptSistema.trim().length > 0) {
    return farmacia.promptSistema;
  }

  const h = (farmacia.horarios ?? {}) as Horarios;
  const obrasSociales = farmacia.obrasSociales.join(', ') || 'Consultar';
  const servicios = farmacia.servicios.join(', ') || '—';

  return `Sos el asistente virtual de ${farmacia.nombre}, una farmacia ubicada en ${farmacia.direccion || '[sin dirección cargada]'}.

HORARIOS:
- Lunes a Viernes: ${h.semana ?? '—'}
- Sábado: ${h.sabado ?? '—'}
- Domingo: ${h.domingo ?? '—'}

DELIVERY: ${farmacia.delivery ? `Sí, zona: ${farmacia.zonaDelivery || '—'}` : 'No disponible'}

OBRAS SOCIALES ACEPTADAS: ${obrasSociales}

SERVICIOS: ${servicios}

REGLAS CRÍTICAS:
1. Respondé siempre en el idioma que usa el cliente.
2. NUNCA diagnosticás enfermedades ni recomendás tratamientos complejos. Si te preguntan algo médico complejo, respondé: "${farmacia.mensajeDerivacion}"
3. Sé amable, breve y directo. Usá lenguaje coloquial argentino.
4. No hagas listas largas — respondé lo que el cliente necesita.

MENSAJE DE BIENVENIDA (solo para primer mensaje): ${farmacia.mensajeBienvenida || `¡Hola! Bienvenido a ${farmacia.nombre} 👋 ¿En qué te puedo ayudar?`}`;
}

export async function generarRespuesta(
  farmacia: Farmacia,
  historial: Mensaje[],
  mensajeActual: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(farmacia);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of historial) {
    if (msg.role === 'user') messages.push({ role: 'user', content: msg.contenido });
    else if (msg.role === 'assistant') messages.push({ role: 'assistant', content: msg.contenido });
  }

  messages.push({ role: 'user', content: mensajeActual });

  logger.info({ farmacia: farmacia.nombre, msgs: messages.length }, 'OpenAI: enviando');

  try {
    const response = await client.chat.completions.create(
      { model: config.OPENAI_MODEL, messages },
      { timeout: 15_000 },
    );
    const texto = response.choices[0]?.message?.content?.trim() ?? '';
    logger.info({ chars: texto.length }, 'OpenAI: respuesta');
    return texto || 'Lo siento, no pude generar una respuesta. Probá de nuevo.';
  } catch (err) {
    logger.error({ err }, 'OpenAI: error generando respuesta');
    return 'Lo siento, tuve un problema al procesar tu mensaje. Por favor intentá de nuevo.';
  }
}

export async function generarMensajeLibre(prompt: string): Promise<string> {
  const response = await client.chat.completions.create(
    { model: config.OPENAI_MODEL, messages: [{ role: 'user', content: prompt }] },
    { timeout: 15_000 },
  );
  return response.choices[0]?.message?.content?.trim() ?? '';
}

export async function generarMensajeOferta(
  farmacia: Farmacia,
  descripcion: string,
  instrucciones: string | null,
): Promise<string> {
  const prompt = !instrucciones
    ? `Sos el asistente de una farmacia argentina llamada ${farmacia.nombre}. Generá un mensaje corto y atractivo para WhatsApp anunciando esta oferta: ${descripcion}. Máximo 3 líneas, incluí emojis, tono amigable y argentino. Solo devolvé el mensaje, sin explicaciones.`
    : `Sos el asistente de una farmacia argentina llamada ${farmacia.nombre}. Tenés este mensaje de oferta para WhatsApp: ${descripcion}. Modificalo siguiendo estas instrucciones: ${instrucciones}. Máximo 3 líneas. Solo devolvé el mensaje modificado, sin explicaciones.`;

  try {
    return await generarMensajeLibre(prompt);
  } catch (err) {
    logger.error({ err }, 'Error generando mensaje de oferta, uso texto original');
    return descripcion;
  }
}

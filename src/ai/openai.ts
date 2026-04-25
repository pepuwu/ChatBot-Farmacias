import OpenAI from 'openai';
import type { Farmacia, Mensaje } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

type Horarios = { semana?: string; sabado?: string; domingo?: string };

function buildSystemPrompt(farmacia: Farmacia, esPrimerMensaje: boolean): string {
  if (farmacia.promptSistema?.trim()) return farmacia.promptSistema;

  const h = (farmacia.horarios ?? {}) as Horarios;
  const obrasSociales = farmacia.obrasSociales.length > 0
    ? `Aceptamos: ${farmacia.obrasSociales.join(', ')}.`
    : 'No tenemos información de obras sociales cargada. Decile al cliente que consulte directamente en la farmacia.';
  const servicios = farmacia.servicios.join(', ') || '—';
  const bienvenida = farmacia.mensajeBienvenida || `¡Hola! Bienvenido a ${farmacia.nombre} 👋`;
  const telefono = farmacia.whatsappNumber ? `+${farmacia.whatsappNumber}` : null;

  const bloqueMenu = esPrimerMensaje
    ? `
PRIMER MENSAJE — respondé con el saludo de bienvenida y este menú:
"${bienvenida}

¿En qué te puedo ayudar?
1️⃣ Horarios y ubicación
2️⃣ Consulta de medicamentos
3️⃣ Delivery
4️⃣ Obras sociales aceptadas
5️⃣ Hablar con el farmacéutico

Escribime lo que necesitás 🙂"`
    : '';

  return `Sos el asistente virtual de ${farmacia.nombre}, farmacia ubicada en ${farmacia.direccion || '[sin dirección cargada]'}.

HORARIOS:
- Lunes a Viernes: ${h.semana ?? '—'}
- Sábado: ${h.sabado ?? '—'}
- Domingo: ${h.domingo ?? '—'}

DELIVERY: ${farmacia.delivery ? `Sí, zona: ${farmacia.zonaDelivery || '—'}` : 'No disponible'}

OBRAS SOCIALES ACEPTADAS: ${obrasSociales}

SERVICIOS: ${servicios}
${telefono ? `\nTELÉFONO DE CONTACTO / WHATSAPP DE LA FARMACIA: ${telefono}` : ''}
REGLAS CRÍTICAS:
1. Respondé siempre en el idioma que usa el cliente.
2. CONSULTAS MÉDICAS Y OTC:
   - Para síntomas simples sin riesgo (dolor de cabeza, fiebre leve, resfriado, dolor muscular, acidez, diarrea leve): sugerí directamente medicamentos de venta libre como ibuprofeno, paracetamol, aspirina, antiácidos o loperamida. Aclará siempre: "es de venta libre, pero si los síntomas persisten consultá a un médico".
   - Usá este mensaje solo cuando el medicamento requiere receta, hay patología crónica (diabetes, hipertensión, embarazo) o riesgo de interacciones: "${farmacia.mensajeDerivacion}"
3. Sé amable, breve y directo. Usá lenguaje coloquial argentino.
4. STOCK Y LISTA DE ESPERA: Si ya confirmaste que un producto está en stock, NUNCA ofrezcas lista de espera. La lista de espera solo se menciona si el producto explícitamente no está disponible.
5. No hagas listas largas — respondé lo que el cliente necesita.
6. OBRAS SOCIALES: Usá exclusivamente la información cargada arriba. Nunca improvises ni inventes coberturas. Si no hay info cargada, decíselo al cliente directamente.
${telefono ? `7. TELÉFONO: Si el cliente pide el número de contacto, usá siempre exactamente: ${telefono}. Nunca uses placeholders como "[inserta número]".\n` : '7. TELÉFONO: No hay número de contacto cargado. No menciones teléfono ni uses placeholders.\n'}8. CIERRE EN VENTA: Cuando el cliente mostró intención de compra, cerrá siempre con una opción concreta: "¿Lo separamos para que pases a buscarlo?"${farmacia.delivery ? ' o "¿Te lo enviamos por delivery?"' : ''}. Usá "¿necesitás algo más?" solo cuando el cliente claramente no tiene intención de compra en esa consulta.
${bloqueMenu}`;
}

export async function generarRespuesta(
  farmacia: Farmacia,
  historial: Mensaje[],
  mensajeActual: string,
  esPrimerMensaje = false,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(farmacia, esPrimerMensaje);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of historial) {
    if (msg.role === 'user') messages.push({ role: 'user', content: msg.contenido });
    else if (msg.role === 'assistant') messages.push({ role: 'assistant', content: msg.contenido });
  }

  messages.push({ role: 'user', content: mensajeActual });

  logger.info({ farmacia: farmacia.nombre, msgs: messages.length, primerMensaje: esPrimerMensaje }, 'OpenAI: enviando');

  try {
    const response = await client.chat.completions.create(
      { model: config.OPENAI_MODEL, messages },
      { timeout: 15_000 },
    );
    const texto = response.choices[0]?.message?.content?.trim() ?? '';
    logger.info({ chars: texto.length }, 'OpenAI: respuesta recibida');
    return texto || 'Lo siento, no pude generar una respuesta. Probá de nuevo.';
  } catch (err) {
    logger.error({ err }, 'OpenAI: error');
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
    : `Sos el asistente de una farmacia argentina llamada ${farmacia.nombre}. Tenés este mensaje de oferta para WhatsApp:\n\n${descripcion}\n\nModificalo siguiendo estas instrucciones: ${instrucciones}. Máximo 3 líneas. Solo devolvé el mensaje modificado, sin explicaciones.`;

  try {
    return await generarMensajeLibre(prompt);
  } catch (err) {
    logger.error({ err }, 'Error generando mensaje de oferta, uso texto original');
    return descripcion;
  }
}

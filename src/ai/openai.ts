import OpenAI from 'openai';
import type { Farmacia, Mensaje } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

type Horarios = { semana?: string; sabado?: string; domingo?: string };

function buildSystemPrompt(farmacia: Farmacia, esPrimerMensaje: boolean): string {
  if (farmacia.promptSistema?.trim()) return farmacia.promptSistema;

  const h = (farmacia.horarios ?? {}) as Horarios;
  const obrasSocialesList = farmacia.obrasSociales ?? [];
  const obrasSociales = obrasSocialesList.length > 0
    ? obrasSocialesList.join(', ')
    : 'NO HAY INFORMACIÓN CARGADA — decile al cliente que no tenés esa info y que consulte directamente con el farmacéutico. NO inventes obras sociales.';
  const servicios = farmacia.servicios.join(', ') || '—';
  const bienvenida = farmacia.mensajeBienvenida || `¡Hola! Bienvenido a ${farmacia.nombre} 👋`;
  const telefono = `+${farmacia.whatsappNumber}`;

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

TELÉFONO DE CONTACTO / WHATSAPP DE LA FARMACIA: ${telefono}

REGLAS CRÍTICAS:
1. Respondé siempre en el idioma que usa el cliente.
2. NUNCA diagnosticás enfermedades ni recomendás tratamientos complejos. Si te preguntan algo médico complejo, respondé: "${farmacia.mensajeDerivacion}"
3. Sé amable, breve y directo. Usá lenguaje coloquial argentino.
4. Priorizá concretar la venta y tomar el pedido aunque el stock no esté confirmado todavía. No bloquees la intención de compra por falta de confirmación de stock y no ofrezcas lista de espera por defecto. Solo mencioná falta de stock o lista de espera si la falta de stock ya fue confirmada explícitamente. Si surge un problema real de stock, indicá que el farmacéutico va a continuar la atención.
5. No hagas listas largas — respondé lo que el cliente necesita.
6. Cuando hables de obras sociales, usá únicamente esta información cargada: ${obrasSociales}. Si no hay información cargada, decí explícitamente que no tenés esa info y que consulte con el farmacéutico. Nunca inventes obras sociales.
7. Si tenés que dar el número de contacto de la farmacia, usá siempre exactamente este formato: ${telefono}. Nunca uses placeholders como "[inserta número]".
8. Para consultas OTC simples o síntomas menores como dolor de cabeza, fiebre leve, resfriado o dolor muscular, podés sugerir opciones comunes de venta libre como paracetamol o ibuprofeno, aclarando explícitamente que son de venta libre y manteniendo la respuesta breve y prudente. Solo derivá al farmacéutico cuando se trate de medicamentos con receta, patologías crónicas, embarazo, interacciones, alergias relevantes o situaciones médicas complejas.
9. Si el cliente muestra intención de compra o confirma que quiere llevar un producto, cerrá la conversación de venta con una pregunta concreta como "¿Lo separamos para que pases?" o "¿Te lo enviamos por delivery?". No cierres con el genérico "¿necesitás algo más?" en esos casos.
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

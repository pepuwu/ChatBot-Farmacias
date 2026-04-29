import OpenAI from 'openai';
import type { Farmacia, Mensaje } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface PedidoConfirmado {
  productos: string;
  modalidad: 'delivery' | 'retiro';
  direccion?: string;
}

export interface RespuestaIA {
  texto: string;
  pedido?: PedidoConfirmado;
}

const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

type Horarios = { semana?: string; sabado?: string; domingo?: string };

// ─── Rate limiter por farmacia ────────────────────────────────────────────────
// Ventana deslizante de 1 minuto. En memoria: se resetea en reinicios, lo cual
// es aceptable — el límite es para evitar explosión de costos, no auditoría.

interface RateWindow {
  count: number;
  resetAt: number;
}
const rateWindows = new Map<string, RateWindow>();

function consumeRateLimit(farmaciaId: string): boolean {
  const now = Date.now();
  const win = rateWindows.get(farmaciaId);

  if (!win || now > win.resetAt) {
    rateWindows.set(farmaciaId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (win.count >= config.OPENAI_MAX_RPM_PER_FARMACIA) return false;
  win.count++;
  return true;
}

// ─── Tool: confirmar pedido ───────────────────────────────────────────────────

const CONFIRMAR_PEDIDO_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'confirmar_pedido',
    description:
      'Llamar ÚNICAMENTE cuando el cliente confirmó todos los productos Y la modalidad (delivery o retiro) Y la dirección si eligió delivery. No llamar si falta cualquiera de esos datos.',
    parameters: {
      type: 'object',
      properties: {
        productos: {
          type: 'string',
          description: 'Lista de productos pedidos, ej: "Ibuprofeno 400mg Actrón x1, Preservativos texturados x1"',
        },
        modalidad: { type: 'string', enum: ['delivery', 'retiro'] },
        direccion: {
          type: 'string',
          description: 'Dirección de entrega. Solo incluir si modalidad es delivery.',
        },
        mensaje_confirmacion: {
          type: 'string',
          description: 'Mensaje para el cliente confirmando el pedido. Avisarle que el farmacéutico lo contacta en breve.',
        },
      },
      required: ['productos', 'modalidad', 'mensaje_confirmacion'],
    },
  },
};

// ─── Llamada con retry en 429 ─────────────────────────────────────────────────

async function callWithRetry(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
): Promise<RespuestaIA> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create(
        { model: config.OPENAI_MODEL, messages, ...(tools ? { tools, tool_choice: 'auto' } : {}) },
        { timeout: 15_000 },
      );
      const choice = response.choices[0];

      if (choice?.finish_reason === 'tool_calls') {
        const toolCall = choice.message.tool_calls?.[0];
        if (toolCall?.function.name === 'confirmar_pedido') {
          const args = JSON.parse(toolCall.function.arguments) as {
            productos: string; modalidad: 'delivery' | 'retiro'; direccion?: string; mensaje_confirmacion: string;
          };
          return {
            texto: args.mensaje_confirmacion,
            pedido: { productos: args.productos, modalidad: args.modalidad, direccion: args.direccion },
          };
        }
      }

      return { texto: choice?.message?.content?.trim() ?? '' };
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1_000;
        logger.warn({ attempt, delay }, 'OpenAI 429 — reintentando');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return { texto: '' };
}

// ─── Prompt del sistema ───────────────────────────────────────────────────────

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
${telefono ? `7. TELÉFONO: Si el cliente pide el número de contacto, usá siempre exactamente: ${telefono}. Nunca uses placeholders como "[inserta número]".\n` : '7. TELÉFONO: No hay número de contacto cargado. No menciones teléfono ni uses placeholders.\n'}
FLUJO DE PEDIDO — seguí este orden exacto, sin repetir preguntas ya respondidas:
Paso 1: El cliente menciona productos → confirmá que los tenés en stock.
Paso 2: Si aún no preguntaste: "¿Lo buscás vos o te lo enviamos por delivery?" (preguntalo UNA sola vez).
Paso 3: Si eligió delivery y no tenés la dirección todavía: pedí la dirección.
Paso 4: Cuando tenés productos + modalidad + dirección (si delivery) → llamá a confirmar_pedido. NO hagas más preguntas.
IMPORTANTE: Si el cliente ya respondió la modalidad, NO la vuelvas a preguntar. Si dijo "delivery", pedí la dirección directamente.
${bloqueMenu}`;
}

// ─── Transcripción de audio ───────────────────────────────────────────────────

export async function transcribirAudio(buffer: Buffer, mimeType: string): Promise<string> {
  // Whisper acepta ogg/opus (formato de WhatsApp) directamente
  const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'ogg';
  const { toFile } = await import('openai');
  const file = await toFile(buffer, `audio.${ext}`, { type: mimeType });
  const response = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'es',
  });
  return response.text.trim();
}

// ─── API pública ──────────────────────────────────────────────────────────────

export async function generarRespuesta(
  farmacia: Farmacia,
  historial: Mensaje[],
  mensajeActual: string,
  esPrimerMensaje = false,
): Promise<RespuestaIA> {
  if (!consumeRateLimit(farmacia.id)) {
    logger.warn({ farmaciaId: farmacia.id }, 'OpenAI: rate limit alcanzado');
    return { texto: 'Estamos recibiendo muchas consultas en este momento. Por favor intentá de nuevo en unos segundos 🙏' };
  }

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
    const result = await callWithRetry(messages, [CONFIRMAR_PEDIDO_TOOL]);
    logger.info({ chars: result.texto.length, pedido: !!result.pedido }, 'OpenAI: respuesta recibida');
    return result.texto ? result : { ...result, texto: 'Lo siento, no pude generar una respuesta. Probá de nuevo.' };
  } catch (err) {
    logger.error({ err }, 'OpenAI: error');
    return { texto: 'Lo siento, tuve un problema al procesar tu mensaje. Por favor intentá de nuevo.' };
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

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4.1-nano'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_SUPER_ADMIN_ID: z.coerce.number().int(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  ADMIN_WHATSAPP_NUMBER: z.string().min(1),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  SESSIONS_DIR: z.string().default('./sessions'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Config inválida:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

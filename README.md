# Chatbot Farmacias — Multi-farmacia

Sistema multi-tenant para farmacias:
- **Bot de WhatsApp (Baileys)** por farmacia, atiende clientes con IA 24/7.
- **Bot admin de WhatsApp (Baileys)** compartido: los farmacéuticos mandan comandos a este número y reciben notificaciones de pedidos.
- **Bot de Telegram (Telegraf)** para vos (super-admin): dar de alta farmacias, farmacéuticos y ver estado del sistema.

## Stack

- TypeScript + Node 20
- Fastify (health checks)
- [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp sin API oficial
- Telegraf — Telegram
- Prisma + PostgreSQL (Railway)
- OpenAI SDK

## Arquitectura

```
Cliente ── WhatsApp ──▶ [Sesión Baileys "pharmacy:<id>"] ──▶ IA ──▶ respuesta
                                                │
                                                └─ pedido detectado ──▶ notifica al admin WhatsApp
                                                                           │
Farmacéutico ── WhatsApp ──▶ [Sesión Baileys "admin"] ──▶ comandos (/tomar /fin /oferta…)
                                                            │
                                                            └─ al tomar control, mensajes se
                                                               reenvían desde la sesión de su farmacia
Super-admin (vos) ── Telegram ──▶ Telegraf bot ──▶ gestión de farmacias
```

Cada farmacia se guarda en la tabla `Farmacia`. Los farmacéuticos (tabla `Admin`) se identifican por su número de WhatsApp.

## Setup

```bash
cp .env.example .env
# editar .env
npm install
npm run prisma:push      # o prisma migrate deploy si ya hay migraciones
npm run build
npm start                # o npm run dev para hot-reload
```

La primera vez que arranca cada sesión de WhatsApp va a imprimir un **QR en la consola**. Escanealo con el teléfono correspondiente.

- La sesión `admin` pertenece a tu número admin (el que recibe comandos de todos los farmacéuticos).
- Las sesiones `pharmacy:<id>` son una por farmacia — el dueño del número escanea el QR.

Las credenciales quedan persistidas en `./sessions/<sessionId>/`.

## Uso

### Como super-admin (Telegram)

- `/nueva_farmacia <nombre>|<whatsappNumber>|<direccion>`
- `/nuevo_admin <farmaciaId>|<whatsappNumber>|<nombre>`
- `/farmacias` — lista
- `/farmacia <id>` — detalle
- `/activar <id>` / `/desactivar <id>`
- `/sesiones` — estado de las sesiones
- `/qr <farmaciaId>` — forzar re-escaneo

### Como farmacéutico (WhatsApp al número admin)

- `/tomar <número>` — tomar control de una conversación
- Cualquier mensaje sin `/` se reenvía al cliente
- `/fin` — devolver conversaciones al bot
- `/cola` — clientes en espera
- `/oferta <texto>` — IA genera el mensaje, confirmás con `sí`/`editar…`/`no`
- `/ayuda`

## Deploy (Railway)

1. Crear servicio Postgres y obtener `DATABASE_URL`.
2. Crear servicio web desde este repo (detecta Dockerfile).
3. Variables de entorno: ver `.env.example`.
4. Montar volumen persistente en `/app/sessions` para que no se pierdan las credenciales de Baileys entre deploys.

### Telegram en Railway

En producción conviene usar webhook para evitar el error `409 Conflict: terminated by other getUpdates request`, que aparece cuando dos procesos usan polling con el mismo token.

Agregá estas variables en Railway:

```bash
TELEGRAM_WEBHOOK_URL=https://TU-DOMINIO.up.railway.app/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=un-secreto-largo
```

Si no definís `TELEGRAM_WEBHOOK_URL`, el bot usa polling como antes, útil para desarrollo local. Asegurate de no tener el bot corriendo localmente con el mismo `TELEGRAM_BOT_TOKEN` mientras Railway está activo.

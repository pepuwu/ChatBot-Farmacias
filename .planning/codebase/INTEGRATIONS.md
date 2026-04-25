# External Integrations

**Analysis Date:** 2026-04-25

## APIs & External Services

**Messaging & Communication:**
- WhatsApp (via Baileys) - Customer and pharmacy staff communications
  - SDK/Client: `@whiskeysockets/baileys` 6.7.8
  - Auth: Session state persisted in `SESSIONS_DIR` directory (file-based, not token-based)
  - Multiple connections: Admin session + individual pharmacy sessions
  - Implementation: `src/whatsapp/session-manager.ts`, `src/whatsapp/customer-bot.ts`, `src/whatsapp/admin-bot.ts`

- Telegram Bot API - Super-admin control panel for pharmacy management
  - SDK/Client: `telegraf` 4.16.3
  - Auth: `TELEGRAM_BOT_TOKEN` (env var from @BotFather)
  - Super-admin authentication: `TELEGRAM_SUPER_ADMIN_ID` (numeric Telegram user ID)
  - Mode: Long polling (default) or webhook-based if `TELEGRAM_WEBHOOK_URL` configured
  - Implementation: `src/telegram/bot.ts`

**AI/LLM:**
- OpenAI Chat API - GPT models for customer response generation
  - SDK/Client: `openai` 4.73.0
  - Auth: `OPENAI_API_KEY` (sk-... format)
  - Model: Configurable via `OPENAI_MODEL` env var (default: "gpt-4.1-nano")
  - Timeout: 15 second request timeout
  - Implementation: `src/ai/openai.ts`
  - Usage: Customer message responses, offer message generation, free-form prompts

## Data Storage

**Databases:**
- PostgreSQL (relational database)
  - Connection: `DATABASE_URL` env var (postgresql://user:password@host:5432/dbname)
  - Client: Prisma ORM 5.22.0
  - Schema: `prisma/schema.prisma`
  - Tables: Farmacia, Admin, Cliente, Conversacion, Mensaje, ListaEspera

**File Storage:**
- Local filesystem only
  - Baileys session state: `SESSIONS_DIR` (default: ./sessions)
  - Directory structure: `{SESSIONS_DIR}/{sessionId}/creds.json` and auth metadata
  - Persisted via: Docker volume mount at `/data` in production (Fly.io)
  - On-disk format: Multi-file auth state (JSON credentials + metadata)

**Caching:**
- None - All data fetched fresh from PostgreSQL each request
- Message history retrieved from database for each conversation

## Authentication & Identity

**Auth Provider:**
- Custom implementation using Baileys multi-file auth state
  - Session authentication: File-based credential storage per WhatsApp number
  - JID format: WhatsApp numbers stored as `5491112345678@s.whatsapp.net` (international format)
  - Session lifecycle: QR code scan required on first session init, then credentials reused
  - Admin protection: Telegram SUPER_ADMIN_ID numeric validation

**Telegram Super-Admin:**
- Single user authentication via Telegram user ID
- All Telegram commands require ID match: `ctx.from?.id !== config.TELEGRAM_SUPER_ADMIN_ID`
- Middleware-level check in `src/telegram/bot.ts`

**WhatsApp Pharmacy Admin Sessions:**
- JID-based identification: Pharmacy admin WhatsApp number maps to unique session
- No traditional login flow - authenticated via WhatsApp account ownership (QR pairing)
- Session validation: Message sender JID matched against registered admin numbers

## Monitoring & Observability

**Error Tracking:**
- None detected - No integration with Sentry, DataDog, or similar services
- Errors logged to stdout via Pino logger

**Logs:**
- Framework: Pino 9.5.0
- Format: JSON in production, pretty-printed in development
- Log level: Configurable via `LOG_LEVEL` env var (trace, debug, info, warn, error, fatal)
- Logger instance: `src/logger.ts`
- Typical logging: `logger.info()`, `logger.error()`, `logger.warn()`
- No external log aggregation service

## CI/CD & Deployment

**Hosting:**
- Fly.io deployment platform
  - Configuration: `fly.toml`
  - Region: GRU (São Paulo, Brazil)
  - VM: 256MB memory, 1 CPU
  - Auto-scaling: Disabled (min_machines_running: 0, auto_start_machines: true)
  - HTTPS: Force HTTPS enabled
  - Persistent volume: `/data` mounted for session state

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, or similar
- Manual deployment via Fly CLI: `fly deploy`

**Docker:**
- Multi-stage Dockerfile (build + runtime)
- Base image: node:20-slim
- Build stage: Compiles TypeScript, generates Prisma client
- Runtime stage: Bundles compiled code and dependencies
- Database setup script: `dbsetup.js` runs before app startup

## Environment Configuration

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string (validated, must be valid URL)
- `OPENAI_API_KEY` - OpenAI API key starting with "sk-"
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `TELEGRAM_SUPER_ADMIN_ID` - Numeric Telegram user ID
- `ADMIN_WHATSAPP_NUMBER` - WhatsApp number for admin session (numeric string, e.g., "5491112345678")

**Optional Environment Variables:**
- `OPENAI_MODEL` - OpenAI model name (default: "gpt-4.1-nano")
- `TELEGRAM_WEBHOOK_URL` - Full webhook URL for Telegram (enables webhook mode instead of polling)
- `TELEGRAM_WEBHOOK_SECRET` - Secret token for Telegram webhook verification (optional security)
- `PORT` - HTTP server port (default: 8080)
- `HOST` - HTTP server bind address (default: 0.0.0.0)
- `SESSIONS_DIR` - Baileys session storage directory (default: ./sessions)
- `LOG_LEVEL` - Pino log level (default: info)
- `PUBLIC_URL` - Base URL for public endpoints (optional, used for QR code accessibility)
- `NODE_ENV` - Set to "production" to disable pretty-logging

**Secrets Location:**
- `.env` file in project root (loaded via dotenv)
- Example template: `.env.example`
- NEVER committed to git (in .gitignore)

## Webhooks & Callbacks

**Incoming Webhooks:**
- Telegram webhook endpoint (optional, production-ready)
  - Path: Extracted from `TELEGRAM_WEBHOOK_URL` (default: `/telegram/webhook`)
  - Method: POST
  - Security: Optional `X-Telegram-Bot-API-Secret-Token` header verification
  - Implemented in: `src/server.ts` lines 89-104
  - Enabled only if `TELEGRAM_WEBHOOK_URL` is configured

- QR code display endpoints (internal)
  - `GET /qr/:sessionId` - HTML page to scan QR for session pairing
  - `GET /qr/:sessionId/image` - PNG image of current QR code (refreshes every 15s)
  - Used by: Browser during WhatsApp session initialization
  - Implemented in: `src/server.ts`

**Outgoing Webhooks:**
- None configured - System does not send webhooks to external services
- WhatsApp messages sent via Baileys SDK (not webhook-based)
- Telegram messages sent via Telegraf SDK (HTTP requests to Telegram Bot API)

## Message Flow

**Customer Message → AI Response:**
1. WhatsApp message received by Baileys session manager
2. Message handler in `src/whatsapp/customer-bot.ts` processes incoming message
3. Conversation context fetched from PostgreSQL
4. OpenAI Chat API called with conversation history and system prompt (pharmacy-specific)
5. AI response generated and saved to PostgreSQL
6. Response sent back via Baileys WhatsApp connection

**Pharmacy Admin Commands:**
1. WhatsApp message received by admin Baileys session
2. Message handler in `src/whatsapp/admin-bot.ts` interprets command syntax
3. Database operations executed (query clients, send offers, manage waitlist)
4. Responses sent via WhatsApp or Telegram

**Super-Admin Telegram Controls:**
1. Telegram message received by Telegraf bot
2. Super-admin ID validation in middleware
3. Command handler executes (create pharmacy, list admins, view sessions, etc.)
4. Database changes applied
5. WhatsApp sessions may be restarted or initialized
6. Response sent via Telegram

---

*Integration audit: 2026-04-25*

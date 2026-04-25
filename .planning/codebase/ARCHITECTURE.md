# Architecture

**Analysis Date:** 2026-04-25

## Pattern Overview

**Overall:** Multi-tenant multi-transport chatbot with layered message handling and state management per session.

**Key Characteristics:**
- Three independent transport layers: WhatsApp (Baileys), Telegram (Telegraf), HTTP (Fastify)
- Dual-bot WhatsApp model: customer-facing pharmacy bots + admin operator bot
- Conversation state machine: `bot` → `farmaceutico` → `cerrada` / `espera`
- Session persistence: file-based Baileys auth state per pharmacy
- AI-driven responses: OpenAI integration with context-aware prompt injection
- Database-backed conversation history and user profiles

## Layers

**Transport Layer:**
- Purpose: Handle incoming/outgoing messages via WhatsApp, Telegram, HTTP
- Location: `src/whatsapp/session-manager.ts`, `src/telegram/bot.ts`, `src/server.ts`
- Contains: WebSocket/API clients, message normalization, QR handling
- Depends on: Baileys, Telegraf, Fastify, session state
- Used by: Message handlers, main application orchestrator

**Message Normalization Layer:**
- Purpose: Normalize messages from different transports into `IncomingMessage` interface
- Location: `src/whatsapp/session-manager.ts` (normalize method, lines 213–244)
- Contains: JID parsing, phone number extraction, message type filtering
- Depends on: Baileys proto types, transport handlers
- Used by: Message handlers (customer-bot, admin-bot)

**Handler Layer:**
- Purpose: Route messages to appropriate business logic based on message type and state
- Location: `src/whatsapp/customer-bot.ts`, `src/whatsapp/admin-bot.ts`
- Contains: Message dispatch, pre-processing (extracting farmaciaId, validating state)
- Depends on: Conversation service, session manager, database
- Used by: Session manager (onMessage event)

**Business Logic Layer:**
- Purpose: Execute core operations (conversation management, AI response generation, notifications)
- Location: `src/services/conversation.ts`, `src/ai/openai.ts`, `src/services/cleanup.ts`
- Contains: State transitions, prompt building, waitlist management, expiration
- Depends on: Prisma ORM, OpenAI client, logger
- Used by: Handlers, admin operations

**Admin Control Layer:**
- Purpose: Provide super-admin interface (Telegram) and pharmacist commands (WhatsApp)
- Location: `src/telegram/bot.ts`, `src/whatsapp/admin-bot.ts`
- Contains: Pharmacy CRUD, pharmacist state machines (offers, takeover, waitlist)
- Depends on: Database, session manager, AI service
- Used by: Telegram webhooks, WhatsApp admin session

**Persistence Layer:**
- Purpose: Store application state and conversation history
- Location: `src/db.ts`, `prisma/schema.prisma`
- Contains: Prisma client, models (Farmacia, Cliente, Conversacion, Mensaje, ListaEspera, Admin)
- Depends on: PostgreSQL connection string
- Used by: All business logic layers

**Infrastructure Layer:**
- Purpose: Cross-cutting concerns (logging, configuration, server startup)
- Location: `src/index.ts`, `src/config.ts`, `src/logger.ts`
- Contains: Boot sequence, environment validation, logging setup
- Depends on: Zod validation, Pino logger, Dotenv
- Used by: All layers

## Data Flow

**Customer Message → Response:**

1. **Message Arrives:** WhatsApp client receives message → `messages.upsert` event in `session-manager.ts:187`
2. **Normalize:** `normalize()` extracts phone number, JID, text, `isFromMe` flag → `IncomingMessage`
3. **Dispatch:** `onMessage` handlers in `customer-bot.ts:57` check `sessionId` prefix (`pharmacy:${id}`)
4. **Load Context:** `handlePharmacyMessage()` loads `Farmacia` and `Cliente` from database
5. **Generate Response:** `handleIncomingMessage()` in `conversation.ts`:
   - Get/create `Cliente`
   - Get/reuse active `Conversacion` (or create if timeout exceeded)
   - If pharmacist has control (`estado === 'farmaceutico'`), save message silently
   - Otherwise, save user message, fetch history (last 20), generate AI response via `generarRespuesta()`
   - AI response uses system prompt built from pharmacy config (horarios, delivery, services, custom instructions)
   - Detect order keywords in combined user + AI response
6. **Send Response:** `sessionManager.sendToJid()` or `sendText()` sends response back to customer
7. **Notify:** If order detected, `notificarPedido()` sends alert to all registered pharmacists

**Pharmacist Takeover:**

1. **Message Arrives:** Admin session receives message from registered pharmacist
2. **Cache JID:** Store phone→JID mapping to handle WhatsApp's @lid migration
3. **Load Pharmacist:** Verify `Admin` record exists for that WhatsApp number
4. **Command Parsing:** Check if message matches command pattern (`tomar `, `fin`, `oferta `, etc.)
5. **State Machine:** Map command to handler (e.g., `tomar 5491123456789` → `handleTomar`)
6. **Update Conversation:** Change conversation `estado` from `bot` → `farmaceutico`
7. **Pass-through:** Subsequent messages from pharmacist reenvied directly to customer without AI

**Offer Broadcasting:**

1. **Generate:** Pharmacist sends `oferta [description]` → AI generates message via `generarMensajeOferta()`
2. **Preview:** Show generated message to pharmacist with client count
3. **Confirm:** Pharmacist replies `sí` or provides edit instructions (`editar ...`)
4. **Send:** Iterate through `Cliente.telefono` list, send via pharmacy session

**Conversation Expiration:**

1. **Periodic Task:** `startCleanupInterval()` runs every 60s
2. **Check Timeout:** For each `Farmacia`, compare `tiempoSesionMinutos` against conversation `updatedAt`
3. **Close:** Mark expired conversations as `estado === 'cerrada'`
4. **Result:** Next message from client creates fresh conversation with bot

## Key Abstractions

**SessionManager (Singleton):**
- Purpose: Multiplex WhatsApp sessions, manage QR state, route messages to handlers
- Examples: `src/whatsapp/session-manager.ts`
- Pattern: Map of `sessionId` → `SessionEntry` (socket + ready flag + lastQR), event emitters for handlers/QR listeners
- Key methods: `startSession()`, `sendText()`, `onMessage()`, `onQR()`, `getLastQR()`, `isReady()`

**IncomingMessage Interface:**
- Purpose: Normalize messages from Baileys proto into application domain
- Examples: `src/whatsapp/session-manager.ts:17–23`
- Pattern: Struct with `from` (JID), `phoneNumber` (digits only), `text`, `isFromMe`, `raw` (proto)
- Why it matters: Allows handlers to ignore transport details

**Conversation State Machine:**
- Purpose: Track message flow control per conversation
- Examples: `src/services/conversation.ts:40–56, 124–146`
- States:
  - `bot`: AI is handling conversation
  - `farmaceutico`: Pharmacist has manual control
  - `espera`: Waiting (used for waitlist context, state rarely set directly)
  - `cerrada`: Session expired or explicitly closed
- Pattern: `Conversacion.estado` field drives conditional routing in handlers

**Prompt Injection System:**
- Purpose: Customize AI responses per pharmacy without prompt engineering burden
- Examples: `src/ai/openai.ts:10–63`
- Pattern: `Farmacia.promptSistema` optional override; fallback builds prompt from structured data (hours, services, custom messages)
- Why it matters: Allows non-technical users to control bot personality and guardrails

**Waitlist (ListaEspera):**
- Purpose: Track product availability requests without blocking conversation
- Examples: `src/services/conversation.ts:171–205`
- Pattern: Lazy CRUD; pharmacist can manually notify customers or mark as notified
- Why it matters: Decouples inventory management from message flow

## Entry Points

**Application Boot (`src/index.ts`):**
- Location: `src/index.ts:51–94`
- Triggers: `npm run dev` or `node dist/index.js` (production)
- Responsibilities:
  - Audit sessions directory (verify write permissions)
  - Connect to database
  - Register message handlers (customer + admin)
  - Start HTTP server (health checks, QR viewer, Telegram webhook)
  - Start Telegram bot
  - Register QR push to super-admin
  - Start admin WhatsApp session
  - Start all active pharmacy WhatsApp sessions
  - Start cleanup interval for expired conversations
  - Handle graceful shutdown (SIGINT/SIGTERM)

**Customer Message Handler (`src/whatsapp/customer-bot.ts`):**
- Location: `src/whatsapp/customer-bot.ts:57–62`
- Triggers: WhatsApp message arrives to pharmacy session
- Responsibilities: Check sessionId prefix, load pharmacy context, run conversation handler, send response

**Admin Message Handler (`src/whatsapp/admin-bot.ts`):**
- Location: `src/whatsapp/admin-bot.ts:58–62`
- Triggers: WhatsApp message arrives to admin session
- Responsibilities: Validate pharmacist registration, cache JID, parse command, route to handler

**HTTP Server (`src/server.ts`):**
- Location: `src/server.ts:109–114`
- Triggers: Application boot
- Responsibilities: Host health check, QR image endpoint, Telegram webhook receiver

**Telegram Super-Admin Bot (`src/telegram/bot.ts`):**
- Location: `src/telegram/bot.ts:16–40`
- Triggers: Application boot or Telegram webhook (production)
- Responsibilities: Auth check against `TELEGRAM_SUPER_ADMIN_ID`, dispatch commands

## Error Handling

**Strategy:** Graceful degradation — log errors, catch handlers don't crash session, return error messages to users.

**Patterns:**

**Message Handler Errors (sessionManager):**
- Catch per-handler exceptions (session-manager.ts:200–205)
- Log error with sessionId context
- Continue processing other handlers
- Result: One broken handler doesn't block other farmers

**Transport Layer Errors:**
- WhatsApp disconnect: Auto-reconnect after 3s delay (or 500ms if loggedOut)
- Baileys 401 after connected: Require manual `/qr` command (prevents infinite loop on device conflict)
- Send failures: Log and propagate to caller; handler logs and notifies user

**AI Response Errors (openai.ts:86–97):**
- Timeout after 15s
- Return fallback message: "Lo siento, tuve un problema..."
- Log full error with farmacia name

**Database Errors:**
- Queries throw; caller catches and logs
- No automatic retry (Prisma handles connection pooling)

**Telegram Bot Errors (bot.ts):**
- Auth fails: Return "No autorizado" message
- Command parsing errors: Return usage string
- No crash; bot continues listening

## Cross-Cutting Concerns

**Logging:** 
- Framework: Pino with log levels (trace, debug, info, warn, error, fatal)
- Transport: pino-pretty in dev (colored, translated time), JSON in production
- Config: `src/logger.ts`, `config.LOG_LEVEL`
- Pattern: Pass context objects (e.g., `{ farmacia: 'Farmacia X', telefono: '549...' }`)
- Examples: `src/index.ts:52`, `src/services/conversation.ts:77`

**Validation:**
- Framework: Zod for environment config
- Location: `src/config.ts:4–27`
- Pattern: Schema defined at module level, parsed at startup, process.exit(1) on failure
- Rationale: Fail fast on misconfiguration rather than runtime surprises

**Authentication:**
- Telegram Super-Admin: `TELEGRAM_SUPER_ADMIN_ID` check (bot.ts:20)
- Pharmacist WhatsApp: `Admin.whatsappNumber` lookup (admin-bot.ts:113–120)
- No JWT/sessions; phone number is the identity
- Why: Pharmacy ops already use WhatsApp; reuse existing identity

**JID Caching:**
- Problem: Modern WhatsApp delivers `@lid` (anonymous LID) JIDs; direct phone→JID lookup fails with 463 async errors
- Solution: Cache last seen JID for each phone number (`pnToJid` Map in admin-bot.ts:50)
- Fallback: Try phone number JID if cached JID fails
- Location: `src/whatsapp/admin-bot.ts:67–85`
- Why it matters: Prevents cascade failures when WhatsApp migrates accounts to @lid

---

*Architecture analysis: 2026-04-25*

# Codebase Concerns

**Analysis Date:** 2026-04-25

## Tech Debt

**In-Memory State Without Persistence:**
- Issue: `admin-bot.ts` maintains three critical Maps in process memory (`ofertasPendientes`, `controlesActivos`, `pnToJid`) with no persistence mechanism. Server restart loses all pending offers, active controls, and cached JID mappings.
- Files: `src/whatsapp/admin-bot.ts` (lines 46-50)
- Impact: Pharmacist interactions interrupted during deployment; offers in progress are dropped; customers lose context of which JID maps to their phone number
- Fix approach: Migrate to temporary Redis/database cache with TTL, or implement session recovery on restart. Consider Prisma model for pending interactions.

**No Testing Infrastructure:**
- Issue: Zero test files across entire codebase. No unit, integration, or E2E tests present.
- Files: All source files
- Impact: Refactoring is risky; edge cases in conversation handling, message parsing, or payment flows go undetected; regression in WhatsApp protocol compatibility breaks silently
- Fix approach: Add Jest/Vitest config, start with critical paths: message normalization (`session-manager.normalize()`), conversation state transitions, admin command parsing

**Admin WhatsApp Number in Config Not Used:**
- Issue: `ADMIN_WHATSAPP_NUMBER` required in `.env` (line 13 of `config.ts`) but never referenced in code
- Files: `src/config.ts`
- Impact: Misleading configuration; unclear if this was placeholder for future admin routing or legacy code
- Fix approach: Either remove from schema or implement its intended purpose (routing certain messages to admin hotline)

**Unstructured Database JSON Fields:**
- Issue: `Farmacia.horarios` stored as untyped JSON (line 16 of `schema.prisma`), no validation or schema enforcement
- Files: `prisma/schema.prisma`, `src/ai/openai.ts` (line 13)
- Impact: AI prompt builder assumes `{ semana?, sabado?, domingo? }` structure but JSON validation happens only at application layer. Bad data silently converts to empty strings in prompts
- Fix approach: Add runtime Zod validation on `buildSystemPrompt()`, or migrate to separate `HorariosFarmacia` model with proper schema

## Known Bugs

**JID Resolution Race Condition:**
- Symptoms: In high-concurrency scenarios (multiple pharmacists replying to same customer), WhatsApp may receive duplicate messages or messages fail with 463 error
- Files: `src/whatsapp/session-manager.ts` (lines 261-271), `src/whatsapp/admin-bot.ts` (lines 67-85)
- Trigger: Pharmacist uses "tomar" command, then customer sends message before reply reaches WhatsApp. Session tries to resolve JID twice concurrently
- Workaround: Admin can resend message using "editar" flow or manually restart conversation
- Root cause: `resolveJid()` hits Baileys API every send without caching between calls; `pnToJid` cache can become stale if customer changes device

**"Editar Oferta" Loses Original Description:**
- Symptoms: When pharmacist uses "editar" on a pending offer, regenerates from `descripcionOriginal` in memory which may not match what user actually submitted
- Files: `src/whatsapp/admin-bot.ts` (lines 261-274)
- Trigger: Send offer → edit offer → edit again. Second edit uses regenerated version, not original user input
- Trigger sequence: "oferta" → "editar" → "editar"
- Workaround: Cancel and resend offer from scratch
- Root cause: Map stores `mensajeActual` but `descripcionOriginal` can be modified during first AI regeneration if instructions reshape it

**Unhandled Promise in Cleanup Service:**
- Symptoms: No logging if `cerrarSesionesInactivas()` fails; silently drops errors
- Files: `src/services/cleanup.ts` (lines 26-27)
- Trigger: Database becomes temporarily unavailable during cleanup interval
- Workaround: Manual intervention to close stale conversations
- Root cause: `.catch()` handler only logs, doesn't retry or escalate

## Security Considerations

**WhatsApp JID Caching Without Validation:**
- Risk: `pnToJid` Map caches user JIDs indefinitely per process uptime. If phone number is reassigned to new account, messages send to old account holder
- Files: `src/whatsapp/admin-bot.ts` (lines 50, 111)
- Current mitigation: Session-scoped Map (cleared on restart), fallback to `sendText()` on JID send failure
- Recommendations: Implement JID cache TTL (2-4 hours), validate JID exists before caching, add audit logging for admin message sends

**No Rate Limiting on Admin Commands:**
- Risk: Pharmacist can spam "oferta", "avisar", or "tomar" commands without throttle; no protection against accidental message loops
- Files: `src/whatsapp/admin-bot.ts` (lines 225-364)
- Current mitigation: None
- Recommendations: Add command cooldown per admin (5-second minimum between identical commands), track send failures and soft-ban spammers

**Telegram Super Admin ID in Plain Text:**
- Risk: `TELEGRAM_SUPER_ADMIN_ID` hardcoded in `.env` as integer, exposed in logs and error messages
- Files: `src/config.ts` (line 9), `src/index.ts` (logging context)
- Current mitigation: Env var only, not in code
- Recommendations: Use secure secret manager (AWS Secrets Manager, HashiCorp Vault) for production; scrub from logs

**OpenAI API Key Not Rate-Limited Locally:**
- Risk: If customer or admin exploits message handling, could trigger thousands of API calls without throttle
- Files: `src/ai/openai.ts` (lines 87-97)
- Current mitigation: OpenAI account-level rate limit (if configured)
- Recommendations: Implement per-pharmacy request queue with max 5 concurrent calls, add per-customer message throttle (max 1 call per 2 seconds)

**No Input Sanitization on Conversation Messages:**
- Risk: Customer messages stored in `Mensaje.contenido` without sanitization; stored text could contain malicious payloads (though low risk given WhatsApp client limitation)
- Files: `src/services/conversation.ts` (lines 84-85, 100-102, 107-109)
- Current mitigation: Prisma ORM parameterized queries prevent SQL injection; WhatsApp text input is plain-text only
- Recommendations: Add length limit on stored messages (e.g., truncate to 4000 chars), validate no embedded HTML in logs

## Performance Bottlenecks

**N+1 Queries in Admin Commands:**
- Problem: `getClientesTelefonos()` fetches all clients, then sends 1 message per client sequentially
- Files: `src/whatsapp/admin-bot.ts` (lines 29-32, 247-253)
- Cause: `for` loop with sequential `sendFromPharmacy()` calls. For 100 clients, 100 sequential Baileys API calls
- Impact: Bulk offer takes 30-60 seconds for 100 clients; user sees "📤 Enviando..." for too long
- Improvement path: Batch message sends with `Promise.all()` (max 5 concurrent), add progress updates, implement exponential backoff on failure

**Full History Load on Every Message:**
- Problem: `obtenerHistorial()` fetches last 20 messages from DB on every incoming customer message
- Files: `src/services/conversation.ts` (lines 58-65, 104)
- Cause: Not filtered by `conversacionId` optimization in query
- Impact: For high-volume pharmacy (100+ conversations/day), becomes O(n) load spike at peak hours
- Improvement path: Implement materialized message buffer in `Conversacion` table, cache last 5 messages in-process

**Synchronous File I/O in QR Display:**
- Problem: `/qr/:sessionId/image` endpoint reads lastQR from memory and generates PNG synchronously
- Files: `src/server.ts` (lines 73-87)
- Cause: `QRCode.toBuffer()` is async but not parallelized across requests
- Impact: If 10 pharmacists scan QR simultaneously, requests block each other
- Improvement path: Add in-memory PNG buffer cache with 15-second TTL, regenerate in background

## Fragile Areas

**Session-Manager Reconnection Logic:**
- Files: `src/whatsapp/session-manager.ts` (lines 125-185)
- Why fragile: Complex error code handling (DisconnectReason.loggedOut vs others). 401 after pairing causes permanent state (manual restart required). Future Baileys version changes could break error detection
- Safe modification: Mock Boom error objects in tests before touching; keep 401 handling separate from 4xx retry logic
- Test coverage: Zero tests for reconnection paths; 403/419 timeouts untested

**Admin Bot Message Routing:**
- Files: `src/whatsapp/admin-bot.ts` (lines 109-157)
- Why fragile: Pending offer/control state checked via Map; if handler exceptions occur between state change and reply, state becomes inconsistent. No explicit lock mechanism
- Safe modification: Wrap command handlers in try/finally that clean up state on error; add logging for state transitions
- Test coverage: No tests for command sequence interactions (e.g., "tomar" + "editar" simultaneously)

**Conversation State Transitions:**
- Files: `src/services/conversation.ts` (lines 40-56, 124-147)
- Why fragile: Four states (bot, farmaceutico, espera, cerrada) with implicit transitions. No validation that state transitions are valid (e.g., espera → bot allowed but not documented)
- Safe modification: Add enum for states, add explicit `validNextStates()` function, log all transitions with context
- Test coverage: Zero tests for state machine logic

**Baileys Library Dependency:**
- Files: `src/whatsapp/session-manager.ts` (entire file)
- Why fragile: Tightly coupled to `@whiskeysockets/baileys` v6.7.8. Library is community-maintained reverse-engineering of WhatsApp Web; breaking changes likely as WhatsApp updates
- Safe modification: Create abstraction interface `WhatsAppProvider` to decouple Baileys, implement as adapter pattern
- Test coverage: No integration tests with real/mock WhatsApp; can't validate against protocol changes

## Scaling Limits

**In-Memory Session Map Size:**
- Current capacity: ~100 pharmacy + 1 admin session before memory pressure (each ~2-5MB for creds + socket)
- Limit: 1000+ concurrent sessions would require 5-10GB RAM
- Scaling path: Move session persistence to Redis (cluster mode), implement session state store for inactive sessions

**Single Database Connection Pool:**
- Current capacity: Prisma default 2-10 connection pool, ~100 concurrent queries
- Limit: >500 simultaneous users would exhaust pool; query timeouts increase
- Scaling path: Scale Prisma pool to 20-30 for production, use read replicas for expensive queries (health check, admin dashboard)

**Message Queue (None):**
- Current capacity: All messages routed synchronously; no async queue
- Limit: If OpenAI API degradation occurs, incoming messages block entire session
- Scaling path: Implement Bull/RabbitMQ for async message processing, separate message receipt from response generation

**WhatsApp Session Persistence:**
- Current capacity: Filesystem-based auth state per session, no centralized backup
- Limit: 50+ pharmacies, each with large auth state files (>100KB) = network filesystem bottleneck
- Scaling path: Implement S3-backed auth state storage, implement session compression

## Dependencies at Risk

**@whiskeysockets/baileys v6.7.8:**
- Risk: Community reverse-engineering library; WhatsApp updates can break compatibility without warning. No official LTS support
- Impact: Session auth fails, all message routing breaks, customers can't place orders
- Migration plan: Monitor [baileys GitHub issues](https://github.com/whiskeysockets/Baileys) for major changes, test new versions in staging before prod. Have fallback plan to switch to Twilio WhatsApp API or other provider

**openai v4.73.0:**
- Risk: Breaking changes in chat.completions API; timeout handling may change
- Impact: Offer generation and conversation responses fail silently if API contract changes
- Migration plan: Pin major version, subscribe to OpenAI API changelog; implement circuit breaker for API failures

**prisma v5.22.0:**
- Risk: Migration management fragile; `prisma migrate` or `prisma db push` can corrupt schema if not carefully versioned
- Impact: Database schema mismatch, queries fail, data loss in worst case
- Migration plan: Always test migrations in staging replica first, maintain migration history, implement database backup before any migration

## Missing Critical Features

**No Message Queue / Async Processing:**
- Problem: All message handling is synchronous. If OpenAI times out, customer message is lost or response delayed indefinitely
- Blocks: Reliable order fulfillment, ability to scale to 1000+ concurrent messages

**No Audit Trail for Admin Actions:**
- Problem: Admin can send messages, modify offers, take control without logging. No way to trace who sent what or when
- Blocks: Compliance (GDPR, data protection), dispute resolution, fraud detection

**No Backup / Disaster Recovery:**
- Problem: All state in single database and Baileys session files. No automated backup, no restore procedure
- Blocks: Production readiness, ability to recover from database corruption

**No Analytics / Monitoring:**
- Problem: No metrics on conversation completion rate, order success rate, response latency, customer satisfaction
- Blocks: Optimization, identifying broken pharmacies, measuring ROI

**No Multi-Language Support:**
- Problem: Prompt hardcodes Spanish/Argentine Spanish assumptions. Falls back to customer language if requested, but no translations for admin commands
- Blocks: Expansion to other countries

## Test Coverage Gaps

**Message Normalization:**
- What's not tested: `session-manager.normalize()` edge cases (group messages, status updates, media without text, malformed JID)
- Files: `src/whatsapp/session-manager.ts` (lines 213-244)
- Risk: Malformed messages could crash handler or leak customer data
- Priority: High

**Conversation State Machine:**
- What's not tested: All possible state transitions (bot→farmaceutico→bot, espera→cerrada), concurrent state changes
- Files: `src/services/conversation.ts` (lines 40-56, 124-147)
- Risk: Customers slip between states silently, messages delivered to wrong handler
- Priority: High

**Admin Command Parsing:**
- What's not tested: Edge cases in "espera [tel] [product]" parsing, Unicode in product names, trailing/leading spaces
- Files: `src/whatsapp/admin-bot.ts` (lines 291-318)
- Risk: Typos or special characters break command routing
- Priority: Medium

**Error Handling:**
- What's not tested: OpenAI timeouts, Baileys connection loss, database unavailability during message processing
- Files: `src/ai/openai.ts`, `src/services/conversation.ts`, entire message flow
- Risk: Unhandled exceptions cascade, customers stuck indefinitely
- Priority: High

**Session Reconnection:**
- What's not tested: 401 logout handling, QR refresh on conflict, session restart consistency
- Files: `src/whatsapp/session-manager.ts` (lines 125-185)
- Risk: Pharmacies offline without alert, customers' messages pile up
- Priority: High

**Offer Generation Edge Cases:**
- What's not tested: Very long product descriptions (>500 chars), special characters, concurrent edit requests
- Files: `src/whatsapp/admin-bot.ts` (lines 225-274), `src/ai/openai.ts` (lines 108-123)
- Risk: OpenAI prompt injection, offer generation hangs, clients receive malformed messages
- Priority: Medium

---

*Concerns audit: 2026-04-25*

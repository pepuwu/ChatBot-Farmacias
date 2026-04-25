# Coding Conventions

**Analysis Date:** 2026-04-25

## Naming Patterns

**Files:**
- kebab-case for filenames: `session-manager.ts`, `customer-bot.ts`, `admin-bot.ts`
- Directory names lowercase: `src/whatsapp/`, `src/telegram/`, `src/ai/`, `src/services/`
- Type/interface files same as implementation: `session-manager.ts` exports `IncomingMessage` interface

**Functions:**
- camelCase for all function names: `handleAdminMessage()`, `generarRespuesta()`, `tomarControl()`
- Exported functions are top-level: `export async function startAdminSession()`
- Private functions use underscore prefix or `private` keyword in classes: `private normalize()` (private method in SessionManager)
- Handler functions follow pattern: `handle*` for main entry points, `*Handler` for callbacks

**Variables:**
- camelCase for all variables: `sessionManager`, `prisma`, `logger`, `pnToJid`
- UPPER_SNAKE_CASE for constants: `ADMIN_SESSION_ID`, `PHARMACY_PREFIX`, `PALABRAS_PEDIDO`
- Boolean prefixes: `is*`, `has*`, `was*` (e.g., `isFromMe`, `hasCreds`, `wasEverOpen`)

**Types:**
- PascalCase for all interfaces and types: `SessionEntry`, `IncomingMessage`, `HandleResult`, `OfertaPendiente`
- Use `type` for unions/aliases: `export type MessageHandler = (...) => Promise<void> | void`
- Generic types capitalized: `Map<string, SessionEntry>`

## Code Style

**Formatting:**
- Target: ES2022 (strict mode enabled in tsconfig.json)
- Module system: ESNext with .js file extensions in imports (e.g., `from './config.js'`)
- Indentation: 2 spaces (inferred from eslint config and source)
- Line length: No hard limit observed, but generally 80-120 characters

**Linting:**
- Tool: ESLint with `typescript-eslint` and `@eslint/js`
- Config file: `eslint.config.js` (new flat config format)
- Key rules enforced:
  - `@typescript-eslint/no-explicit-any: 'error'` - No untyped values allowed
  - ESLint recommended rules enabled
  - TypeScript recommended rules enabled
- Ignores: `dist/**`, `node_modules/**`

**TypeScript Strict Mode:**
- `strict: true` in `tsconfig.json` enforces type safety
- All functions must have explicit return types or be inferred
- No implicit `any` types permitted
- No optional chaining without null checks in some contexts

## Import Organization

**Order:**
1. Node.js built-in modules: `import path from 'node:path'`, `import fs from 'node:fs/promises'`
2. Third-party packages: `import OpenAI from 'openai'`, `import { Telegraf } from 'telegraf'`
3. Prisma types: `import type { Farmacia, Mensaje } from '@prisma/client'`
4. Local absolute imports: `import { config } from './config.js'`, `import { logger } from '../logger.js'`
5. Relative sibling imports: `import { sessionManager } from './session-manager.js'`

**Path Aliases:**
- Not used; all imports use relative paths with file extensions
- Relative traversal: `../` to go up directories, `.js` extension required for ES modules

**Re-exports:**
- No barrel files (`index.ts` files) used for re-exporting
- Each module exports its own public API
- Example: `sessionManager` is exported from `session-manager.ts`, not re-exported

## Error Handling

**Patterns:**
- Try-catch blocks around external API calls (OpenAI, WhatsApp): `src/ai/openai.ts` wraps `client.chat.completions.create()` in try-catch
- Errors logged with context: `logger.error({ err, farmaciaId }, 'Error message')`
- Error messages in Spanish (argentino) for user-facing text, English for logs
- Graceful degradation: Return sensible defaults on error: `return 'Lo siento, tuve un problema...'` in `generarRespuesta()`
- Async errors caught in event loops: `sock.ev.on()` handlers wrap handler calls in try-catch
- Promise rejections handled: `.catch((err) => logger.error({ err }, '...'))`

**Error Objects:**
- Standard `Error` constructor for thrown errors: `throw new Error('Timeout esperando QR')`
- Error details passed to logger as object: `{ err, sessionId, jid }`

## Logging

**Framework:** Pino (with pino-pretty for development)

**Configuration:** `src/logger.ts`
- Production: JSON format for structured logging
- Development: Pretty-printed output with timestamps (HH:MM:ss format)
- Log level configurable via `LOG_LEVEL` environment variable (default: 'info')

**Patterns:**
- All logging via `logger` singleton: `import { logger } from '../logger.js'`
- Contextual logging with objects: `logger.info({ farmaciaId, jid }, 'Message')`
- Log levels used:
  - `debug`: Low-level details (e.g., message types, auth state)
  - `info`: Normal operations (session started, message received, config loaded)
  - `warn`: Unexpected but recoverable situations (session exists, QR ignored, timeout)
  - `error`: Errors that need intervention (handler failed, API call failed, auth error)
  - `fatal`: Unrecoverable errors (config invalid, fatal catch in main)
- Context objects always first argument, message second: `logger.info({ key: value }, 'Human message')`
- Session context included: `logger.child({ session: sessionId })` for Baileys logger

## Comments

**When to Comment:**
- Block comments for section headers: `// ─── Boot ────────────────────────────────────────────────────────────────────`
- JSDoc for public functions and complex logic
- Inline comments for non-obvious logic, especially in `session-manager.ts` and `admin-bot.ts`
- Comments in Spanish for user-facing documentation and business rules
- English for technical explanations

**JSDoc/TSDoc:**
- Used sparingly for public APIs and complex functions
- Example from `session-manager.ts`:
  ```typescript
  /**
   * Inicia (o reconecta) una sesión Baileys identificada por `sessionId`.
   * El `sessionId` se usa como nombre de carpeta para el auth state.
   * Si el dispositivo no está emparejado, imprime el QR en consola.
   */
  async startSession(sessionId: string): Promise<WASocket> {
  ```
- Document business rules in long prompts: See `buildSystemPrompt()` in `src/ai/openai.ts`

## Function Design

**Size:**
- Functions generally 20-50 lines
- Largest files: `admin-bot.ts` (401 lines), `session-manager.ts` (331 lines) - classes with multiple responsibilities
- Helper functions extracted for reusability: `normalize()`, `resolveJid()`, `ensureSignalSession()`

**Parameters:**
- Single objects preferred for multiple parameters: `{ farmaciaId, telefono }` style
- Type annotations always explicit: `async function handleAdminMessage(msg: IncomingMessage)`
- Optional parameters use `?`: `sessionId?: string`, `timeoutMs = 60000`

**Return Values:**
- Explicit return types on all functions: `Promise<string>`, `HandleResult`, `WASocket | null`
- Async functions return `Promise<T>`
- Void for side-effect-only functions: `registerPharmacyHandler(): void`
- Nullable returns typed: `string | null` when value may not exist

## Module Design

**Exports:**
- Named exports for functions: `export async function startAdminSession()`
- Singleton exports for services: `export const sessionManager = new SessionManager()`, `export const prisma = new PrismaClient()`
- Type exports with `type` keyword: `export type MessageHandler = (...)`
- Interface exports: `export interface IncomingMessage { ... }`

**Class vs Functions:**
- SessionManager uses class pattern (`class SessionManager { ... }`) with private methods and state
- Most other modules use function-based exports
- Event handlers pattern: `onMessage()`, `onQR()` return unsubscribe functions

**Organization by Feature:**
- `src/whatsapp/`: WhatsApp integration (session management, bot logic)
- `src/telegram/`: Telegram super-admin bot
- `src/ai/`: OpenAI integration
- `src/services/`: Business logic (conversation handling, cleanup)
- Root: Core setup (config, logger, db, server)

## Async/Await Patterns

- All async operations use async/await, no .then() chains
- Promise.all() for parallel operations: `await Promise.all([...])`
- Error handling in catch blocks: `.catch((err) => logger.error({ err }, '...'))`
- Async event handlers: `async (ctx: Context, next) => { ... }`

## Validation

**Config Validation:**
- Zod schema in `src/config.ts` validates all environment variables on startup
- Schema enforces types and ranges: `z.coerce.number().int()`, `z.string().url()`
- Missing/invalid config causes immediate `process.exit(1)` with detailed error message

**Input Validation:**
- Minimal in handlers; trust Prisma types
- String normalization (phone numbers): `.replace(/[^0-9]/g, '')`
- Text trimming: `.trim()` before processing
- Type safety via TypeScript compiler (strict mode)

---

*Convention analysis: 2026-04-25*

# Technology Stack

**Analysis Date:** 2026-04-25

## Languages

**Primary:**
- TypeScript 5.7.2 - All application code
- JavaScript - Node.js runtime and package management

**Secondary:**
- SQL - PostgreSQL database queries via Prisma ORM
- HTML/CSS - QR code display pages in HTTP server

## Runtime

**Environment:**
- Node.js 20+ (required by package.json engines)
- V8 JavaScript engine

**Package Manager:**
- npm 9+ (inferred from package-lock.json)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Fastify 5.1.0 - HTTP server for health checks and webhooks
- Telegraf 4.16.3 - Telegram bot framework for super-admin control panel
- @whiskeysockets/baileys 6.7.8 - WhatsApp client library for customer and admin bots

**Database:**
- Prisma ORM 5.22.0 - Database abstraction and schema management
- Prisma Client 5.22.0 - Type-safe database queries

**AI/LLM:**
- OpenAI 4.73.0 - GPT-based chat completions for customer support responses

**Testing:**
- None detected - no test framework or testing libraries in dependencies

**Build/Dev:**
- tsx 4.19.2 - TypeScript execution for development (watch mode)
- TypeScript Compiler (tsc) 5.7.2 - Compiles TypeScript to JavaScript

**Linting:**
- ESLint 10.2.1 - JavaScript linter
- typescript-eslint 8.59.0 - TypeScript-specific ESLint rules
- @eslint/js 10.0.1 - ESLint recommended config

**Logging:**
- Pino 9.5.0 - Structured JSON logger
- pino-pretty 11.3.0 - Pretty-printed logs for development

**Utilities:**
- dotenv 16.4.5 - Environment variable loading
- zod 3.23.8 - TypeScript-first schema validation
- qrcode 1.5.4 - QR code generation for WhatsApp pairing
- qrcode-terminal 0.12.0 - Terminal QR code rendering

## Key Dependencies

**Critical:**
- `@whiskeysockets/baileys` 6.7.8 - Enables WhatsApp integration without official API. Manages multi-session connections, message handling, authentication state persistence.
- `@prisma/client` 5.22.0 - Database interface for all data persistence. ORM handles PostgreSQL connections, migrations, type safety.
- `openai` 4.73.0 - LLM integration for AI-powered customer responses. Required for all automated customer interactions.
- `telegraf` 4.16.3 - Super-admin control panel via Telegram. Manages pharmacy registration, staff administration, WhatsApp session monitoring.
- `fastify` 5.1.0 - HTTP server for health checks, webhook handling, and QR code display pages.

**Infrastructure:**
- `zod` 3.23.8 - Environment variable validation at startup. Prevents invalid configuration from running.
- `dotenv` 16.4.5 - Loads .env configuration file for development.
- `pino` 9.5.0 - Structured logging for debugging and monitoring. Production uses JSON format, development uses pretty-printing.
- `qrcode` 1.5.4 - Generates QR codes for WhatsApp session pairing as data URLs.
- `qrcode-terminal` 0.12.0 - Displays QR codes in terminal for quick scanning during development.

## Configuration

**Environment:**
- Configuration loaded from `.env` file via dotenv
- Validated with Zod schema in `src/config.ts`
- Supports optional values for webhook-based Telegram operation
- Production-specific: NODE_ENV='production' disables pretty-logging

**Build:**
- `tsconfig.json` - TypeScript compilation to ES2022, ESNext modules
- `eslint.config.js` - ESLint with TypeScript support, strict rule set
- `Dockerfile` - Multi-stage Node 20 slim image with build/runtime separation
- `Prisma generator` - Auto-generates PrismaClient on build via `prisma generate`

**Key Configuration Files:**
- `.env.example` - Template for required environment variables
- `prisma/schema.prisma` - Prisma schema with PostgreSQL provider
- `tsconfig.json` - TypeScript compiler options

## Platform Requirements

**Development:**
- Node 20+
- npm or yarn package manager
- PostgreSQL database accessible via connection string
- OpenAI API key (sk-...)
- Telegram bot token from @BotFather
- WhatsApp account for session pairing (QR scan)

**Production:**
- Docker environment with Node 20-slim image
- PostgreSQL database with persistent connection
- Fly.io deployment (configured in fly.toml) with:
  - 256MB memory VM
  - 1 CPU
  - Persistent volume mount at `/data` for Baileys session state
  - Auto-HTTPS
  - Primary region: GRU (São Paulo)
- Environment variables for: DATABASE_URL, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, ADMIN_WHATSAPP_NUMBER

## Scripts

**Development:**
```bash
npm run dev          # Watch mode with tsx (auto-reload)
npm run lint         # Run ESLint on src/
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled JavaScript from dist/
```

**Database:**
```bash
npm run prisma:generate    # Generate PrismaClient
npm run prisma:migrate     # Apply pending migrations
npm run prisma:push        # Push schema changes to database
```

---

*Stack analysis: 2026-04-25*

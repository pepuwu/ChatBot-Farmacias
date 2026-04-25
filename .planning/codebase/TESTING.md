# Testing Patterns

**Analysis Date:** 2026-04-25

## Test Framework Status

**Current State:** No test framework configured
- No `jest.config.js`, `vitest.config.js`, or `mocha` config files present
- No test files exist (no `*.test.ts` or `*.spec.ts` files)
- No testing dependencies in `package.json`: no jest, vitest, mocha, chai, or test runners
- Development dependencies: `@types/node`, TypeScript, tsx, ESLint only

**Recommendation:** Testing infrastructure does not exist. Before writing tests, establish a testing framework.

## Suggested Testing Setup

**Recommended Framework:** Vitest (lightweight, TypeScript-native, fast)

**Installation:**
```bash
npm install -D vitest @vitest/ui @vitest/expect
npm install -D @testing-library/node  # For mocking
npm install -D typescript             # Already present
```

**Configuration File:** `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

**Run Commands (to add to package.json scripts):**
```bash
npm run test              # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

## Test File Organization

**Location:** Co-located with source (recommended)
- Place test files adjacent to source: `src/services/conversation.test.ts` next to `src/services/conversation.ts`
- Alternative: `src/__tests__/` directory if preferred, but co-location is clearer

**Naming Pattern:**
- `[module].test.ts` for unit tests
- `[module].integration.test.ts` for integration tests

**Structure:**
```
src/
├── ai/
│   ├── openai.ts
│   └── openai.test.ts
├── services/
│   ├── conversation.ts
│   └── conversation.test.ts
├── whatsapp/
│   ├── session-manager.ts
│   ├── session-manager.test.ts
│   ├── customer-bot.ts
│   └── customer-bot.test.ts
```

## Test Structure Pattern

**Recommended Suite Organization:**

Based on codebase conventions, follow this pattern:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSystemPrompt, generarRespuesta } from './openai';
import type { Farmacia, Mensaje } from '@prisma/client';

describe('openai module', () => {
  describe('buildSystemPrompt()', () => {
    let mockFarmacia: Farmacia;

    beforeEach(() => {
      mockFarmacia = {
        id: 'test-farmacia-1',
        nombre: 'Test Pharmacy',
        direccion: 'Test Address',
        horarios: { semana: '8:00-20:00', sabado: '9:00-14:00', domingo: 'Cerrado' },
        // ... other required fields
      };
    });

    it('should use custom system prompt if provided', () => {
      mockFarmacia.promptSistema = 'Custom prompt';
      const result = buildSystemPrompt(mockFarmacia, false);
      expect(result).toBe('Custom prompt');
    });

    it('should build default prompt when no custom prompt provided', () => {
      mockFarmacia.promptSistema = null;
      const result = buildSystemPrompt(mockFarmacia, false);
      expect(result).toContain(mockFarmacia.nombre);
      expect(result).toContain(mockFarmacia.direccion);
    });

    it('should include menu on first message', () => {
      const result = buildSystemPrompt(mockFarmacia, true);
      expect(result).toContain('PRIMER MENSAJE');
      expect(result).toContain('¿En qué te puedo ayudar?');
    });
  });

  describe('generarRespuesta()', () => {
    let mockFarmacia: Farmacia;
    let mockMessages: Mensaje[];

    beforeEach(() => {
      // Setup mocks
      vi.mocked(OpenAI.Chat.Completions.create).mockResolvedValue({
        choices: [{ message: { content: 'Test response' } }],
      });
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should call OpenAI API with correct message structure', async () => {
      const result = await generarRespuesta(mockFarmacia, [], 'Test message', false);
      expect(result).toBe('Test response');
    });

    it('should return fallback message on API error', async () => {
      vi.mocked(OpenAI.Chat.Completions.create).mockRejectedValue(new Error('API Error'));
      const result = await generarRespuesta(mockFarmacia, [], 'Test message', false);
      expect(result).toContain('tuve un problema');
    });
  });
});
```

## Patterns for Key Modules

### Session Manager Testing

Location: `src/whatsapp/session-manager.test.ts`

**What to Test:**
- `normalize()`: Extract phone numbers and text from various message types
- `startSession()`: Verify session lifecycle and state transitions
- `sendText()` / `sendToJid()`: Verify JID resolution and error handling
- `resolveJid()`: Test @lid vs @s.whatsapp.net handling

**Mocking Strategy:**
- Mock Baileys socket: `vi.mock('@whiskeysockets/baileys')`
- Mock filesystem operations: `vi.mock('fs/promises')`
- Mock Pino logger: Verify logging calls, not output

**Example:**
```typescript
describe('SessionManager', () => {
  describe('normalize()', () => {
    it('should extract text from conversation message', () => {
      const msg = {
        key: { remoteJid: '551199999999@s.whatsapp.net' },
        message: { conversation: 'Hello' },
      };
      const result = sessionManager.normalize(msg);
      expect(result?.text).toBe('Hello');
    });

    it('should ignore group messages', () => {
      const msg = {
        key: { remoteJid: '12345-67890@g.us' },
        message: { conversation: 'Group message' },
      };
      const result = sessionManager.normalize(msg);
      expect(result).toBeNull();
    });

    it('should extract senderPn for phone number', () => {
      const msg = {
        key: { remoteJid: '551199999999@lid', senderPn: '551199999999' },
        message: { conversation: 'Test' },
      };
      const result = sessionManager.normalize(msg);
      expect(result?.phoneNumber).toBe('551199999999');
    });
  });
});
```

### Conversation Service Testing

Location: `src/services/conversation.test.ts`

**What to Test:**
- `handleIncomingMessage()`: Message flow through conversation logic
- `esPedido()`: Keyword detection for orders
- `obtenerOCrearCliente()`: Client creation and update
- `obtenerConversacionActiva()`: Session timeout and state management

**Mocking Strategy:**
- Mock Prisma client: `vi.mock('../db.js')`
- Mock OpenAI: `vi.mock('../ai/openai.js')`
- Create factory functions for test data

**Example:**
```typescript
describe('conversation service', () => {
  describe('handleIncomingMessage()', () => {
    beforeEach(() => {
      vi.mocked(prisma.cliente.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.cliente.create).mockResolvedValue(newClientFixture());
      vi.mocked(prisma.conversacion.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.conversacion.create).mockResolvedValue(newConversationFixture());
      vi.mocked(generarRespuesta).mockResolvedValue('Test response');
    });

    it('should create new client on first message', async () => {
      const result = await handleIncomingMessage(farmaciaFixture(), '551199999999', 'Hola');
      expect(prisma.cliente.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ telefono: '551199999999' }),
      });
    });

    it('should detect order keyword in response', async () => {
      vi.mocked(generarRespuesta).mockResolvedValue('¿Querés que te lo enviemos por delivery?');
      const result = await handleIncomingMessage(farmaciaFixture(), '551199999999', 'Necesito ibuprofeno');
      expect(result.pedidoDetectado).toBe(true);
    });

    it('should not reply if pharmacist has control', async () => {
      // Setup conversation in 'farmaceutico' state
      vi.mocked(prisma.conversacion.findFirst).mockResolvedValue({
        ...newConversationFixture(),
        estado: 'farmaceutico',
      });
      const result = await handleIncomingMessage(farmaciaFixture(), '551199999999', 'Hola');
      expect(result.respuesta).toBeNull();
    });
  });
});
```

### Bot Command Testing

Location: `src/telegram/bot.test.ts`, `src/whatsapp/admin-bot.test.ts`

**What to Test:**
- Command parsing and validation
- Authorization checks (super admin, registered pharmacist)
- State transitions (conversation states)
- Message forwarding and notifications

**Mocking Strategy:**
- Mock Telegraf context: Create test context objects
- Mock Baileys session manager: Mock message sending
- Mock Prisma: All database operations

**Example:**
```typescript
describe('telegram bot', () => {
  describe('/nueva_farmacia command', () => {
    let ctx: Partial<Context>;

    beforeEach(() => {
      ctx = {
        from: { id: config.TELEGRAM_SUPER_ADMIN_ID },
        message: {
          text: '/nueva_farmacia Test Pharmacy|551199999999|Test Address',
        },
        reply: vi.fn(),
      };
    });

    it('should create farmacia with valid input', async () => {
      vi.mocked(prisma.farmacia.create).mockResolvedValue(farmaciaFixture());
      vi.mocked(startPharmacySession).mockResolvedValue(undefined);

      await bot.command('nueva_farmacia')(ctx as any);

      expect(prisma.farmacia.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nombre: 'Test Pharmacy',
          whatsappNumber: '551199999999',
        }),
      });
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('should reject non-super-admin', async () => {
      ctx.from = { id: 999 };
      await bot.use(ctx as any);
      // Should call next without executing handler
    });
  });
});
```

## Fixtures and Factories

**Location:** Create `src/__fixtures__/` or inline in test files

**Pattern:**
```typescript
// src/__fixtures__/farmacias.ts
import type { Farmacia } from '@prisma/client';

export function farmaciaFixture(overrides?: Partial<Farmacia>): Farmacia {
  return {
    id: 'test-farmacia-1',
    nombre: 'Test Pharmacy',
    whatsappNumber: '551199999999',
    direccion: 'Test Address',
    activa: true,
    horarios: {
      semana: '8:00-20:00',
      sabado: '9:00-14:00',
      domingo: 'Cerrado',
    },
    delivery: false,
    zonaDelivery: null,
    obrasSociales: [],
    servicios: [],
    mensajeBienvenida: null,
    promptSistema: null,
    mensajeDerivacion: 'Consultá con el farmacéutico',
    tiempoSesionMinutos: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function clienteFixture(overrides?: Partial<Cliente>): Cliente {
  return {
    id: 'test-cliente-1',
    farmaciaId: 'test-farmacia-1',
    telefono: '551199999999',
    nombre: 'Test Client',
    ultimaInteraccion: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function conversacionFixture(overrides?: Partial<Conversacion>): Conversacion {
  return {
    id: 'test-conv-1',
    clienteId: 'test-cliente-1',
    farmaciaId: 'test-farmacia-1',
    estado: 'bot',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

## Coverage Targets

**Recommended Coverage:**
- Statements: 70%+ (business logic, API handlers)
- Branches: 60%+ (conditional logic, error paths)
- Functions: 70%+ (especially public APIs)
- Lines: 70%+

**View Coverage:**
```bash
npm run test:coverage
# Generates: coverage/index.html
```

**High Priority Coverage Areas:**
- `src/services/conversation.ts`: Message handling, order detection, state management
- `src/whatsapp/session-manager.ts`: Message normalization, JID resolution
- `src/ai/openai.ts`: System prompt building, error handling
- `src/config.ts`: Validation logic

**Lower Priority:**
- HTTP endpoint handlers in `server.ts` (mostly boilerplate)
- Telegram command formatting in `telegram/bot.ts` (UI layer)
- Cleanup service (simple timer logic)

## Test Types

### Unit Tests

**Scope:** Single functions or methods in isolation

**Approach:**
- Mock all external dependencies (Prisma, OpenAI, Baileys)
- Test pure functions (string parsing, validation)
- Test state changes in classes (SessionManager methods)

**Example Targets:**
- `buildSystemPrompt()` - pure function
- `esPedido()` - string analysis
- `normalize()` - message parsing
- Config validation in `config.ts`

### Integration Tests

**Scope:** Multiple modules working together

**Approach:**
- Use in-memory databases if possible (sqlite for Prisma in tests)
- Mock external services (OpenAI, WhatsApp) but test internal integration
- Test full message flows

**Example:**
```typescript
describe('message flow integration', () => {
  it('should handle incoming message from customer through full pipeline', async () => {
    // Create test farmacia and cliente
    const farmacia = await prisma.farmacia.create({ data: farmaciaFixture() });
    const cliente = await prisma.cliente.create({ data: clienteFixture() });

    // Handle message
    const result = await handleIncomingMessage(farmacia, cliente.telefono, 'Necesito ibuprofeno');

    // Verify full flow: client created, conversation created, response generated
    expect(result.respuesta).toBeDefined();
    expect(result.conversacionId).toBeDefined();
    
    // Verify database state
    const savedMsg = await prisma.mensaje.findFirst({
      where: { conversacionId: result.conversacionId },
    });
    expect(savedMsg).toBeDefined();
  });
});
```

### End-to-End Tests (Not Currently Recommended)

**Status:** Not implemented - would require:
- Full WhatsApp/Telegram integration
- Real or heavily mocked external APIs
- Test bot phone numbers
- Complex setup and teardown

**Decision:** Skip E2E tests for now; focus on unit and integration tests for business logic.

## Async Testing

**Pattern (using Vitest):**

```typescript
it('should resolve async operation', async () => {
  const result = await generarRespuesta(farmacia, [], 'Test', false);
  expect(result).toBeDefined();
});

it('should handle promise rejection', async () => {
  vi.mocked(openAIClient.create).mockRejectedValue(new Error('API failed'));
  const result = await generarRespuesta(farmacia, [], 'Test', false);
  expect(result).toContain('problema');
});

it('should wait for async setup', async () => {
  await setupTestDatabase();
  const result = await queryData();
  expect(result).toBeDefined();
});
```

**Async Cleanup:**
```typescript
afterEach(async () => {
  await prisma.farmacia.deleteMany();
  await teardownTestDatabase();
});
```

## Error Testing

**Pattern:**

```typescript
describe('error handling', () => {
  it('should throw on invalid input', () => {
    expect(() => {
      phoneNumber.replace(/[^0-9]/g, ''); // Validate input
    }).not.toThrow();
  });

  it('should catch and handle OpenAI timeout', async () => {
    const timeout = new Error('Request timeout');
    vi.mocked(openAIClient.create).mockRejectedValue(timeout);
    
    const result = await generarRespuesta(farmacia, [], 'Test', false);
    expect(result).toContain('problema');
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle session not ready error', async () => {
    const sessionMgr = new SessionManager();
    expect(() => {
      sessionMgr.sendText('nonexistent', '551199999999', 'Test');
    }).rejects.toThrow('no lista');
  });

  it('should log error context', async () => {
    try {
      await failingOperation();
    } catch (err) {
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err }),
        expect.any(String)
      );
    }
  });
});
```

## Mocking Best Practices

**What to Mock:**
- External APIs (OpenAI, Baileys, Telegraf)
- Database operations (Prisma client)
- File system operations (fs module)
- Time-dependent code (use `vi.useFakeTimers()`)

**What NOT to Mock:**
- Pure functions (test them directly)
- Validation logic (test actual behavior)
- Error types (test real Error objects)
- Core types from dependencies (keep Prisma types real)

**Setup Pattern:**
```typescript
import { vi } from 'vitest';

vi.mock('../ai/openai.js', () => ({
  generarRespuesta: vi.fn(),
  generarMensajeOferta: vi.fn(),
}));

vi.mock('../db.js', () => ({
  prisma: {
    cliente: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    // ... other models
  },
}));
```

---

*Testing analysis: 2026-04-25*

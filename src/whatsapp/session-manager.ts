import path from 'node:path';
import fs from 'node:fs/promises';
import qrcode from 'qrcode-terminal';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type proto,
  type UserFacingSocketConfig,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from '../config.js';
import { logger } from '../logger.js';

/** Datos normalizados de un mensaje entrante. */
export interface IncomingMessage {
  from: string;          // JID del remitente (sin @s.whatsapp.net)
  phoneNumber: string;   // solo dígitos
  text: string;
  isFromMe: boolean;
  raw: proto.IWebMessageInfo;
}

export type MessageHandler = (sessionId: string, msg: IncomingMessage) => Promise<void> | void;

interface SessionEntry {
  sock: WASocket;
  ready: boolean;
}

class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private handlers = new Set<MessageHandler>();
  private qrWaiters = new Map<string, Set<(qr: string) => void>>();
  private qrListeners = new Set<(sessionId: string, qr: string) => void>();

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onQR(listener: (sessionId: string, qr: string) => void) {
    this.qrListeners.add(listener);
    return () => this.qrListeners.delete(listener);
  }

  waitForQR(sessionId: string, timeoutMs = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
      let set = this.qrWaiters.get(sessionId);
      if (!set) {
        set = new Set();
        this.qrWaiters.set(sessionId, set);
      }
      const handler = (qr: string) => {
        clearTimeout(timer);
        set!.delete(handler);
        resolve(qr);
      };
      const timer = setTimeout(() => {
        set!.delete(handler);
        reject(new Error('Timeout esperando QR'));
      }, timeoutMs);
      set.add(handler);
    });
  }

  /**
   * Inicia (o reconecta) una sesión Baileys identificada por `sessionId`.
   * El `sessionId` se usa como nombre de carpeta para el auth state.
   * Si el dispositivo no está emparejado, imprime el QR en consola.
   */
  async startSession(sessionId: string): Promise<WASocket> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!.sock;
    }

    const authDir = path.resolve(config.SESSIONS_DIR, sessionId);
    await fs.mkdir(authDir, { recursive: true });

    const existingFiles = await fs.readdir(authDir).catch(() => [] as string[]);
    const hasCreds = existingFiles.includes('creds.json');
    logger.info(
      { sessionId, authDir, hasCreds, files: existingFiles.length },
      hasCreds
        ? '🔑 Credenciales encontradas — intentando reanudar sin QR'
        : '📱 Sin credenciales previas — se pedirá QR',
    );

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    logger.info(
      { sessionId, registered: state.creds.registered, me: state.creds.me?.id },
      'Estado de auth cargado',
    );

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ session: sessionId }) as UserFacingSocketConfig['logger'],
      browser: ['ChatbotFarmacias', 'Chrome', '1.0'],
      markOnlineOnConnect: false,
    });

    const entry: SessionEntry = { sock, ready: false };
    this.sessions.set(sessionId, entry);

    let savedOnce = false;
    sock.ev.on('creds.update', async () => {
      await saveCreds();
      if (!savedOnce) {
        savedOnce = true;
        const files = await fs.readdir(authDir).catch(() => [] as string[]);
        logger.info({ sessionId, authDir, files: files.length }, '💾 Credenciales persistidas');
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.warn({ sessionId }, 'Escanear QR con WhatsApp para emparejar');
        qrcode.generate(qr, { small: true });
        const waiters = this.qrWaiters.get(sessionId);
        if (waiters) for (const h of waiters) h(qr);
        for (const l of this.qrListeners) {
          try { l(sessionId, qr); } catch (err) { logger.error({ err }, 'QR listener falló'); }
        }
      }

      if (connection === 'open') {
        entry.ready = true;
        logger.info({ sessionId, jid: sock.user?.id }, 'WhatsApp conectado');
      }

      if (connection === 'close') {
        entry.ready = false;
        const reason = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;
        logger.warn({ sessionId, reason, loggedOut }, 'WhatsApp desconectado');
        this.sessions.delete(sessionId);

        const relaunch = async () => {
          if (loggedOut) {
            logger.error(
              { sessionId, authDir },
              '🗑️  Sesión deslogueada (401) — borrando credenciales y generando QR nuevo',
            );
            await fs.rm(authDir, { recursive: true, force: true }).catch((err) =>
              logger.error({ err, authDir }, 'Error borrando carpeta de sesión'),
            );
          }
          await this.startSession(sessionId).catch((err) =>
            logger.error({ err, sessionId }, 'Error reiniciando sesión'),
          );
        };

        setTimeout(() => {
          relaunch().catch((err) => logger.error({ err, sessionId }, 'relaunch falló'));
        }, loggedOut ? 500 : 3000);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        const normalized = this.normalize(m);
        if (!normalized) continue;
        for (const handler of this.handlers) {
          try {
            await handler(sessionId, normalized);
          } catch (err) {
            logger.error({ err, sessionId }, 'Handler de mensaje falló');
          }
        }
      }
    });

    return sock;
  }

  private normalize(m: proto.IWebMessageInfo): IncomingMessage | null {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid) return null;
    // Ignorar grupos y status
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return null;

    const msg = m.message;
    if (!msg) return null;

    const text =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      msg.imageMessage?.caption ??
      msg.videoMessage?.caption ??
      '';

    if (!text) return null;

    const phoneNumber = remoteJid.split('@')[0]!.split(':')[0]!;

    return {
      from: remoteJid,
      phoneNumber,
      text,
      isFromMe: m.key.fromMe ?? false,
      raw: m,
    };
  }

  async sendText(sessionId: string, phoneNumber: string, text: string) {
    const entry = this.sessions.get(sessionId);
    if (!entry || !entry.ready) {
      throw new Error(`Sesión ${sessionId} no lista`);
    }
    const jid = this.toJid(phoneNumber);
    await entry.sock.sendMessage(jid, { text });
  }

  /**
   * Convierte un número (con o sin +, con o sin prefijo 9 argentino) a JID
   * de WhatsApp. WhatsApp usa el número sin el 9 para celulares argentinos.
   */
  private toJid(phoneNumber: string): string {
    let num = phoneNumber.replace(/[^0-9]/g, '');
    // Argentina: el 9 de celular no se incluye en el JID
    if (num.startsWith('549')) num = '54' + num.slice(3);
    return `${num}@s.whatsapp.net`;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  isReady(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.ready ?? false;
  }

  listSessions(): string[] {
    return [...this.sessions.keys()];
  }

  async stopSession(sessionId: string) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    await entry.sock.logout().catch(() => {});
    this.sessions.delete(sessionId);
  }
}

export const sessionManager = new SessionManager();

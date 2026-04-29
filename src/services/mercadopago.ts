import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { config } from '../config.js';
import { logger } from '../logger.js';

// ─── OAuth ────────────────────────────────────────────────────────────────────

export function buildOAuthUrl(farmaciaId: string): string {
  const params = new URLSearchParams({
    client_id: config.MP_CLIENT_ID,
    response_type: 'code',
    platform_id: 'mp',
    state: farmaciaId,
    redirect_uri: `${config.PUBLIC_URL}/auth/mp/callback`,
  });
  return `https://auth.mercadopago.com.ar/authorization?${params}`;
}

interface MPTokenResponse {
  access_token: string;
  refresh_token: string;
  user_id: number;
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.MP_CLIENT_ID,
    client_secret: config.MP_CLIENT_SECRET,
    code,
    redirect_uri: `${config.PUBLIC_URL}/auth/mp/callback`,
  });

  const res = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MP OAuth error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as MPTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: String(data.user_id),
  };
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

export async function crearPreferenciaPago(
  accessToken: string,
  farmaciaId: string,
  farmaNombre: string,
  telefonoCliente: string,
  monto: number,
): Promise<string> {
  const client = new MercadoPagoConfig({ accessToken });
  const preference = new Preference(client);

  const result = await preference.create({
    body: {
      items: [{
        id: `pedido-${Date.now()}`,
        title: `Pedido ${farmaNombre}`,
        quantity: 1,
        unit_price: monto,
        currency_id: 'ARS',
      }],
      // farmaciaId:telefonoCliente para identificar en el webhook
      external_reference: `${farmaciaId}:${telefonoCliente}`,
      notification_url: `${config.PUBLIC_URL}/webhooks/mp`,
    },
  });

  if (!result.init_point) throw new Error('MP no devolvió init_point');
  return result.init_point;
}

export async function obtenerPago(accessToken: string, paymentId: string) {
  const client = new MercadoPagoConfig({ accessToken });
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}

// ─── Validación de webhook ────────────────────────────────────────────────────

export function validarWebhookMP(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  dataId: string | undefined,
  ts: string | undefined,
): boolean {
  if (!config.MP_WEBHOOK_SECRET) return true; // sin secret configurado, dejar pasar (dev)
  if (!xSignature || !ts || !dataId) {
    logger.warn('Webhook MP: faltan headers de firma');
    return false;
  }

  // MP firma: HMAC-SHA256 de "id:{dataId};request-id:{xRequestId};ts:{ts};"
  const { createHmac } = require('crypto');
  const template = `id:${dataId};request-id:${xRequestId ?? ''};ts:${ts};`;
  const expected = createHmac('sha256', config.MP_WEBHOOK_SECRET).update(template).digest('hex');
  const v1 = xSignature.split(',').find((p) => p.startsWith('v1='))?.slice(3);
  if (v1 !== expected) {
    logger.warn({ expected, received: v1 }, 'Webhook MP: firma inválida');
    return false;
  }
  return true;
}

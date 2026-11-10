import { readFile } from 'node:fs/promises';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';

function readResponse(response: IncomingMessage): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on('data', chunk => chunks.push(Buffer.from(chunk)));
    response.on('end', () => resolve({ status: response.statusCode ?? 502, body: Buffer.concat(chunks).toString('utf8') }));
    response.on('error', reject);
  });
}

export async function requestArgoJson<T>(url: URL): Promise<{ status: number; data: T }> {
  const token = process.env.ARGOCD_TOKEN;
  if (!token) throw new Error('ARGOCD_TOKEN is not configured.');
  const caPath = process.env.ARGOCD_CA_CERT_PATH;
  const ca = caPath ? await readFile(caPath) : undefined;
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      // Add trust only for the configured CA; hostname verification remains enabled.
      ...(ca ? { ca } : {}),
      timeout: 10_000,
    }, incoming => { void readResponse(incoming).then(resolve, reject); });
    request.on('timeout', () => request.destroy(new Error('Argo CD request timed out')));
    request.on('error', reject);
    request.end();
  });
  return { status: response.status, data: JSON.parse(response.body) as T };
}

export function argocdBaseUrl() {
  const baseUrl = process.env.ARGOCD_BASE_URL?.replace(/\/+$/, '');
  if (!baseUrl || !process.env.ARGOCD_TOKEN) throw new Error('Argo CD is not configured. Set ARGOCD_BASE_URL and ARGOCD_TOKEN on the server.');
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('Argo CD must use HTTPS outside localhost.');
  }
  return baseUrl;
}

export function argoError(status: number) {
  if (status === 401) return 'Argo CD rejected the token. Check ARGOCD_TOKEN.';
  if (status === 403) return 'The token is valid, but its role does not have permission to read this application.';
  return `Argo CD returned HTTP ${status}.`;
}

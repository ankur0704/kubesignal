import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';

export const dynamic = 'force-dynamic';

type ArgoApplication = {
  metadata?: { name?: string };
  spec?: { project?: string; destination?: { namespace?: string } };
  status?: {
    sync?: { status?: string; revision?: string };
    health?: { status?: string };
    resources?: Array<{ status?: string; kind?: string; name?: string }>;
    operationState?: { finishedAt?: string };
  };
};

const colors = ['violet', 'blue', 'orange', 'green', 'pink'];

function readResponse(response: IncomingMessage): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on('data', chunk => chunks.push(Buffer.from(chunk)));
    response.on('end', () => resolve({ status: response.statusCode ?? 502, body: Buffer.concat(chunks).toString('utf8') }));
    response.on('error', reject);
  });
}

async function requestApplications(url: URL, token: string) {
  const caPath = process.env.ARGOCD_CA_CERT_PATH;
  const ca = caPath ? await readFile(caPath) : undefined;
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      // Supplying a CA adds trust for this upstream only; hostname and certificate
      // verification remain enabled. With no custom CA, Node's normal roots apply.
      ...(ca ? { ca } : {}),
      timeout: 10_000,
    }, response => {
      void readResponse(response).then(resolve, reject);
    });
    request.on('timeout', () => request.destroy(new Error('Argo CD request timed out')));
    request.on('error', reject);
    request.end();
  });
}

export async function GET() {
  const baseUrl = process.env.ARGOCD_BASE_URL?.replace(/\/+$/, '');
  const token = process.env.ARGOCD_TOKEN;

  if (!baseUrl || !token) {
    return NextResponse.json({ error: 'Argo CD is not configured. Set ARGOCD_BASE_URL and ARGOCD_TOKEN on the server.' }, { status: 503 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    return NextResponse.json({ error: 'ARGOCD_BASE_URL must be a valid URL.' }, { status: 500 });
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
    return NextResponse.json({ error: 'Argo CD must use HTTPS outside localhost.' }, { status: 500 });
  }

  try {
    const applicationsUrl = new URL(`${baseUrl}/api/v1/applications`);
    // Project role tokens are scoped to a project; explicitly scope the list call
    // so Argo CD can authorize it without exposing applications from other projects.
    applicationsUrl.searchParams.append('projects', 'default');
    const response = await requestApplications(applicationsUrl, token);

    if (response.status < 200 || response.status >= 300) {
      if (response.status === 401) {
        return NextResponse.json({ error: 'Argo CD rejected the token. Check that ARGOCD_TOKEN is the newly generated role token.' }, { status: 502 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: 'The token is valid, but the role cannot read applications in the default project. Check its applications/get policy on default/*.' }, { status: 502 });
      }
      return NextResponse.json({ error: `Argo CD returned HTTP ${response.status}.` }, { status: response.status });
    }

    const payload = JSON.parse(response.body) as { items?: ArgoApplication[] };
    const applications = (payload.items ?? []).map((app, index) => {
      const name = app.metadata?.name ?? 'unnamed-application';
      const resources = app.status?.resources ?? [];
      const sync = app.status?.sync?.status ?? 'Unknown';
      const health = app.status?.health?.status ?? 'Unknown';
      const color = colors[index % colors.length];
      return {
        name,
        namespace: app.spec?.destination?.namespace ?? 'default',
        project: app.spec?.project ?? 'default',
        sync: sync === 'Synced' ? 'Synced' : sync === 'OutOfSync' ? 'Out of sync' : 'Unknown',
        health: health === 'Healthy' ? 'Healthy' : health === 'Progressing' ? 'Progressing' : health === 'Degraded' || health === 'Missing' ? 'Degraded' : 'Unknown',
        resources: resources.length,
        drift: resources.filter(resource => resource.status === 'OutOfSync').length,
        revision: app.status?.sync?.revision?.slice(0, 7) ?? 'unknown',
        updated: app.status?.operationState?.finishedAt ? new Date(app.status.operationState.finishedAt).toLocaleString() : '—',
        icon: name.charAt(0).toUpperCase(),
        color,
      };
    });

    return NextResponse.json({ applications, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const timedOut = error instanceof Error && /timed out/i.test(error.message);
    const cause = error instanceof Error ? error.cause : undefined;
    const diagnostic = cause instanceof Error ? cause.message : error instanceof Error ? error.message : 'Unknown connection error';
    return NextResponse.json({
      error: timedOut ? 'Timed out connecting to Argo CD.' : 'Could not connect to Argo CD. Check the server URL and network access.',
      ...(process.env.NODE_ENV !== 'production' ? { diagnostic } : {}),
    }, { status: 502 });
  }
}

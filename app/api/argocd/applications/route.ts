import { NextResponse } from 'next/server';

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
    const response = await fetch(`${baseUrl}/api/v1/applications`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 502 : response.status;
      return NextResponse.json({ error: response.status === 401 || response.status === 403
        ? 'Argo CD rejected the configured token or it lacks permission to list applications.'
        : `Argo CD returned HTTP ${response.status}.` }, { status });
    }

    const payload = await response.json() as { items?: ArgoApplication[] };
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
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return NextResponse.json({ error: timedOut ? 'Timed out connecting to Argo CD.' : 'Could not connect to Argo CD. Check the server URL and network access.' }, { status: 502 });
  }
}

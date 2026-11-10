import { NextResponse } from 'next/server';
import { argoError, argocdBaseUrl, requestArgoJson } from '../../../../lib/argocd';

export const dynamic = 'force-dynamic';

type ArgoApplication = {
  metadata?: { name?: string; namespace?: string };
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
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(argocdBaseUrl());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Argo CD configuration.' }, { status: 500 });
  }

  try {
    const applicationsUrl = new URL(`${parsedUrl.origin}${parsedUrl.pathname.replace(/\/$/, '')}/api/v1/applications`);
    // Project role tokens are scoped to a project; explicitly scope the list call
    // so Argo CD can authorize it without exposing applications from other projects.
    applicationsUrl.searchParams.append('projects', 'default');
    const response = await requestArgoJson<{ items?: ArgoApplication[] }>(applicationsUrl);

    if (response.status < 200 || response.status >= 300) return NextResponse.json({ error: argoError(response.status) }, { status: 502 });

    const payload = response.data;
    const applications = (payload.items ?? []).map((app, index) => {
      const name = app.metadata?.name ?? 'unnamed-application';
      const resources = app.status?.resources ?? [];
      const sync = app.status?.sync?.status ?? 'Unknown';
      const health = app.status?.health?.status ?? 'Unknown';
      const color = colors[index % colors.length];
      return {
        name,
        appNamespace: app.metadata?.namespace ?? 'argocd',
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

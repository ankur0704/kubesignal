import { NextResponse } from 'next/server';
import { argoError, argocdBaseUrl, requestArgoJson } from '../../../../lib/argocd';

export const dynamic = 'force-dynamic';

type App = { metadata?: { name?: string; namespace?: string }; spec?: { project?: string } };
type Resource = { kind?: string; liveState?: string | Record<string, unknown>; targetState?: string | Record<string, unknown> };
type State = Record<string, any>;
type Metrics = { name: string; podsReady: number; totalPods: number; restarts: number; desiredReplicas: number; readyReplicas: number; replicaMismatches: number; failedJobs: number };

function state(value: Resource['liveState']): State {
  if (!value) return {};
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return parsed && typeof parsed === 'object' ? parsed as State : {};
}

function applicationMetrics(name: string, resources: Resource[]): Metrics {
  const result: Metrics = { name, podsReady: 0, totalPods: 0, restarts: 0, desiredReplicas: 0, readyReplicas: 0, replicaMismatches: 0, failedJobs: 0 };
  for (const resource of resources) {
    const live = state(resource.liveState);
    const target = state(resource.targetState);
    if (resource.kind === 'Pod') {
      const phase = live.status?.phase;
      if (phase !== 'Succeeded') {
        result.totalPods++;
        if (live.status?.conditions?.some((condition: any) => condition.type === 'Ready' && condition.status === 'True')) result.podsReady++;
      }
      for (const container of [...(live.status?.containerStatuses ?? []), ...(live.status?.initContainerStatuses ?? [])]) {
        result.restarts += Number(container.restartCount) || 0;
      }
    } else if (resource.kind === 'Deployment' || resource.kind === 'StatefulSet') {
      const desired = Number(target.spec?.replicas ?? 1);
      const ready = Number(live.status?.readyReplicas ?? 0);
      result.desiredReplicas += desired;
      result.readyReplicas += ready;
      if (ready !== desired) result.replicaMismatches++;
    } else if (resource.kind === 'DaemonSet') {
      const desired = Number(live.status?.desiredNumberScheduled ?? 0);
      const ready = Number(live.status?.numberReady ?? 0);
      result.desiredReplicas += desired;
      result.readyReplicas += ready;
      if (ready !== desired) result.replicaMismatches++;
    } else if (resource.kind === 'Job') {
      result.failedJobs += Number(live.status?.failed ?? 0);
    }
  }
  return result;
}

export async function GET() {
  let baseUrl: string;
  try {
    baseUrl = argocdBaseUrl();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Argo CD configuration.' }, { status: 500 });
  }

  try {
    const appsUrl = new URL(`${baseUrl}/api/v1/applications`);
    appsUrl.searchParams.set('projects', 'default');
    const appsResponse = await requestArgoJson<{ items?: App[] }>(appsUrl);
    if (appsResponse.status < 200 || appsResponse.status >= 300) return NextResponse.json({ error: argoError(appsResponse.status) }, { status: 502 });

    const apps = appsResponse.data.items ?? [];
    const perApplication: Metrics[] = [];
    // Keep Argo CD API pressure bounded while collecting per-application resources.
    for (let start = 0; start < apps.length; start += 4) {
      const batch = apps.slice(start, start + 4);
      const batchResults = await Promise.all(batch.map(async app => {
        const name = app.metadata?.name;
        if (!name) return { metrics: applicationMetrics('unnamed-application', []), error: false };
        const url = new URL(`${baseUrl}/api/v1/applications/${encodeURIComponent(name)}/managed-resources`);
        url.searchParams.set('appNamespace', app.metadata?.namespace ?? 'argocd');
        url.searchParams.set('project', app.spec?.project ?? 'default');
        url.searchParams.set('fields', 'kind,liveState,targetState');
        const response = await requestArgoJson<{ items?: Resource[] }>(url);
        if (response.status < 200 || response.status >= 300) throw new Error(argoError(response.status));
        return { metrics: applicationMetrics(name, response.data.items ?? []), error: false };
      }));
      perApplication.push(...batchResults.map(result => result.metrics));
    }

    return NextResponse.json({
      applications: perApplication,
      totals: perApplication.reduce((total, item) => ({
        podsReady: total.podsReady + item.podsReady,
        totalPods: total.totalPods + item.totalPods,
        restarts: total.restarts + item.restarts,
        desiredReplicas: total.desiredReplicas + item.desiredReplicas,
        readyReplicas: total.readyReplicas + item.readyReplicas,
        replicaMismatches: total.replicaMismatches + item.replicaMismatches,
        failedJobs: total.failedJobs + item.failedJobs,
      }), { podsReady: 0, totalPods: 0, restarts: 0, desiredReplicas: 0, readyReplicas: 0, replicaMismatches: 0, failedJobs: 0 }),
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load pod health from Argo CD.' }, { status: 502 });
  }
}

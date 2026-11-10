import { NextResponse } from 'next/server';
import { argoError, argocdBaseUrl, requestArgoJson } from '../../../../../../lib/argocd';

export const dynamic = 'force-dynamic';

type JsonObject = Record<string, unknown>;
type ManagedResource = {
  group?: string;
  kind?: string;
  namespace?: string;
  name?: string;
  targetState?: string | JsonObject;
  liveState?: string | JsonObject;
  normalizedLiveState?: string | JsonObject;
};

function parseState(state: string | JsonObject | undefined): JsonObject {
  if (!state) return {};
  const parsed = typeof state === 'string' ? JSON.parse(state) : state;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : {};
}

const sensitiveKey = /password|token|secret|private.?key|credential|api.?key/i;
const generatedFields = new Set([
  '/metadata/creationTimestamp',
  '/metadata/generation',
  '/metadata/managedFields',
  '/metadata/resourceVersion',
  '/metadata/uid',
  '/metadata/annotations/kubectl.kubernetes.io~1last-applied-configuration',
  '/metadata/annotations/deployment.kubernetes.io~1revision',
  '/spec/clusterIP',
  '/spec/clusterIPs',
  '/spec/ipFamilies',
  '/spec/ipFamilyPolicy',
]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function isDefaultedField(path: string, live: unknown) {
  if (generatedFields.has(path)) return true;
  const exactDefaults: Record<string, unknown> = {
    '/spec/internalTrafficPolicy': 'Cluster',
    '/spec/sessionAffinity': 'None',
    '/spec/type': 'ClusterIP',
    '/spec/progressDeadlineSeconds': 600,
    '/spec/template/spec/dnsPolicy': 'ClusterFirst',
    '/spec/template/spec/restartPolicy': 'Always',
    '/spec/template/spec/schedulerName': 'default-scheduler',
    '/spec/template/spec/terminationGracePeriodSeconds': 30,
    '/spec/template/spec/securityContext': {},
  };
  if (Object.hasOwn(exactDefaults, path) && canonical(live) === canonical(exactDefaults[path])) return true;
  if (/^\/spec\/(ports\/\d+|template\/spec\/(containers|initContainers|ephemeralContainers)\/\d+\/ports\/\d+)\/protocol$/.test(path) && live === 'TCP') return true;
  if (/^\/spec\/template\/spec\/(containers|initContainers|ephemeralContainers)\/\d+\/imagePullPolicy$/.test(path) && live === 'IfNotPresent') return true;
  if (/^\/spec\/template\/spec\/(containers|initContainers|ephemeralContainers)\/\d+\/terminationMessage(Path|Policy)$/.test(path) &&
      (path.endsWith('terminationMessagePath') ? live === '/dev/termination-log' : live === 'File')) return true;
  if (/^\/spec\/template\/spec\/(containers|initContainers|ephemeralContainers)\/\d+\/(resources|securityContext)$/.test(path) && canonical(live) === '{}') return true;
  if (path === '/spec/strategy' && canonical(live) === canonical({ type: 'RollingUpdate', rollingUpdate: { maxUnavailable: '25%', maxSurge: '25%' } })) return true;
  return false;
}

function collectChanges(desired: unknown, live: unknown, path = '', changes: Array<{ path: string; desired: string; live: string }> = [], secretResource = false, suppressed = { count: 0 }): typeof changes {
  if (changes.length >= 100 || canonical(desired) === canonical(live)) return changes;
  if (generatedFields.has(path) || desired === undefined && isDefaultedField(path, live)) { suppressed.count++; return changes; }
  if (path && (sensitiveKey.test(path.split('/').pop() ?? '') || secretResource && /^\/(data|stringData)$/.test(path))) {
    changes.push({ path, desired: '[REDACTED]', live: '[REDACTED]' });
    return changes;
  }
  if (desired && live && typeof desired === 'object' && typeof live === 'object' && !Array.isArray(desired) && !Array.isArray(live)) {
    const desiredObject = desired as JsonObject;
    const liveObject = live as JsonObject;
    const keys = [...new Set([...Object.keys(desiredObject), ...Object.keys(liveObject)])].sort();
    for (const key of keys) {
      const childPath = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      collectChanges(desiredObject[key], liveObject[key], childPath, changes, secretResource, suppressed);
      if (changes.length >= 100) break;
    }
    return changes;
  }
  if (Array.isArray(desired) && Array.isArray(live)) {
    for (let index = 0; index < Math.max(desired.length, live.length); index++) {
      collectChanges(desired[index], live[index], `${path}/${index}`, changes, secretResource, suppressed);
      if (changes.length >= 100) break;
    }
    return changes;
  }
  const format = (value: unknown) => value === undefined ? '(missing)' : typeof value === 'string' ? value : JSON.stringify(value);
  changes.push({ path: path || '/', desired: format(desired), live: format(live) });
  return changes;
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  let baseUrl: string;
  try {
    baseUrl = argocdBaseUrl();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Argo CD configuration.' }, { status: 500 });
  }

  const { name } = await params;
  const query = new URL(request.url).searchParams;
  const required = ['name', 'kind', 'namespace', 'group', 'appNamespace', 'project'];
  const values = Object.fromEntries(required.map(key => [key, query.get(key) ?? '']));
  if (!values.name || !values.kind || !values.appNamespace || !values.project) {
    return NextResponse.json({ error: 'Resource identity is incomplete.' }, { status: 400 });
  }

  const url = new URL(`${baseUrl}/api/v1/applications/${encodeURIComponent(name)}/managed-resources`);
  for (const key of required) url.searchParams.set(key, values[key]);

  try {
    const response = await requestArgoJson<{ items?: ManagedResource[] }>(url);
    if (response.status < 200 || response.status >= 300) return NextResponse.json({ error: argoError(response.status) }, { status: 502 });
    const item = (response.data.items ?? []).find(resource => resource.name === values.name &&
      resource.kind === values.kind && (resource.group ?? '') === values.group && (resource.namespace ?? '') === values.namespace);
    if (!item) return NextResponse.json({ error: 'Argo CD did not return state for this managed resource.' }, { status: 404 });

    const desired = parseState(item.targetState);
    const live = parseState(item.normalizedLiveState ?? item.liveState);
    const suppressed = { count: 0 };
    const changes = collectChanges(desired, live, '', [], desired.kind === 'Secret' || live.kind === 'Secret', suppressed);
    return NextResponse.json({
      resource: { name: item.name, kind: item.kind, namespace: item.namespace ?? '', group: item.group ?? '' },
      changes,
      suppressedCount: suppressed.count,
      truncated: changes.length >= 100,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    return NextResponse.json({
      error: 'Could not load the resource diff from Argo CD.',
      ...(process.env.NODE_ENV !== 'production' ? { diagnostic: cause instanceof Error ? cause.message : error instanceof Error ? error.message : 'Unknown error' } : {}),
    }, { status: 502 });
  }
}

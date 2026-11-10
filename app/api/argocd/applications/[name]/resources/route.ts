import { NextResponse } from 'next/server';
import { argoError, argocdBaseUrl, requestArgoJson } from '../../../../../../lib/argocd';

export const dynamic = 'force-dynamic';

type ResourceStatus = { group?: string; kind?: string; namespace?: string; name?: string; status?: string; health?: { status?: string; message?: string } };
type AppResponse = { status?: { resources?: ResourceStatus[] } };
type TreeNode = { group?: string; kind?: string; namespace?: string; name?: string; health?: { status?: string; message?: string }; parentRefs?: Array<{ kind?: string; name?: string }> };
type TreeResponse = { nodes?: TreeNode[] };

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  let baseUrl: string;
  try {
    baseUrl = argocdBaseUrl();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Argo CD configuration.' }, { status: 500 });
  }

  const { name } = await params;
  const query = new URL(request.url).searchParams;
  const project = query.get('project') ?? 'default';
  const appNamespace = query.get('appNamespace') ?? 'argocd';
  const applicationUrl = new URL(`${baseUrl}/api/v1/applications/${encodeURIComponent(name)}`);
  applicationUrl.searchParams.set('project', project);
  applicationUrl.searchParams.set('appNamespace', appNamespace);
  const treeUrl = new URL(`${baseUrl}/api/v1/applications/${encodeURIComponent(name)}/resource-tree`);
  treeUrl.searchParams.set('project', project);
  treeUrl.searchParams.set('appNamespace', appNamespace);

  try {
    const [application, tree] = await Promise.all([
      requestArgoJson<AppResponse>(applicationUrl),
      requestArgoJson<TreeResponse>(treeUrl),
    ]);
    for (const response of [application, tree]) {
      if (response.status < 200 || response.status >= 300) {
        return NextResponse.json({ error: argoError(response.status) }, { status: 502 });
      }
    }

    const statuses = application.data.status?.resources ?? [];
    const resources = (tree.data.nodes ?? []).map(node => {
      const status = statuses.find(item => item.kind === node.kind && item.name === node.name &&
        (item.group ?? '') === (node.group ?? '') && (item.namespace ?? '') === (node.namespace ?? ''));
      return {
        group: node.group ?? '',
        kind: node.kind ?? 'Resource',
        namespace: node.namespace ?? '',
        name: node.name ?? 'unnamed-resource',
        sync: status?.status === 'Synced' ? 'Synced' : status?.status === 'OutOfSync' ? 'Out of sync' : 'Unknown',
        health: node.health?.status ?? status?.health?.status ?? 'Unknown',
        message: node.health?.message ?? status?.health?.message ?? '',
        parent: node.parentRefs?.[0]?.name ?? '',
      };
    });

    return NextResponse.json({ resources }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    return NextResponse.json({
      error: 'Could not load application resources from Argo CD.',
      ...(process.env.NODE_ENV !== 'production' ? { diagnostic: cause instanceof Error ? cause.message : error instanceof Error ? error.message : 'Unknown error' } : {}),
    }, { status: 502 });
  }
}

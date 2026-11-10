'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown, CircleHelp, Clock3, Cloud, Code2, Command, ExternalLink, GitBranch, Layers3, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal, Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Terminal, X } from 'lucide-react';

type AppRow = { name: string; appNamespace: string; namespace: string; project: string; sync: 'Synced' | 'Out of sync' | 'Unknown'; health: 'Healthy' | 'Degraded' | 'Progressing' | 'Unknown'; resources: number; drift: number; revision: string; updated: string; icon: string; color: string };
type ResourceRow = { group: string; kind: string; namespace: string; name: string; sync: string; health: string; message: string; parent: string };
type DiffEntry = { path: string; desired: string; live: string };
type WorkloadMetrics = { name: string; podsReady: number; totalPods: number; restarts: number; desiredReplicas: number; readyReplicas: number; replicaMismatches: number; failedJobs: number };
type HealthResponse = { applications: WorkloadMetrics[]; totals: Omit<WorkloadMetrics, 'name'>; fetchedAt: string };

function Status({ value }: { value: string }) {
  const cls = value === 'Synced' || value === 'Healthy' ? 'good' : value === 'Progressing' ? 'progress' : 'bad';
  return <span className={`status ${cls}`}><i />{value}</span>;
}

function InfoTip({ text }: { text: string }) {
  return <button className="info-tip" type="button" aria-label={text} title={text}>i</button>;
}

export default function Home() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [workloadHealth, setWorkloadHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState('');
  const [active, setActive] = useState('Overview');
  const [filter, setFilter] = useState('All applications');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AppRow | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState('');
  const [selectedResource, setSelectedResource] = useState<ResourceRow | null>(null);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [diffSuppressedCount, setDiffSuppressedCount] = useState(0);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [diffTruncated, setDiffTruncated] = useState(false);
  const [notice, setNotice] = useState('');
  const shown = apps.filter(a => (filter === 'All applications' || a.sync === 'Out of sync') && `${a.name} ${a.namespace} ${a.project}`.toLowerCase().includes(query.toLowerCase()));
  const driftedCount = apps.reduce((sum, app) => sum + app.drift, 0);
  const healthyCount = apps.filter(app => app.health === 'Healthy').length;
  const outOfSyncCount = apps.filter(app => app.sync === 'Out of sync').length;
  const selectedWorkload = selected ? workloadHealth?.applications.find(item => item.name === selected.name) : undefined;
  async function refresh() {
    setLoading(true);
    try {
      const [response, healthResponse] = await Promise.all([
        fetch('/api/argocd/applications', { cache: 'no-store' }),
        fetch('/api/argocd/health', { cache: 'no-store' }),
      ]);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load applications.');
      setApps(payload.applications);
      setFetchedAt(payload.fetchedAt);
      setConnectionError('');
      const healthPayload = await healthResponse.json();
      if (healthResponse.ok) { setWorkloadHealth(healthPayload); setHealthError(''); }
      else { setWorkloadHealth(null); setHealthError(healthPayload.error ?? 'Could not load pod health.'); }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not load applications.');
      setWorkloadHealth(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!selected) { setResources([]); setResourcesError(''); return; }
    let cancelled = false;
    setResourcesLoading(true);
    setResourcesError('');
    fetch(`/api/argocd/applications/${encodeURIComponent(selected.name)}/resources?appNamespace=${encodeURIComponent(selected.appNamespace)}&project=${encodeURIComponent(selected.project)}`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Could not load resource tree.');
        return payload.resources as ResourceRow[];
      })
      .then(value => { if (!cancelled) setResources(value); })
      .catch(error => { if (!cancelled) setResourcesError(error instanceof Error ? error.message : 'Could not load resource tree.'); })
      .finally(() => { if (!cancelled) setResourcesLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);
  useEffect(() => {
    if (!selected || !selectedResource) { setDiffEntries([]); setDiffError(''); setDiffSuppressedCount(0); setDiffTruncated(false); return; }
    let cancelled = false;
    setDiffLoading(true);
    setDiffError('');
    const params = new URLSearchParams({ name: selectedResource.name, kind: selectedResource.kind, namespace: selectedResource.namespace, group: selectedResource.group, appNamespace: selected.appNamespace, project: selected.project });
    fetch(`/api/argocd/applications/${encodeURIComponent(selected.name)}/diff?${params}`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Could not load resource diff.');
        return payload as { changes: DiffEntry[]; truncated: boolean; suppressedCount: number };
      })
      .then(payload => { if (!cancelled) { setDiffEntries(payload.changes); setDiffTruncated(payload.truncated); setDiffSuppressedCount(payload.suppressedCount); } })
      .catch(error => { if (!cancelled) setDiffError(error instanceof Error ? error.message : 'Could not load resource diff.'); })
      .finally(() => { if (!cancelled) setDiffLoading(false); });
    return () => { cancelled = true; };
  }, [selected, selectedResource]);
  const toggleFilter = () => setFilter(filter === 'All applications' ? 'Out of sync' : 'All applications');

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={19} strokeWidth={2.5}/></div><span>kubesignal</span><span className="beta">BETA</span></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="workspace"><div className="workspace-icon"><Layers3 size={16}/></div><span><b>Acme engineering</b><small>Free plan</small></span><ChevronDown size={15}/></button>
      <div className="nav-section">MONITOR</div>
      <nav>{[['Overview', LayoutDashboard], ['Applications', Boxes], ['Drift events', GitBranch], ['Activity log', Clock3]].map(([label, Icon]: any) => <button key={label} onClick={() => setActive(label)} className={`nav-item ${active === label ? 'selected' : ''}`}><Icon size={17}/><span>{label}</span>{label === 'Drift events' && <em>4</em>}</button>)}</nav>
      <div className="nav-section cluster-label">YOUR CLUSTERS <button onClick={() => setNotice('Cluster setup will be available when the Argo CD connector is configured.')}><Plus size={14}/></button></div>
      <button className="cluster active-cluster"><span className="cluster-dot"/><span>production-us-east</span><span className="cluster-state">●</span></button>
      <button className="cluster"><span className="cluster-dot muted"/><span>staging-us-east</span></button>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={16}/></div><div><b>Need a hand?</b><p>Check out our quick start guide.</p><button onClick={() => setNotice('Quick start guide: connect your Argo CD instance, then refresh the application list.')}>View guide <ArrowRight size={12}/></button></div></div><button className="nav-item"><Settings2 size={17}/><span>Settings</span></button><div className="profile"><div className="avatar">JD</div><span><b>Jordan Davis</b><small>jordan@acme.io</small></span><MoreHorizontal size={18}/></div></div>
    </aside>

    <section className="content">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> Clusters <span>/</span> <b>production-us-east</b></div><div className="top-actions"><div className="connected"><span style={{background: connectionError ? '#d76b62' : loading ? '#d4a14f' : '#45b27a'}}/>{connectionError ? 'Argo CD unavailable' : loading ? 'Connecting…' : 'Argo CD connected'}<ChevronDown size={13}/></div><button className="icon-button" aria-label="Notifications" onClick={() => setNotice('You’re all caught up.')}><Bell size={17}/><i/></button><button className="icon-button" aria-label="Help"><CircleHelp size={17}/></button><div className="top-avatar">JD</div></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow"><Cloud size={14}/> CLUSTER OVERVIEW <span className="live-pill"><i/> {connectionError ? 'OFFLINE' : loading ? 'LOADING' : 'LIVE'}</span></div><h1>production-us-east</h1><p className="subtitle">A clear view of what’s running and what needs attention.</p></div><div className="heading-actions"><span className="synced-time"><RefreshCw size={13}/> {fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}` : 'Not synced'}</span><button className="button secondary" onClick={refresh} disabled={loading}><RefreshCw size={14}/> {loading ? 'Loading' : 'Refresh'}</button><button className="button primary" onClick={() => setNotice('Read-only mode is on. No cluster changes can be made from KubeSignal.')}><LockKeyhole size={14}/> Read-only</button></div></div>
        {connectionError && <div className="connection-banner"><AlertTriangle size={15}/><span><b>Argo CD data isn’t available.</b> {connectionError} Configure the server environment variables and refresh.</span></div>}

        <div className="summary-grid">
          <div className="summary-card health-card"><div className="card-label">ARGO CD APPLICATION HEALTH <InfoTip text="Count of applications Argo CD currently reports as Healthy; this is not pod-level telemetry."/></div><div className="health-row"><div className="score-ring" style={{background: `conic-gradient(#5ca77d 0deg ${apps.length ? healthyCount / apps.length * 360 : 0}deg,#f1eee9 0deg)`}}><div><strong>{healthyCount}</strong><small>/{apps.length}</small></div></div><div className="health-copy"><b>{loading ? 'Loading status' : connectionError ? 'Unavailable' : `${healthyCount} healthy`}</b><p>Argo CD app health<br/>status only.</p></div></div><div className="card-foot"><span>{apps.filter(app => app.health === 'Degraded').length} degraded</span><span>·</span><span>{apps.filter(app => app.health === 'Progressing').length} progressing</span></div></div>
          <div className="summary-card"><div className="card-label">APPLICATIONS <InfoTip text="Number of Argo CD applications returned for the configured project scope."/></div><div className="metric-line"><strong>{apps.length}</strong></div><div className="metric-caption">Argo CD applications</div><div className="card-foot"><span className="green-dot"/> {healthyCount} healthy <span className="sep">·</span><span className="red-dot"/> {outOfSyncCount} out of sync</div></div>
          <div className="summary-card"><div className="card-label">DRIFTED RESOURCES <InfoTip text="Resources Argo CD reports as OutOfSync across the returned applications."/></div><div className="metric-line"><strong>{driftedCount}</strong></div><div className="metric-caption">resources reported out of sync</div><div className="card-foot"><span>{driftedCount} detected</span><span>by Argo CD</span></div></div>
          <div className="summary-card"><div className="card-label">KUBERNETES POD HEALTH <InfoTip text="Aggregated from live Pod and controller states reported by Argo CD managed resources."/></div><div className="metric-line"><strong>{loading || !workloadHealth ? '—' : `${workloadHealth.totals.podsReady}/${workloadHealth.totals.totalPods}`}</strong></div><div className="metric-caption">{healthError || (workloadHealth ? 'pods Ready' : 'Waiting for workload health')}</div><div className="card-foot"><span>{workloadHealth?.totals.restarts ?? 0} restarts</span><span className="sep">·</span><span>{workloadHealth?.totals.replicaMismatches ?? 0} replica mismatches</span></div></div>
        </div>

        <div className="section-heading"><div><div className="title-row"><h2>Applications <InfoTip text="Argo CD applications in the configured project scope. Select a row to inspect its resources."/></h2><span className="count">{apps.length}</span></div><p>Monitor sync status, health, and configuration drift.</p></div><button className="button secondary small" onClick={() => setNotice('Applications are loaded from the configured Argo CD instance.')}><Plus size={14}/> Add application</button></div>
        <div className="table-card"><div className="table-toolbar"><div className="tabs"><button className={filter === 'All applications' ? 'tab active' : 'tab'} onClick={() => setFilter('All applications')}>All applications <span>{apps.length}</span></button><button className={filter === 'Out of sync' ? 'tab active' : 'tab'} onClick={() => setFilter(filter === 'Out of sync' ? 'All applications' : 'Out of sync')}>Out of sync <span className="tab-alert">{outOfSyncCount}</span></button></div><div className="table-controls"><label className="search"><Search size={14}/><input placeholder="Search applications..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label><button className={`filter-btn ${filter === 'Out of sync' ? 'filter-on' : ''}`} onClick={toggleFilter}><SlidersHorizontal size={14}/> Filters{filter === 'Out of sync' && <span>1</span>}</button><button className="icon-button plain" aria-label="More options" onClick={() => setNotice('Table options: sort by name, health, or drift count.')}><MoreHorizontal size={18}/></button></div></div>
          <div className="table-scroll"><table><thead><tr><th>APPLICATION <InfoTip text="Argo CD application name, destination namespace, and project."/></th><th>SYNC STATUS <InfoTip text="Whether Argo CD considers live resources synchronized with the desired revision."/></th><th>HEALTH <InfoTip text="Argo CD application health summary; not a direct pod readiness percentage."/></th><th>RESOURCES <InfoTip text="Number of managed resources reported by Argo CD for this application."/></th><th>DRIFT <InfoTip text="Count of managed resources Argo CD reports as OutOfSync."/></th><th>LAST OPERATION <InfoTip text="Last completed Argo CD operation time and abbreviated Git revision."/> <ChevronDown size={11}/></th><th/></tr></thead><tbody>{shown.map(app => <tr key={app.name} onClick={() => setSelected(app)}><td><div className="app-name"><div className={`app-icon ${app.color}`}>{app.icon}</div><div><b>{app.name}</b><small>{app.namespace} <span>·</span> {app.project}</small></div></div></td><td><Status value={app.sync}/></td><td><Status value={app.health}/></td><td><span className="resource-number"><Boxes size={13}/>{app.resources}</span></td><td>{app.drift ? <span className="drift-number"><AlertTriangle size={13}/>{app.drift} {app.drift === 1 ? 'change' : 'changes'}</span> : <span className="no-drift">—</span>}</td><td><div className="sync-revision">{app.updated}<small><GitBranch size={11}/>{app.revision}</small></div></td><td><button className="row-more" aria-label="Open application details"><ArrowRight size={15}/></button></td></tr>)}{shown.length === 0 && <tr><td colSpan={7} className="empty">{loading ? 'Loading applications…' : connectionError ? 'Connect to Argo CD to load applications.' : 'No applications match this search.'}</td></tr>}</tbody></table></div>
          <div className="table-footer"><span>Showing <b>{shown.length ? 1 : 0}–{shown.length}</b> of <b>{apps.length}</b> applications</span><div><button disabled>Previous</button><button className="page-number">1</button><button disabled>Next <ArrowRight size={12}/></button></div></div></div>

        <div className="lower-grid"><div className="activity-card"><div className="lower-heading"><div><h2>Activity history</h2><p>Event persistence is not implemented yet.</p></div></div><div className="no-diff"><Clock3 size={17}/>Historical changes will appear here after event storage is added.</div></div><div className="insight-card"><div className="insight-top"><div className="insight-spark"><Sparkles size={15}/></div><span>LIVE SUMMARY</span></div><h3>{apps.length ? `${outOfSyncCount} of ${apps.length} apps out of sync` : 'Waiting for Argo CD data'}</h3><p>{apps.length ? `${driftedCount} resources are reported out of sync across the listed applications.` : 'Connect to Argo CD to load application status.'}</p><div className="insight-orb orb-one"/><div className="insight-orb orb-two"/></div></div>
        <footer className="footer"><span><span className="footer-dot" style={{background: connectionError ? '#d76b62' : loading ? '#d4a14f' : '#55b37a'}}/> {connectionError ? 'Argo CD unavailable' : loading ? 'Checking Argo CD' : 'Argo CD reachable'}</span><span>{fetchedAt ? `Last fetched ${new Date(fetchedAt).toLocaleTimeString()}` : 'No successful fetch yet'} <span className="footer-sep">·</span> <button onClick={refresh}>Refresh status</button></span><span>Read-only integration</span></footer>
      </div>
    </section>
    {notice && <div className="toast"><Check size={15}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}>
      <section className="detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-top"><div className={`app-icon ${selected.color}`}>{selected.icon}</div><div><div className="modal-kicker">APPLICATION <span>·</span> {selected.namespace}</div><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><X size={17}/></button></div>
        <div className="modal-status"><Status value={selected.sync}/><Status value={selected.health}/></div>
        <div className="detail-grid"><div><small>PROJECT</small><b>{selected.project}</b></div><div><small>RESOURCES</small><b>{selected.resources} tracked</b></div><div><small>LAST OPERATION</small><b>{selected.updated}</b></div><div><small>GIT REVISION</small><b className="mono"><GitBranch size={12}/>{selected.revision}</b></div></div>
        <div className="workload-panel"><div className="workload-title">Live workload health <InfoTip text="Pod readiness and restarts plus controller desired-versus-ready replica counts, read through Argo CD."/></div>{healthError ? <p>{healthError}</p> : selectedWorkload ? <div className="workload-metrics"><div><small>PODS READY</small><b>{selectedWorkload.podsReady}/{selectedWorkload.totalPods}</b></div><div><small>RESTARTS</small><b>{selectedWorkload.restarts}</b></div><div><small>REPLICAS READY</small><b>{selectedWorkload.readyReplicas}/{selectedWorkload.desiredReplicas}</b></div><div><small>ISSUES</small><b>{selectedWorkload.replicaMismatches} mismatches · {selectedWorkload.failedJobs} failed jobs</b></div></div> : <p>{loading ? 'Loading live workload health…' : 'No workload health data returned.'}</p>}</div>
        <div className="diff-section"><div className="diff-heading"><div><h3>Managed resources <InfoTip text="Resources Argo CD associates with this application. Select one to compare desired and live fields."/></h3><p>{resourcesLoading ? 'Loading resource tree…' : resourcesError || `${resources.length} resource${resources.length === 1 ? '' : 's'} returned by Argo CD`}</p></div><span className="readonly"><LockKeyhole size={12}/> Read only</span></div>
          {resourcesLoading ? <div className="no-diff">Loading resources…</div> : resourcesError ? <div className="no-diff">{resourcesError}</div> : resources.length ? <div className="resource-list">{resources.map((resource, index) => <button className={`resource-row resource-row-button ${selectedResource?.name === resource.name && selectedResource.kind === resource.kind ? 'resource-selected' : ''}`} key={`${resource.group}/${resource.kind}/${resource.namespace}/${resource.name}/${index}`} onClick={() => setSelectedResource(resource)}><div className="resource-kind">{resource.kind}</div><div className="resource-info"><b>{resource.name}</b><small>{resource.namespace || 'cluster scope'}{resource.parent ? ` · parent ${resource.parent}` : ''}</small></div><div className="resource-status"><Status value={resource.sync}/><Status value={resource.health}/></div><ArrowRight size={13}/></button>)}</div> : <div className="no-diff"><ShieldCheck size={17}/>Argo CD returned no resource nodes.</div>}
        </div>
        {selectedResource && <div className="diff-section field-diff"><div className="diff-heading"><div><h3>{selectedResource.kind} · {selectedResource.name} <InfoTip text="Generated Kubernetes bookkeeping and common server defaults are omitted. Secret values and sensitive fields are redacted."/></h3><p>Desired state compared with normalized live state</p></div>{diffLoading && <span className="readonly">Loading…</span>}</div>
          {diffError ? <div className="no-diff">{diffError}</div> : diffLoading ? <div className="no-diff">Loading field differences…</div> : diffEntries.length ? <div className="change-list">{diffEntries.map((change, index) => <div className="change-row" key={`${change.path}/${index}`}><code>{change.path}</code><div><small>Desired</small><pre>{change.desired}</pre></div><div><small>Live</small><pre>{change.live}</pre></div></div>)}</div> : <div className="no-diff"><ShieldCheck size={16}/>{selectedResource.sync === 'Synced' ? diffSuppressedCount ? `Argo CD reports Synced. Only ${diffSuppressedCount} generated/default field${diffSuppressedCount === 1 ? ' was' : 's were'} filtered; no meaningful differences remain.` : 'Argo CD reports Synced. No meaningful field differences remain.' : 'No meaningful field differences found in this comparison.'}</div>}
          {diffTruncated && <p className="truncated-note">Showing the first 100 changed fields.</p>}
        </div>}
        <div className="modal-note"><LockKeyhole size={14}/><span><b>Read only</b> Sensitive values are redacted before returning this diff.</span></div>
        <div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Close</button></div>
      </section>
    </div>}
  </main>;
}

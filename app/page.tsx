'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown, CircleHelp, Clock3, Cloud, Code2, Command, ExternalLink, GitBranch, Layers3, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal, Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Terminal, X } from 'lucide-react';

type AppRow = { name: string; namespace: string; project: string; sync: 'Synced' | 'Out of sync' | 'Unknown'; health: 'Healthy' | 'Degraded' | 'Progressing' | 'Unknown'; resources: number; drift: number; revision: string; updated: string; icon: string; color: string };

const events = [
  { title: 'Deployment drift detected', sub: 'payments-api · production', time: '4 min ago', kind: 'drift' },
  { title: 'Rollout completed', sub: 'storefront · production', time: '12 min ago', kind: 'success' },
  { title: 'Replica mismatch', sub: 'inventory-worker · production', time: '18 min ago', kind: 'warning' },
  { title: 'Configuration synced', sub: 'checkout-service · production', time: '26 min ago', kind: 'success' },
];

function Status({ value }: { value: string }) {
  const cls = value === 'Synced' || value === 'Healthy' ? 'good' : value === 'Progressing' ? 'progress' : 'bad';
  return <span className={`status ${cls}`}><i />{value}</span>;
}

export default function Home() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [active, setActive] = useState('Overview');
  const [filter, setFilter] = useState('All applications');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AppRow | null>(null);
  const [notice, setNotice] = useState('');
  const shown = apps.filter(a => (filter === 'All applications' || a.sync === 'Out of sync') && `${a.name} ${a.namespace} ${a.project}`.toLowerCase().includes(query.toLowerCase()));
  const driftedCount = apps.reduce((sum, app) => sum + app.drift, 0);
  const healthyCount = apps.filter(app => app.health === 'Healthy').length;
  const outOfSyncCount = apps.filter(app => app.sync === 'Out of sync').length;
  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/argocd/applications', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load applications.');
      setApps(payload.applications);
      setFetchedAt(payload.fetchedAt);
      setConnectionError('');
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not load applications.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);
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
          <div className="summary-card health-card"><div className="card-label">CLUSTER HEALTH <span className="info">i</span></div><div className="health-row"><div className="score-ring"><div><strong>82</strong><small>/ 100</small></div></div><div className="health-copy"><b>Needs attention</b><p>Health dipped 8 points<br/>in the last hour.</p></div></div><div className="card-foot"><span className="trend down"><ArrowDownRight size={13}/> 8 pts</span><span>vs. previous hour</span><span className="sparkline"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div></div>
          <div className="summary-card"><div className="card-label">APPLICATIONS <span className="info">i</span></div><div className="metric-line"><strong>{apps.length}</strong></div><div className="metric-caption">Argo CD applications</div><div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="card-foot"><span className="green-dot"/> {healthyCount} healthy <span className="sep">·</span><span className="red-dot"/> {outOfSyncCount} out of sync</div></div>
          <div className="summary-card"><div className="card-label">DRIFTED RESOURCES <span className="info">i</span></div><div className="metric-line"><strong>{driftedCount}</strong></div><div className="metric-caption">resources reported out of sync</div><div className="drift-bars"><span style={{height: '35%'}}/><span style={{height: '50%'}}/><span style={{height: '38%'}}/><span style={{height: '67%'}}/><span style={{height: '45%'}}/><span style={{height: '72%'}}/><span style={{height: '58%'}}/><span style={{height: '90%'}}/><span style={{height: '63%'}}/><span style={{height: '100%'}}/><span style={{height: '79%'}}/><span style={{height: '100%'}}/></div><div className="card-foot"><span>{driftedCount} detected</span><span>by Argo CD</span></div></div>
          <div className="summary-card"><div className="card-label">WORKLOAD HEALTH <span className="info">i</span></div><div className="metric-line"><strong>96<span className="metric-suffix">%</span></strong><span className="trend up"><ArrowUpRight size={13}/> 1.2%</span></div><div className="metric-caption">pods ready and serving</div><div className="workload-track"><span/></div><div className="card-foot"><span>143 / 149 pods ready</span><span className="pill-muted">6 need attention</span></div></div>
        </div>

        <div className="section-heading"><div><div className="title-row"><h2>Applications</h2><span className="count">{apps.length}</span></div><p>Monitor sync status, health, and configuration drift.</p></div><button className="button secondary small" onClick={() => setNotice('Applications are loaded from the configured Argo CD instance.')}><Plus size={14}/> Add application</button></div>
        <div className="table-card"><div className="table-toolbar"><div className="tabs"><button className={filter === 'All applications' ? 'tab active' : 'tab'} onClick={() => setFilter('All applications')}>All applications <span>{apps.length}</span></button><button className={filter === 'Out of sync' ? 'tab active' : 'tab'} onClick={() => setFilter(filter === 'Out of sync' ? 'All applications' : 'Out of sync')}>Out of sync <span className="tab-alert">{outOfSyncCount}</span></button></div><div className="table-controls"><label className="search"><Search size={14}/><input placeholder="Search applications..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label><button className={`filter-btn ${filter === 'Out of sync' ? 'filter-on' : ''}`} onClick={toggleFilter}><SlidersHorizontal size={14}/> Filters{filter === 'Out of sync' && <span>1</span>}</button><button className="icon-button plain" aria-label="More options" onClick={() => setNotice('Table options: sort by name, health, or drift count.')}><MoreHorizontal size={18}/></button></div></div>
          <div className="table-scroll"><table><thead><tr><th>APPLICATION</th><th>SYNC STATUS</th><th>HEALTH</th><th>RESOURCES</th><th>DRIFT</th><th>LAST OPERATION <ChevronDown size={11}/></th><th/></tr></thead><tbody>{shown.map(app => <tr key={app.name} onClick={() => setSelected(app)}><td><div className="app-name"><div className={`app-icon ${app.color}`}>{app.icon}</div><div><b>{app.name}</b><small>{app.namespace} <span>·</span> {app.project}</small></div></div></td><td><Status value={app.sync}/></td><td><Status value={app.health}/></td><td><span className="resource-number"><Boxes size={13}/>{app.resources}</span></td><td>{app.drift ? <span className="drift-number"><AlertTriangle size={13}/>{app.drift} {app.drift === 1 ? 'change' : 'changes'}</span> : <span className="no-drift">—</span>}</td><td><div className="sync-revision">{app.updated}<small><GitBranch size={11}/>{app.revision}</small></div></td><td><button className="row-more" aria-label="Open application details"><ArrowRight size={15}/></button></td></tr>)}{shown.length === 0 && <tr><td colSpan={7} className="empty">{loading ? 'Loading applications…' : connectionError ? 'Connect to Argo CD to load applications.' : 'No applications match this search.'}</td></tr>}</tbody></table></div>
          <div className="table-footer"><span>Showing <b>{shown.length ? 1 : 0}–{shown.length}</b> of <b>{apps.length}</b> applications</span><div><button disabled>Previous</button><button className="page-number">1</button><button disabled>Next <ArrowRight size={12}/></button></div></div></div>

        <div className="lower-grid"><div className="activity-card"><div className="lower-heading"><div><h2>Recent activity</h2><p>What’s changed across this cluster.</p></div><button onClick={() => setActive('Activity log')}>View activity <ArrowRight size={13}/></button></div><div className="event-list">{events.map((e, i) => <div className="event" key={e.title}><div className={`event-icon ${e.kind}`}>{e.kind === 'drift' ? <GitBranch size={14}/> : e.kind === 'warning' ? <AlertTriangle size={14}/> : <Check size={14}/>}</div><div className="event-copy"><b>{e.title}</b><small>{e.sub}</small></div><span className="event-time">{e.time}</span></div>)}</div></div><div className="insight-card"><div className="insight-top"><div className="insight-spark"><Sparkles size={15}/></div><span>QUICK INSIGHT</span><button onClick={() => setNotice('Insights are based on observed cluster and sync signals.')}><MoreHorizontal size={17}/></button></div><h3>Drift is concentrated<br/>in one application.</h3><p>payments-api has 3 of the 4 drifted resources. A recent manual change may be the cause.</p><button className="insight-link" onClick={() => setSelected(apps[0])}>Review drifted resources <ArrowRight size={14}/></button><div className="insight-orb orb-one"/><div className="insight-orb orb-two"/></div></div>
        <footer className="footer"><span><span className="footer-dot"/> All systems operational</span><span>Last checked 2 min ago <span className="footer-sep">·</span> <button onClick={refresh}>Refresh status</button></span><span>Built for calmer on-call <span className="footer-heart">♥</span></span></footer>
      </div>
    </section>
    {notice && <div className="toast"><Check size={15}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="detail-modal" onClick={e => e.stopPropagation()}><div className="modal-top"><div className={`app-icon ${selected.color}`}>{selected.icon}</div><div><div className="modal-kicker">APPLICATION <span>·</span> {selected.namespace}</div><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><X size={17}/></button></div><div className="modal-status"><Status value={selected.sync}/><Status value={selected.health}/></div><div className="detail-grid"><div><small>PROJECT</small><b>{selected.project}</b></div><div><small>RESOURCES</small><b>{selected.resources} tracked</b></div><div><small>LAST OPERATION</small><b>{selected.updated}</b></div><div><small>GIT REVISION</small><b className="mono"><GitBranch size={12}/>{selected.revision}</b></div></div><div className="diff-section"><div className="diff-heading"><div><h3>Resource differences</h3><p>{selected.drift ? `${selected.drift} resource${selected.drift > 1 ? 's' : ''} reported out of sync` : 'Argo CD reports this application is synced'}</p></div><span className="readonly"><LockKeyhole size={12}/> Read only</span></div><div className="no-diff"><ShieldCheck size={17}/>{selected.drift ? 'Field-level diff details are the next integration step.' : 'No out-of-sync resources reported.'}</div></div><div className="modal-note"><Sparkles size={14}/><span><b>Current integration</b> Live application status is connected. Resource-level diff details are not loaded yet.</span></div><div className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Close</button><button className="button primary" onClick={() => setNotice('Argo CD deep links will be added with resource details.')}>Open in Argo CD <ExternalLink size={13}/></button></div></section></div>}
  </main>;
}

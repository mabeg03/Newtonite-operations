import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const statuses = ['OPEN','IN_PROGRESS','AWAITING_APPROVAL','BLOCKED','RESOLVED','CLOSED'];
const types = ['TASK','INCIDENT','CUSTOMER_ISSUE','PAYMENT','COMPLIANCE'];
const priorities = ['LOW','MEDIUM','HIGH','CRITICAL'];

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function Login({ onLogin }) {
  const [email,setEmail] = useState('admin@newtonite.local');
  const [password,setPassword] = useState('Admin123!');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { onLogin(await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})})); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <div className="login-card">
      <div className="brand-mark">N</div><p className="eyebrow">NEWTONITE / OPERATIONS</p>
      <h1>Keep important work moving.</h1>
      <p className="muted">Sign in to see ownership, priority, and what needs attention.</p>
      <form onSubmit={submit} className="form-stack">
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary full" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
      </form>
      <div className="demo-note"><strong>Demo accounts</strong><br/>admin@newtonite.local / Admin123!<br/>manager@newtonite.local / Manager123!<br/>member@newtonite.local / Member123!</div>
    </div>
  </main>;
}

function App() {
  const [session,setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('newtonite-session') || 'null'); } catch { return null; }
  });
  const [items,setItems] = useState([]);
  const [teams,setTeams] = useState([]);
  const [selected,setSelected] = useState(null);
  const [comments,setComments] = useState([]);
  const [activity,setActivity] = useState([]);
  const [filters,setFilters] = useState({search:'',status:'',priority:'',view:''});
  const [page,setPage] = useState(1);
  const [pagination,setPagination] = useState({page:1,pages:1,total:0});
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState(null);
  const [showCreate,setShowCreate] = useState(false);
  const [edit,setEdit] = useState(null);
  const [commentText,setCommentText] = useState('');
  const [tab,setTab] = useState('details');

  const notify = (message,type='success') => { setNotice({message,type}); window.setTimeout(()=>setNotice(null),4500); };
  const login = data => {
    const next = { token:data.token, user:data.user };
    localStorage.setItem('newtonite-session',JSON.stringify(next)); setSession(next);
  };
  const logout = () => { localStorage.removeItem('newtonite-session'); setSession(null); setItems([]); setSelected(null); };

  const loadTeams = useCallback(async () => {
    if (!session) return;
    try { const data = await request('/teams',{token:session.token}); setTeams(data.teams); }
    catch (e) { notify(e.message,'error'); }
  },[session]);

  const loadItems = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({page:String(page),limit:'10'});
      if (filters.search) params.set('search',filters.search);
      if (filters.status) params.set('status',filters.status);
      if (filters.priority) params.set('priority',filters.priority);
      if (filters.view) params.set('view',filters.view);
      const data = await request(`/work-items?${params}`,{token:session.token});
      setItems(data.items); setPagination(data.pagination);
    } catch (e) { notify(e.message,'error'); }
    finally { setBusy(false); }
  },[session,page,filters]);

  useEffect(()=>{ loadTeams(); },[loadTeams]);
  useEffect(()=>{ loadItems(); },[loadItems]);

  async function openItem(item) {
    try {
      const [detail,history] = await Promise.all([
        request(`/work-items/${item.id}`,{token:session.token}),
        request(`/work-items/${item.id}/activity`,{token:session.token})
      ]);
      setSelected(detail.item); setComments(detail.comments); setActivity(history.activity); setEdit({...detail.item});
      setTab('details');
    } catch (e) { notify(e.message,'error'); }
  }

  async function saveItem(e) {
    e.preventDefault();
    try {
      const body = {
        version:Number(edit.version), title:edit.title, description:edit.description, type:edit.type || 'TASK',
        status:edit.status, priority:edit.priority, team_id:Number(edit.team_id),
        assignee_id:edit.assignee_id ? Number(edit.assignee_id) : null,
        due_at:edit.due_at || null
      };
      const data = await request(`/work-items/${edit.id}`,{token:session.token,method:'PATCH',body:JSON.stringify(body)});
      setSelected(data.item); setEdit({...data.item});
      await Promise.all([loadItems(),openItem(data.item)]);
      notify('Work item saved.');
    } catch (e) {
      notify(e.message,'error');
      if (e.status===409) openItem(selected);
    }
  }

  async function createItem(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      title:form.get('title'), description:form.get('description'), type:form.get('type'), priority:form.get('priority'),
      team_id:Number(form.get('team_id')), assignee_id:form.get('assignee_id') ? Number(form.get('assignee_id')) : null,
      due_at:form.get('due_at') || null
    };
    try {
      const result = await request('/work-items',{token:session.token,method:'POST',headers:{'Idempotency-Key':`${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`},body:JSON.stringify(payload)});
      setShowCreate(false); await loadItems(); await openItem(result.item);
      notify('Work item created.');
    } catch (e) { notify(e.message,'error'); }
  }

  async function claimSelectedItem() {
    if (!selected) return;
    try {
      const result = await request(`/work-items/${selected.id}/claim`, {
        token: session.token, method: 'POST',
        body: JSON.stringify({ version: Number(selected.version) })
      });
      await Promise.all([loadItems(), openItem(result.item)]);
      notify('You are now responsible for this work item.');
    } catch (e) {
      notify(e.message, 'error');
      if (e.status === 409) openItem(selected);
    }
  }

 async function addComment() {
  console.log('Comment button clicked');

  if (!commentText.trim() || !selected) return;

  try {
    await request(
      `/work-items/${selected.id}/comments`,
      {
        token: session.token,
        method: 'POST',
        body: JSON.stringify({ body: commentText })
      }
    );

    setCommentText('');
    await openItem(selected);
    notify('Comment added.');
  } catch (e) {
    console.error('Comment request failed:', e);
    notify(e.message, 'error');
  }
}

  const stats = useMemo(()=>({
    open:items.filter(i=>i.status==='OPEN').length,
    active:items.filter(i=>i.status==='IN_PROGRESS').length,
    blocked:items.filter(i=>i.status==='BLOCKED').length
  }),[items]);

  if (!session) return <Login onLogin={login}/>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="side-brand"><span className="brand-mark small">N</span><span>newtonite<span className="brand-sub">OPERATIONS</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="nav-item active"><span>▦</span> Work overview</button>
      <div className="sidebar-bottom">
        <div className="user-chip"><div className="avatar">{session.user.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="user-info"><strong>{session.user.name}</strong><small>{session.user.role}</small></div><button className="icon-button" title="Sign out" onClick={logout}>↪</button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><p className="eyebrow">OPERATIONS / WORKSPACE</p><h1>Work overview</h1></div><div className="top-actions"><span className="live-dot">All systems operational</span><button className="primary" onClick={()=>setShowCreate(true)}>＋ New work item</button></div></header>
      {notice && <div className={`toast ${notice.type==='error'?'toast-error':''}`}>{notice.message}<button onClick={()=>setNotice(null)}>×</button></div>}
      <section className="welcome-row"><div><h2>Good work starts with clarity.</h2><p>Track ownership, surface blockers, and keep every important request moving.</p></div><span className="date-label">{new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</span></section>
      <section className="stats-grid">
        <Stat title="Visible work items" value={pagination.total} note="Across your teams" icon="▦"/>
        <Stat title="Open on this page" value={stats.open} note="Waiting to be picked up" icon="◷"/>
        <Stat title="In progress" value={stats.active} note="Currently being worked on" icon="↗"/>
        <Stat title="Blocked" value={stats.blocked} note="Needs attention" icon="⚑"/>
      </section>
      <section className="content-panel">
        <div className="panel-heading"><div><h3>Work items</h3><p>Find and manage requests across your team.</p></div><button className="secondary" onClick={()=>{loadItems();notify('Work list refreshed.')}}>↻ Refresh</button></div>
        <div className="quick-views">
          <button className={filters.view===''?'quick-view active':'quick-view'} onClick={()=>{setPage(1);setFilters({...filters,view:''})}}>All work</button>
          <button className={filters.view==='mine'?'quick-view active':'quick-view'} onClick={()=>{setPage(1);setFilters({...filters,view:'mine'})}}>Assigned to me</button>
          <button className={filters.view==='unassigned_urgent'?'quick-view active':'quick-view'} onClick={()=>{setPage(1);setFilters({...filters,view:'unassigned_urgent'})}}>Unassigned urgent</button>
          <button className={filters.view==='awaiting_approval'?'quick-view active':'quick-view'} onClick={()=>{setPage(1);setFilters({...filters,view:'awaiting_approval'})}}>Awaiting approval</button>
        </div>
        <div className="filters">
          <div className="search-box"><span>⌕</span><input placeholder="Search work items…" value={filters.search} onChange={e=>{setPage(1);setFilters({...filters,search:e.target.value})}}/></div>
          <select value={filters.status} onChange={e=>{setPage(1);setFilters({...filters,status:e.target.value})}}><option value="">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
          <select value={filters.priority} onChange={e=>{setPage(1);setFilters({...filters,priority:e.target.value})}}><option value="">All priorities</option>{priorities.map(p=><option key={p}>{p}</option>)}</select>
        </div>
        <div className="table-wrap"><table><thead><tr><th>WORK ITEM</th><th>STATUS</th><th>PRIORITY</th><th>ASSIGNEE</th><th>UPDATED</th><th></th></tr></thead><tbody>
          {busy && <tr><td colSpan="6" className="empty-state">Loading work items…</td></tr>}
          {!busy && items.map(item=><tr key={item.id} onClick={()=>openItem(item)} className="click-row">
            <td><div className="item-title">{item.title}</div><div className="item-meta">OPS-{item.id} · {item.type || 'TASK'} · {item.team_name}</div></td>
            <td><Status status={item.status}/></td><td><Priority priority={item.priority}/></td>
            <td><div className="assignee"><span className="mini-avatar">{item.assignee_name ? item.assignee_name.split(' ').map(x=>x[0]).slice(0,2).join('') : '—'}</span>{item.assignee_name || 'Unassigned'}</div></td>
            <td className="muted">{new Date(item.updated_at).toLocaleDateString()}</td><td className="row-arrow">↗</td>
          </tr>)}
          {!busy && items.length===0 && <tr><td colSpan="6" className="empty-state">No work items match these filters. Try a different search or create one.</td></tr>}
        </tbody></table></div>
        <div className="pagination"><span>Showing {items.length ? (page-1)*pagination.limit+1 : 0}–{(page-1)*pagination.limit+items.length} of {pagination.total}</span><div><button className="page-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>←</button><span>Page {page} of {Math.max(1,pagination.pages)}</span><button className="page-btn" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>→</button></div></div>
      </section>
      <footer>Newtonite Operations <span>Built for clarity, accountability, and reliable execution.</span></footer>
    </main>
    {selected && <div className="drawer-backdrop" onClick={()=>setSelected(null)}><section className="drawer" onClick={e=>e.stopPropagation()}>
      <div className="drawer-top"><div><span className="item-meta">OPS-{selected.id} · {selected.team_name}</span><h2>{selected.title}</h2></div><button className="icon-button close-btn" onClick={()=>setSelected(null)}>×</button></div>
      <div className="drawer-tabs"><button className={tab==='details'?'selected':''} onClick={()=>setTab('details')}>Details</button><button className={tab==='activity'?'selected':''} onClick={()=>setTab('activity')}>Activity ({activity.length})</button></div>
      {tab==='details' ? <form className="drawer-form" onSubmit={saveItem}>
        <label>Title<input value={edit?.title||''} onChange={e=>setEdit({...edit,title:e.target.value})} required maxLength="200"/></label>
        <label>Description<textarea rows="4" value={edit?.description||''} onChange={e=>setEdit({...edit,description:e.target.value})}/></label>
        <label>Type<select value={edit?.type||'TASK'} onChange={e=>setEdit({...edit,type:e.target.value})}>{types.map(t=><option key={t}>{t}</option>)}</select></label>
        <div className="two-col"><label>Status<select value={edit?.status||'OPEN'} onChange={e=>setEdit({...edit,status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Priority<select value={edit?.priority||'MEDIUM'} onChange={e=>setEdit({...edit,priority:e.target.value})}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label></div>
        <label>Team<select value={edit?.team_id||''} onChange={e=>setEdit({...edit,team_id:e.target.value})}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Assignee ID <input type="number" min="1" placeholder="Leave blank to unassign" value={edit?.assignee_id||''} onChange={e=>setEdit({...edit,assignee_id:e.target.value})}/><small>Use a team member's numeric user ID.</small></label>
        <label>Due date<input type="datetime-local" value={edit?.due_at ? String(edit.due_at).slice(0,16).replace(' ','T') : ''} onChange={e=>setEdit({...edit,due_at:e.target.value})}/></label>
        <div className="version-note">Version {selected.version} · If someone else updates this item, you'll be asked to refresh before saving.</div>
        {!selected.assignee_id && <button type="button" className="secondary full" onClick={claimSelectedItem}>Claim this work item</button>}
        <button className="primary full">Save changes</button>
        <div className="comments-section"><h3>Discussion</h3>{comments.map(c=><div className="comment" key={c.id}><div className="comment-head"><strong>{c.author_name}</strong><small>{new Date(c.created_at).toLocaleString()}</small></div><p>{c.body}</p></div>)}{comments.length===0&&<p className="muted">No comments yet. Start the conversation.</p>}
          <div className="comment-form">
            <textarea
              rows="2"
              placeholder="Add a comment…"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              maxLength="5000"
            />
            <button
              type="button"
              className="secondary"
              disabled={!commentText.trim()}
              onClick={addComment}
            >
              Comment
            </button>
          </div>
        </div>
      </form> : <div className="timeline">{activity.map(a=><div className="timeline-item" key={a.id}><div className="timeline-dot"/><div><strong>{a.actor_name}</strong><p>{a.summary}</p><small>{new Date(a.created_at).toLocaleString()}</small></div></div>)}</div>}
    </section></div>}
    {showCreate && <div className="modal-backdrop" onClick={()=>setShowCreate(false)}><section className="modal" onClick={e=>e.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">NEW REQUEST</p><h2>Create work item</h2></div><button className="icon-button" onClick={()=>setShowCreate(false)}>×</button></div><form onSubmit={createItem} className="form-stack">
      <label>Title<input name="title" required maxLength="200" placeholder="e.g. Investigate payment discrepancy"/></label>
      <label>Description<textarea name="description" rows="4" placeholder="What happened, why it matters, and what needs to be done?"/></label>
      <label>Type<select name="type" defaultValue="TASK">{types.map(t=><option key={t}>{t}</option>)}</select></label>
      <div className="two-col"><label>Team<select name="team_id" required>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Priority<select name="priority" defaultValue="MEDIUM">{priorities.map(p=><option key={p}>{p}</option>)}</select></label></div>
      <label>Assignee ID <input name="assignee_id" type="number" min="1" placeholder="Optional numeric user ID"/></label>
      <label>Due date<input name="due_at" type="datetime-local"/></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary">Create work item</button></div>
    </form></section></div>}
  </div>;
}

function Stat({title,value,note,icon}) { return <div className="stat-card"><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>; }
function Status({status}) { return <span className={`status status-${status.toLowerCase()}`}><i/>{status.replace('_',' ')}</span>; }
function Priority({priority}) { return <span className={`priority priority-${priority.toLowerCase()}`}><i/>{priority}</span>; }

createRoot(document.getElementById('root')).render(<App/>);

import React, { useState, useMemo } from 'react';
import { Btn, SearchBar, Modal, FormInput, FormTextarea, Tag, Empty } from './UI.jsx';
import { edDate } from '../utils/edDate.js';

const EMPTY_FORM = { title: '', system: '', body: '', content: '', tags: '' };

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc',  label: 'Oldest First' },
  { value: 'system',    label: 'System A-Z' },
  { value: 'title',     label: 'Title A-Z' },
];

export default function LogsView({ logs, upsertLog, deleteLog, currentSystem }) {
  const [query,     setQuery]     = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy,    setSortBy]    = useState('date_desc');
  const [modal,     setModal]     = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [viewModal, setViewModal] = useState(null);

  const filtered = useMemo(() => {
    const q   = query.toLowerCase();
    const tag = tagFilter.toLowerCase().trim();
    let list = logs.filter(l => {
      const textMatch = !q || (
        l.title.toLowerCase().includes(q) ||
        (l.system || '').toLowerCase().includes(q) ||
        l.content.toLowerCase().includes(q)
      );
      const tagMatch = !tag || (l.tags || []).some(t => t.toLowerCase().includes(tag));
      return textMatch && tagMatch;
    });

    if (sortBy === 'date_desc') list = [...list].sort((a, b) => b.ts - a.ts);
    else if (sortBy === 'date_asc')  list = [...list].sort((a, b) => a.ts - b.ts);
    else if (sortBy === 'system')    list = [...list].sort((a, b) => (a.system || '').localeCompare(b.system || ''));
    else if (sortBy === 'title')     list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [logs, query, tagFilter, sortBy]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, system: currentSystem || '' });
    setModal(true);
  }

  function openEdit(entry) {
    setEditing(entry.id);
    setForm({
      title:   entry.title,
      system:  entry.system || '',
      body:    entry.body   || '',
      content: entry.content,
      tags:    (entry.tags || []).join(', '),
    });
    setModal(true);
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return;
    await upsertLog({
      id:      editing || String(Date.now()),
      ts:      editing ? (logs.find(l => l.id === editing)?.ts ?? Date.now()) : Date.now(),
      title:   form.title.trim(),
      system:  form.system.trim(),
      body:    form.body.trim(),
      content: form.content.trim(),
      tags:    form.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this log entry?')) return;
    await deleteLog(id);
  }

  // Clicking a tag chip sets the tag filter
  function filterByTag(tag) {
    setTagFilter(tag);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '16px', color: 'var(--ed-orange)', letterSpacing: '4px' }}>Commander's Log</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginTop: '3px' }}>Personal mission log</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {currentSystem && (
            <Btn onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM, system: currentSystem }); setModal(true); }} variant="green" small>
              ⚡ {currentSystem.length > 10 ? currentSystem.slice(0, 10) + '…' : currentSystem}
            </Btn>
          )}
          <Btn onClick={openNew} small>+ New Entry</Btn>
        </div>
      </div>

      {/* Text search */}
      <SearchBar value={query} onChange={e => setQuery(e.target.value)} placeholder="SEARCH LOG ENTRIES..." />

      {/* Sort + Tag filter row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ background: '#050e18', border: '1px solid var(--border-c)', color: 'var(--ed-cyan)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '9px 10px', outline: 'none', flexShrink: 0 }}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ flex: 1 }}>
          <input
            type="search"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            placeholder="FILTER BY TAG..."
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
            onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
          />
        </div>
        {tagFilter && <Btn onClick={() => setTagFilter('')} variant="red" small>X</Btn>}
      </div>

      {/* List */}
      {filtered.length === 0
        ? <Empty icon="◉" text={logs.length === 0 ? 'No log entries yet.' : 'No entries match your search.'} />
        : filtered.map(entry => (
          <div key={entry.id} style={{
            border: '1px solid rgba(255,98,0,0.22)',
            padding: '14px',
            marginBottom: '10px',
            background: 'rgba(5,14,24,0.8)',
            clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)',
            position: 'relative',
          }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10,
              background: 'rgba(255,98,0,0.45)', clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-hud)', fontSize: '14px', color: 'var(--ed-orange)' }}>{entry.title}</span>
              {entry.system && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ed-cyan)', marginLeft: 'auto' }}>
                  ◇ {entry.system}{entry.body ? ' / ' + entry.body : ''}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '6px' }}>
              ◈ {edDate(entry.ts)}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, opacity: 0.85, userSelect: 'text', WebkitUserSelect: 'text' }}>
              {entry.content}
            </div>
            {entry.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: '5px', marginTop: '8px', flexWrap: 'wrap' }}>
                {entry.tags.map(t => (
                  <Tag
                    key={t}
                    label={t}
                    onClick={() => filterByTag(t)}
                    active={tagFilter === t}
                  />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <Btn onClick={() => setViewModal(entry)} variant="orange" small>View</Btn>
              <Btn onClick={() => openEdit(entry)} variant="cyan" small>Edit</Btn>
            </div>
          </div>
        ))
      }

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Log Entry' : 'New Log Entry'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <FormInput label="Title"  value={form.title}  onChange={set('title')}  placeholder="Entry title..." />
          <FormInput label="System" value={form.system} onChange={set('system')} placeholder="Star system..." />
        </div>
        <FormInput    label="Body / Location" value={form.body}    onChange={set('body')}    placeholder="Planet, station..." />
        <FormTextarea label="Log Entry"       value={form.content} onChange={set('content')} placeholder="Write your log entry..." rows={5} />
        <FormInput    label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="exploration, combat..." />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          {editing && <Btn onClick={() => { handleDelete(editing); setModal(false); }} variant="red" small>Delete</Btn>}
          <Btn onClick={() => setModal(false)} variant="red" small>Cancel</Btn>
          <Btn onClick={handleSave} small disabled={!form.title.trim() || !form.content.trim()}>Save Entry</Btn>
        </div>
      </Modal>

      {/* ── Detail View Modal ── */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Log Entry">
        {viewModal && (() => {
          const entry = viewModal;
          return (
            <div>
              <div style={{ fontFamily: 'var(--font-hud)', fontSize: '18px', color: 'var(--ed-orange)', marginBottom: '4px' }}>{entry.title}</div>
              {entry.system && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ed-cyan)', marginBottom: '4px' }}>
                  ◇ {entry.system}{entry.body ? ' / ' + entry.body : ''}
                </div>
              )}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '16px' }}>
                ◈ {edDate(entry.ts)}
              </div>

              <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: '14px', userSelect: 'text', WebkitUserSelect: 'text' }}>
                {entry.content}
              </div>

              {entry.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {entry.tags.map(t => <Tag key={t} label={t} />)}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Btn onClick={async () => { if (!window.confirm('Delete this log entry?')) return; await deleteLog(entry.id); setViewModal(null); }} variant="red" small>Delete</Btn>
                <Btn onClick={() => { setViewModal(null); openEdit(entry); }} variant="cyan" small>Edit</Btn>
                <Btn onClick={() => setViewModal(null)} variant="orange" small>Close</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

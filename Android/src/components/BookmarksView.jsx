import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Btn, SearchBar, Modal, FormInput, FormTextarea, FormSelect, Tag, Empty } from './UI.jsx';

const TYPE_OPTIONS = [
  { value: 'POI',         label: 'Point of Interest' },
  { value: 'EXPLORATION', label: 'Exploration Target' },
  { value: 'TRADE',       label: 'Trade Hub' },
  { value: 'COMBAT',      label: 'Combat Zone' },
  { value: 'MINING',      label: 'Mining Site' },
  { value: 'HOME',        label: 'Home System' },
  { value: 'CARRIER',     label: 'Carrier Port' },
  { value: 'OTHER',       label: 'Other' },
];

const TYPE_COLOR = {
  POI: '#FFA500', EXPLORATION: '#00D4FF', TRADE: '#00FF88',
  COMBAT: '#FF4040', MINING: '#FFD700', HOME: '#FF6200',
  CARRIER: '#CC88FF', OTHER: '#4A6A8A',
};

const SORT_OPTIONS = [
  { value: 'manual',    label: 'Manual Order' },
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc',  label: 'Oldest First' },
  { value: 'system',    label: 'System A-Z' },
  { value: 'type',      label: 'By Type' },
];

const EMPTY_FORM = { system: '', type: 'POI', lat: '', lon: '', z: '', notes: '', tags: '', folder: '', pinned: false };

export default function BookmarksView({ bookmarks, upsertBookmark, deleteBookmark, currentSystem, initialPrefill, onPrefillConsumed, folders }) {
  const [query,        setQuery]        = useState('');
  const [tagFilter,    setTagFilter]    = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [sortBy,       setSortBy]       = useState('manual');
  const [modal,        setModal]        = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [viewModal,    setViewModal]    = useState(null);
  const [order,        setOrder]        = useState([]);
  const [dragId,       setDragId]       = useState(null);
  const [dragOver,     setDragOver]     = useState(null);
  const touchRef = useRef(null);

  // Keep order in sync with bookmarks array
  useEffect(() => {
    setOrder(prev => {
      const ids = bookmarks.map(b => b.id);
      const existing = prev.filter(id => ids.includes(id));
      const newIds = ids.filter(id => !existing.includes(id));
      return [...existing, ...newIds];
    });
  }, [bookmarks]);

  // Handle prefill from visited tab
  useEffect(() => {
    if (initialPrefill) {
      openNew(initialPrefill);
      onPrefillConsumed && onPrefillConsumed();
    }
  }, [initialPrefill]);

  const folderOptions = useMemo(() => [
    { value: '', label: '-- No Folder --' },
    ...(folders || []).map(f => ({ value: f.id, label: f.name })),
  ], [folders]);

  const sorted = useMemo(() => {
    let list = [...bookmarks];
    const q   = query.toLowerCase();
    const tag = tagFilter.toLowerCase().trim();
    list = list.filter(b => {
      const textMatch = !q || (
        b.system.toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.toLowerCase().includes(q))
      );
      const tagMatch  = !tag || (b.tags || []).some(t => t.toLowerCase().includes(tag));
      const fldMatch  = !folderFilter || b.folder === folderFilter;
      const typeMatch = !typeFilter || b.type === typeFilter;
      return textMatch && tagMatch && fldMatch && typeMatch;
    });

    if (sortBy === 'manual') {
      list.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    } else if (sortBy === 'date_desc') list.sort((a, b) => b.ts - a.ts);
    else if (sortBy === 'date_asc')  list.sort((a, b) => a.ts - b.ts);
    else if (sortBy === 'system')    list.sort((a, b) => a.system.localeCompare(b.system));
    else if (sortBy === 'type')      list.sort((a, b) => a.type.localeCompare(b.type));

    const pinned   = list.filter(b => b.pinned);
    const unpinned = list.filter(b => !b.pinned);
    return [...pinned, ...unpinned];
  }, [bookmarks, query, tagFilter, folderFilter, typeFilter, sortBy, order]);

  function openNew(prefillSys) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, system: prefillSys || currentSystem || '' });
    setModal(true);
  }

  function openEdit(bm) {
    setEditing(bm.id);
    setForm({
      system: bm.system,
      type:   bm.type,
      lat:    bm.lat ?? bm.x ?? '',
      lon:    bm.lon ?? bm.y ?? '',
      z:      bm.z ?? '',
      notes:  bm.notes || '',
      tags:   (bm.tags || []).join(', '),
      folder: bm.folder || '',
      pinned: !!bm.pinned,
    });
    setModal(true);
  }

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  function parseCoord(val) {
    if (val === '' || val == null) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  async function quickAdd() {
    if (!currentSystem) return;
    const existing = bookmarks.find(b => b.system === currentSystem);
    if (existing) { openEdit(existing); return; }
    await upsertBookmark({
      id: String(Date.now()), ts: Date.now(),
      system: currentSystem, type: 'POI',
      lat: null, lon: null, z: null,
      notes: '', tags: [], folder: '', pinned: false,
    });
  }

  async function handleSave() {
    if (!form.system.trim()) return;
    await upsertBookmark({
      id:     editing || String(Date.now()),
      ts:     editing ? (bookmarks.find(b => b.id === editing)?.ts ?? Date.now()) : Date.now(),
      system: form.system.trim(),
      type:   form.type,
      lat:    parseCoord(form.lat),
      lon:    parseCoord(form.lon),
      z:      parseCoord(form.z),
      notes:  form.notes.trim(),
      tags:   form.tags.split(',').map(t => t.trim()).filter(Boolean),
      folder: form.folder,
      pinned: form.pinned,
    });
    setModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this bookmark?')) return;
    await deleteBookmark(id);
  }

  async function togglePin(bm) {
    await upsertBookmark({ ...bm, pinned: !bm.pinned });
  }

  // Drag-to-reorder
  function onDragStart(e, id) { setDragId(id); e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, id)  { e.preventDefault(); setDragOver(id); }
  function onDrop(e, targetId) {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return; }
    setOrder(prev => {
      const arr = [...prev];
      const from = arr.indexOf(dragId);
      const to   = arr.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, dragId);
      return arr;
    });
    setDragId(null); setDragOver(null);
  }
  function onDragEnd() { setDragId(null); setDragOver(null); }

  // Touch drag
  function onTouchStart(e, id) {
    touchRef.current = { id, overId: null };
    setDragId(id);
  }
  function onTouchMove(e) {
    if (!touchRef.current) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = el && el.closest('[data-bmid]');
    const overId = card ? card.getAttribute('data-bmid') : null;
    if (overId && overId !== touchRef.current.id) {
      touchRef.current.overId = overId;
      setDragOver(overId);
    }
  }
  function onTouchEnd() {
    if (touchRef.current && touchRef.current.overId) {
      const from = touchRef.current.id;
      const to   = touchRef.current.overId;
      if (from !== to) {
        setOrder(prev => {
          const arr = [...prev];
          const fi = arr.indexOf(from);
          const ti = arr.indexOf(to);
          if (fi < 0 || ti < 0) return prev;
          arr.splice(fi, 1);
          arr.splice(ti, 0, from);
          return arr;
        });
      }
    }
    touchRef.current = null;
    setDragId(null); setDragOver(null);
  }

  const folderName = fid => (folders || []).find(f => f.id === fid)?.name || null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '16px', color: 'var(--ed-orange)', letterSpacing: '4px' }}>System Bookmarks</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginTop: '3px' }}>Points of interest across the galaxy</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {currentSystem && (
            <Btn onClick={quickAdd} variant="green" small title="Quick-add current system">
              ⚡ {currentSystem.length > 10 ? currentSystem.slice(0, 10) + '…' : currentSystem}
            </Btn>
          )}
          <Btn onClick={() => openNew()} variant="cyan" small>+ Bookmark</Btn>
        </div>
      </div>

      <SearchBar value={query} onChange={e => setQuery(e.target.value)} placeholder="SEARCH SYSTEMS..." />

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <select value={folderFilter} onChange={e => setFolderFilter(e.target.value)}
          style={{ background: '#050e18', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '9px 10px', outline: 'none' }}>
          <option value="">ALL FOLDERS</option>
          {(folders || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ background: '#050e18', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '9px 10px', outline: 'none' }}>
          <option value="">ALL TYPES</option>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Sort + Tag filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ background: '#050e18', border: '1px solid var(--border-c)', color: 'var(--ed-cyan)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '9px 10px', outline: 'none', flexShrink: 0 }}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="search" value={tagFilter} onChange={e => setTagFilter(e.target.value)}
          placeholder="FILTER BY TAG..."
          style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none' }}
          onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
          onBlur={e  => e.target.style.borderColor = 'var(--border-c)'} />
        {(tagFilter || folderFilter || typeFilter) && (
          <Btn onClick={() => { setTagFilter(''); setFolderFilter(''); setTypeFilter(''); }} variant="red" small>X</Btn>
        )}
      </div>

      {sorted.length === 0
        ? <Empty icon="O" text={bookmarks.length === 0 ? 'No bookmarks yet.' : 'No bookmarks match.'} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {sorted.map(bm => {
              const hasCoords = bm.lat != null && bm.lon != null;
              const isDragging = dragId === bm.id;
              const isOver     = dragOver === bm.id;
              const fName      = folderName(bm.folder);
              return (
                <div
                  key={bm.id}
                  data-bmid={bm.id}
                  draggable={sortBy === 'manual'}
                  onDragStart={sortBy === 'manual' ? e => onDragStart(e, bm.id) : undefined}
                  onDragOver={sortBy === 'manual'  ? e => onDragOver(e, bm.id)  : undefined}
                  onDrop={sortBy === 'manual'      ? e => onDrop(e, bm.id)      : undefined}
                  onDragEnd={sortBy === 'manual'   ? onDragEnd                  : undefined}
                  onTouchStart={sortBy === 'manual' ? e => onTouchStart(e, bm.id) : undefined}
                  onTouchMove={sortBy === 'manual'  ? onTouchMove                 : undefined}
                  onTouchEnd={sortBy === 'manual'   ? onTouchEnd                  : undefined}
                  style={{
                    border: isOver
                      ? '2px solid var(--ed-cyan)'
                      : bm.pinned
                        ? '1px solid rgba(255,210,0,0.6)'
                        : '1px solid var(--border-c)',
                    padding: '13px',
                    background: bm.pinned ? 'rgba(14,12,0,0.88)' : 'rgba(5,14,24,0.8)',
                    clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                    opacity: isDragging ? 0.4 : 1,
                    cursor: sortBy === 'manual' ? 'grab' : 'default',
                    transition: 'border-color 0.15s, opacity 0.15s',
                    position: 'relative',
                    userSelect: 'none',
                  }}
                >
                  {/* Pin button */}
                  <button
                    onClick={() => togglePin(bm)}
                    style={{
                      position: 'absolute', top: '6px', right: '6px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: bm.pinned ? '#FFD700' : 'rgba(255,255,255,0.18)',
                      fontSize: '14px', padding: '2px', lineHeight: 1,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >★</button>

                  {fName && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ed-orange)', letterSpacing: '1px', marginBottom: '3px', opacity: 0.85 }}>
                      {fName}
                    </div>
                  )}

                  <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', color: 'var(--ed-cyan)', marginBottom: '3px', textShadow: '0 0 8px rgba(0,212,255,0.35)', wordBreak: 'break-word', paddingRight: '18px' }}>
                    {bm.system}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: TYPE_COLOR[bm.type] || '#4A6A8A', marginBottom: '7px' }}>
                    {bm.type}
                  </div>
                  {bm.notes && (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: '5px', userSelect: 'text', WebkitUserSelect: 'text' }}>{bm.notes}</div>
                  )}
                  {hasCoords && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '5px' }}>
                      Lat:{bm.lat} Lon:{bm.lon}{bm.z != null ? ` Alt:${bm.z}` : ''}
                    </div>
                  )}
                  {bm.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {bm.tags.map(t => <Tag key={t} label={t} onClick={() => setTagFilter(t)} active={tagFilter === t} />)}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <Btn onClick={() => setViewModal(bm)} variant="orange" small>View</Btn>
                    <Btn onClick={() => openEdit(bm)} variant="cyan" small>Edit</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* Edit / New Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Bookmark' : 'Bookmark System'} cyan>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <FormInput  label="System Name" value={form.system} onChange={set('system')} placeholder="e.g. Beagle Point" />
          <FormSelect label="Type"        value={form.type}   onChange={set('type')}   options={TYPE_OPTIONS} />
        </div>
        <FormSelect label="Folder / Category" value={form.folder} onChange={set('folder')} options={folderOptions} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <FormInput label="Latitude"       value={form.lat} onChange={set('lat')} placeholder="0.0000" type="number" inputMode="decimal" />
          <FormInput label="Longitude"      value={form.lon} onChange={set('lon')} placeholder="0.0000" type="number" inputMode="decimal" />
          <FormInput label="Altitude/Depth" value={form.z}   onChange={set('z')}   placeholder="0.00"   type="number" inputMode="decimal" />
        </div>
        <FormTextarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="Interesting features, resources..." rows={3} />
        <FormInput    label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="nebula, earth-like, neutron..." />
        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={() => setForm(f => ({ ...f, pinned: !f.pinned }))}
            style={{
              padding: '8px 14px', fontFamily: 'var(--font-hud)', fontSize: '10px', letterSpacing: '2px',
              border: `1px solid ${form.pinned ? '#FFD700' : 'var(--border-c)'}`,
              background: form.pinned ? 'rgba(255,215,0,0.12)' : 'transparent',
              color: form.pinned ? '#FFD700' : 'var(--text-dim)', cursor: 'pointer',
            }}
          >
            {form.pinned ? 'PINNED TO TOP' : 'PIN TO TOP'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          {editing && <Btn onClick={() => { handleDelete(editing); setModal(false); }} variant="red" small>Delete</Btn>}
          <Btn onClick={() => setModal(false)} variant="red" small>Cancel</Btn>
          <Btn onClick={handleSave} variant="cyan" small disabled={!form.system.trim()}>Save Bookmark</Btn>
        </div>
      </Modal>

      {/* Detail View Modal */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Bookmark Detail" cyan>
        {viewModal && (() => {
          const bm = viewModal;
          const hasCoords = bm.lat != null && bm.lon != null;
          const fName = folderName(bm.folder);
          return (
            <div>
              <div style={{ fontFamily: 'var(--font-hud)', fontSize: '18px', color: 'var(--ed-cyan)', marginBottom: '4px' }}>
                {bm.pinned && <span style={{ color: '#FFD700', marginRight: '8px' }}>★</span>}
                {bm.system}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '2px', color: TYPE_COLOR[bm.type] || '#4A6A8A', marginBottom: fName ? '6px' : '16px' }}>{bm.type}</div>
              {fName && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ed-orange)', marginBottom: '16px' }}>{fName}</div>}
              {hasCoords && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px', padding: '8px 10px', border: '1px solid rgba(0,212,255,0.15)', background: 'rgba(5,14,24,0.7)' }}>
                  <span style={{ color: 'var(--ed-cyan)' }}>Lat:</span> {bm.lat}{'  '}
                  <span style={{ color: 'var(--ed-cyan)' }}>Lon:</span> {bm.lon}
                  {bm.z != null && <>{' '}<span style={{ color: 'var(--ed-cyan)' }}>Alt:</span> {bm.z}</>}
                </div>
              )}
              {bm.notes && <div style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '14px', userSelect: 'text', WebkitUserSelect: 'text' }}>{bm.notes}</div>}
              {bm.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {bm.tags.map(t => <Tag key={t} label={t} />)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Btn onClick={async () => { if (!window.confirm('Delete?')) return; await deleteBookmark(bm.id); setViewModal(null); }} variant="red" small>Delete</Btn>
                <Btn onClick={() => { setViewModal(null); openEdit(bm); }} variant="cyan" small>Edit</Btn>
                <Btn onClick={() => setViewModal(null)} variant="orange" small>Close</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

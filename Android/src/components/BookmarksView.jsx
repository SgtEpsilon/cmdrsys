import React, { useState, useMemo } from 'react';
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

const EMPTY_FORM = { system: '', type: 'POI', lat: '', lon: '', z: '', notes: '', tags: '' };

export default function BookmarksView({ bookmarks, upsertBookmark, deleteBookmark, currentSystem }) {
  const [query,    setQuery]    = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [modal,    setModal]    = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [viewModal, setViewModal] = useState(null);

  // Separate text search from tag filter
  const filtered = useMemo(() => {
    const q   = query.toLowerCase();
    const tag = tagFilter.toLowerCase().trim();
    return bookmarks.filter(b => {
      const textMatch = !q || (
        b.system.toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q) ||
        (b.tags || []).some(t => t.toLowerCase().includes(q))
      );
      const tagMatch = !tag || (b.tags || []).some(t => t.toLowerCase().includes(tag));
      return textMatch && tagMatch;
    });
  }, [bookmarks, query, tagFilter]);

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
      // Support both lat/lon (v2) and legacy x/y
      lat:    bm.lat ?? bm.x ?? '',
      lon:    bm.lon ?? bm.y ?? '',
      z:      bm.z ?? '',
      notes:  bm.notes || '',
      tags:   (bm.tags || []).join(', '),
    });
    setModal(true);
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  // Parse a coordinate string that may be empty or a valid negative/positive number
  function parseCoord(val) {
    if (val === '' || val === null || val === undefined) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    if (!form.system.trim()) return;
    await upsertBookmark({
      id:     editing || String(Date.now()),
      ts:     Date.now(),
      system: form.system.trim(),
      type:   form.type,
      lat:    parseCoord(form.lat),
      lon:    parseCoord(form.lon),
      z:      parseCoord(form.z),
      notes:  form.notes.trim(),
      tags:   form.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this bookmark?')) return;
    await deleteBookmark(id);
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
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '16px', color: 'var(--ed-orange)', letterSpacing: '4px' }}>System Bookmarks</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginTop: '3px' }}>Points of interest across the galaxy</div>
        </div>
        <Btn onClick={() => openNew()} variant="cyan" small>+ Bookmark</Btn>
      </div>

      {/* Text search */}
      <SearchBar value={query} onChange={e => setQuery(e.target.value)} placeholder="SEARCH SYSTEMS..." />

      {/* Tag filter */}
      <div style={{ marginBottom: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <input
            type="search"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            placeholder="FILTER BY TAG..."
            style={{
              width: '100%', background: 'rgba(0,0,0,0.4)',
              border: '1px solid var(--border-c)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)', fontSize: '13px',
              padding: '10px 14px', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
            onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
          />
        </div>
        {tagFilter && (
          <Btn onClick={() => setTagFilter('')} variant="red" small>✕</Btn>
        )}
      </div>

      {filtered.length === 0
        ? <Empty icon="◎" text={bookmarks.length === 0 ? 'No bookmarks yet.' : 'No bookmarks match.'} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {filtered.map(bm => {
              const hasCoords = bm.lat != null && bm.lon != null;
              return (
                <div key={bm.id} style={{
                  border: '1px solid var(--border-c)',
                  padding: '13px',
                  background: 'rgba(5,14,24,0.8)',
                  clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                }}>
                  <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', color: 'var(--ed-cyan)', marginBottom: '3px', textShadow: '0 0 8px rgba(0,212,255,0.35)', wordBreak: 'break-word' }}>
                    {bm.system}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: TYPE_COLOR[bm.type] || '#4A6A8A', marginBottom: '7px' }}>
                    {bm.type}
                  </div>
                  {bm.notes && (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: '5px', userSelect: 'text', WebkitUserSelect: 'text' }}>
                      {bm.notes}
                    </div>
                  )}
                  {hasCoords && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '5px' }}>
                      Lat:{bm.lat} Lon:{bm.lon}{bm.z != null ? ` Alt:${bm.z}` : ''}
                    </div>
                  )}
                  {bm.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {bm.tags.map(t => (
                        <Tag
                          key={t}
                          label={t}
                          onClick={() => filterByTag(t)}
                          active={tagFilter === t}
                        />
                      ))}
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

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Bookmark' : 'Bookmark System'} cyan>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <FormInput  label="System Name" value={form.system} onChange={set('system')} placeholder="e.g. Beagle Point" />
          <FormSelect label="Type"        value={form.type}   onChange={set('type')}   options={TYPE_OPTIONS} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <FormInput label="Latitude"        value={form.lat} onChange={set('lat')} placeholder="0.0000" type="number" inputMode="decimal" />
          <FormInput label="Longitude"       value={form.lon} onChange={set('lon')} placeholder="0.0000" type="number" inputMode="decimal" />
          <FormInput label="Altitude/Depth"  value={form.z}   onChange={set('z')}   placeholder="0.00"   type="number" inputMode="decimal" />
        </div>
        <FormTextarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="Interesting features, resources..." rows={3} />
        <FormInput    label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="nebula, earth-like, neutron..." />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          {editing && <Btn onClick={() => { handleDelete(editing); setModal(false); }} variant="red" small>Delete</Btn>}
          <Btn onClick={() => setModal(false)} variant="red" small>Cancel</Btn>
          <Btn onClick={handleSave} variant="cyan" small disabled={!form.system.trim()}>Save Bookmark</Btn>
        </div>
      </Modal>

      {/* ── Detail View Modal ── */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Bookmark Detail" cyan>
        {viewModal && (() => {
          const bm = viewModal;
          const hasCoords = bm.lat != null && bm.lon != null;
          return (
            <div>
              <div style={{ fontFamily: 'var(--font-hud)', fontSize: '18px', color: 'var(--ed-cyan)', marginBottom: '4px' }}>{bm.system}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '2px', color: TYPE_COLOR[bm.type] || '#4A6A8A', marginBottom: '16px' }}>{bm.type}</div>

              {hasCoords && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px', padding: '8px 10px', border: '1px solid rgba(0,212,255,0.15)', background: 'rgba(5,14,24,0.7)' }}>
                  <span style={{ color: 'var(--ed-cyan)' }}>Lat:</span> {bm.lat}{'  '}
                  <span style={{ color: 'var(--ed-cyan)' }}>Lon:</span> {bm.lon}
                  {bm.z != null && <>{' '}<span style={{ color: 'var(--ed-cyan)' }}>Alt:</span> {bm.z}</>}
                </div>
              )}

              {bm.notes && (
                <div style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '14px', userSelect: 'text', WebkitUserSelect: 'text' }}>
                  {bm.notes}
                </div>
              )}

              {bm.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {bm.tags.map(t => <Tag key={t} label={t} />)}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Btn onClick={async () => { if (!window.confirm('Delete this bookmark?')) return; await deleteBookmark(bm.id); setViewModal(null); }} variant="red" small>Delete</Btn>
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

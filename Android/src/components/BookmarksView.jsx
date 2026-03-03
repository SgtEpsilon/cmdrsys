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

const EMPTY_FORM = { system: '', type: 'POI', x: '', y: '', z: '', notes: '', tags: '' };

export default function BookmarksView({ bookmarks, upsertBookmark, deleteBookmark, currentSystem }) {
  const [query,   setQuery]   = useState('');
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return bookmarks.filter(b =>
      b.system.toLowerCase().includes(q) ||
      (b.notes || '').toLowerCase().includes(q) ||
      (b.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [bookmarks, query]);

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
      x:      bm.x ?? '',
      y:      bm.y ?? '',
      z:      bm.z ?? '',
      notes:  bm.notes || '',
      tags:   (bm.tags || []).join(', '),
    });
    setModal(true);
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave() {
    if (!form.system.trim()) return;
    await upsertBookmark({
      id:     editing || String(Date.now()),
      ts:     Date.now(),
      system: form.system.trim(),
      type:   form.type,
      x:      parseFloat(form.x) || null,
      y:      parseFloat(form.y) || null,
      z:      parseFloat(form.z) || null,
      notes:  form.notes.trim(),
      tags:   form.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this bookmark?')) return;
    await deleteBookmark(id);
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

      <SearchBar value={query} onChange={e => setQuery(e.target.value)} placeholder="SEARCH SYSTEMS..." />

      {filtered.length === 0
        ? <Empty icon="◎" text={bookmarks.length === 0 ? 'No bookmarks yet.' : 'No bookmarks match.'} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {filtered.map(bm => (
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
                {bm.x != null && bm.y != null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '5px' }}>
                    X:{bm.x} Y:{bm.y}{bm.z != null ? ` Z:${bm.z}` : ''}
                  </div>
                )}
                {bm.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {bm.tags.map(t => <Tag key={t} label={t} />)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <Btn onClick={() => openEdit(bm)} variant="cyan" small>Edit</Btn>
                  <Btn onClick={() => handleDelete(bm.id)} variant="red" small>Del</Btn>
                </div>
              </div>
            ))}
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
          <FormInput label="Coord X" value={form.x} onChange={set('x')} placeholder="0.00" type="number" />
          <FormInput label="Coord Y" value={form.y} onChange={set('y')} placeholder="0.00" type="number" />
          <FormInput label="Coord Z" value={form.z} onChange={set('z')} placeholder="0.00" type="number" />
        </div>
        <FormTextarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="Interesting features, resources..." rows={3} />
        <FormInput    label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="nebula, earth-like, neutron..." />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn onClick={() => setModal(false)} variant="red" small>Cancel</Btn>
          <Btn onClick={handleSave} variant="cyan" small disabled={!form.system.trim()}>Save Bookmark</Btn>
        </div>
      </Modal>
    </div>
  );
}

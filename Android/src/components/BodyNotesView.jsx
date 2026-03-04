import React, { useState, useMemo } from 'react';
import { Btn, SearchBar, Modal, FormInput, FormTextarea, FormSelect, Tag, Empty } from './UI.jsx';

const BODY_TYPE_OPTIONS = [
  { value: '',                   label: '— Select type —' },
  { value: 'Earth-like',         label: 'Earth-like World' },
  { value: 'Water World',        label: 'Water World' },
  { value: 'Ammonia World',      label: 'Ammonia World' },
  { value: 'High Metal Content', label: 'High Metal Content' },
  { value: 'Metal Rich',         label: 'Metal Rich' },
  { value: 'Rocky',              label: 'Rocky Body' },
  { value: 'Rocky Ice',          label: 'Rocky Ice' },
  { value: 'Icy',                label: 'Icy Body' },
  { value: 'Gas Giant',          label: 'Gas Giant' },
  { value: 'Class I Gas Giant',  label: 'Class I Gas Giant' },
  { value: 'Class II Gas Giant', label: 'Class II Gas Giant' },
  { value: 'Water Giant',        label: 'Water Giant' },
  { value: 'Star',               label: 'Star' },
  { value: 'Neutron',            label: 'Neutron Star' },
  { value: 'BlackHole',          label: 'Black Hole' },
  { value: 'Other',              label: 'Other' },
];

const ATMO_OPTIONS = [
  { value: '', label: '— None / Unknown —' },
  { value: 'No atmosphere',           label: 'No atmosphere' },
  { value: 'Thin CO2',                label: 'Thin CO₂' },
  { value: 'CO2',                     label: 'CO₂' },
  { value: 'Thick CO2',               label: 'Thick CO₂' },
  { value: 'Water',                   label: 'Water' },
  { value: 'Ammonia',                 label: 'Ammonia' },
  { value: 'Methane',                 label: 'Methane' },
  { value: 'Nitrogen',                label: 'Nitrogen' },
  { value: 'Silicate Vapour',         label: 'Silicate Vapour' },
  { value: 'Sulphur Dioxide',         label: 'Sulphur Dioxide' },
  { value: 'Argon',                   label: 'Argon' },
  { value: 'Neon',                    label: 'Neon' },
  { value: 'Oxygen',                  label: 'Oxygen' },
  { value: 'Other',                   label: 'Other' },
];

const TERRAFORM_OPTIONS = [
  { value: '',                    label: '— None —' },
  { value: 'Terraformable',       label: 'Terraformable' },
  { value: 'Terraforming',        label: 'Terraforming' },
  { value: 'Terraformed',         label: 'Terraformed' },
];

const BN_TYPE_ICONS = {
  'Earth-like': '🌍', 'Water World': '🌊', 'Ammonia World': '⚗',
  'Gas Giant': '🪐', 'Class I Gas Giant': '🪐', 'Class II Gas Giant': '🪐',
  'Class III Gas Giant': '🪐', 'Class IV Gas Giant': '🪐', 'Class V Gas Giant': '🪐',
  'Water Giant': '💧', 'Rocky': '🪨', 'Rocky Ice': '🧊', 'Icy': '❄',
  'Metal Rich': '⚙', 'High Metal Content': '⚙', 'Star': '⭐',
  'Neutron': '💫', 'BlackHole': '⚫', 'Other': '◈',
};

const EMPTY_FORM = {
  system: '', body_name: '', body_type: '', atmo_type: '', terraform: '',
  gravity: '', distance_ls: '', bio_signals: '0', geo_signals: '0',
  value: '0', landable: false, notes: '', tags: '',
};

export default function BodyNotesView({ bodyNotes, upsertBodyNote, deleteBodyNote, currentSystem }) {
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [landFilter, setLandFilter] = useState('');
  const [modal,      setModal]      = useState(false);
  const [viewModal,  setViewModal]  = useState(null); // note object for detail view
  const [editing,    setEditing]    = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [coords,     setCoords]     = useState([]); // [{lat,lon,note}]

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return bodyNotes.filter(n => {
      const tm = !q || (
        n.body_name.toLowerCase().includes(q) ||
        (n.system || '').toLowerCase().includes(q) ||
        (n.notes || '').toLowerCase().includes(q)
      );
      const bm = !typeFilter || (n.body_type || '').includes(typeFilter);
      const lm = landFilter === '' ? true : (landFilter === '1' ? !!n.landable : !n.landable);
      return tm && bm && lm;
    });
  }, [bodyNotes, query, typeFilter, landFilter]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, system: currentSystem || '' });
    setCoords([]);
    setModal(true);
  }

  function openEdit(n) {
    setEditing(n.id);
    setForm({
      system:      n.system || '',
      body_name:   n.body_name || '',
      body_type:   n.body_type || '',
      atmo_type:   n.atmo_type || '',
      terraform:   n.terraform || '',
      gravity:     n.gravity != null ? String(n.gravity) : '',
      distance_ls: n.distance_ls != null ? String(n.distance_ls) : '',
      bio_signals: String(n.bio_signals || 0),
      geo_signals: String(n.geo_signals || 0),
      value:       String(n.value || 0),
      landable:    !!n.landable,
      notes:       n.notes || '',
      tags:        (n.tags || []).join(', '),
    });
    setCoords(JSON.parse(JSON.stringify(n.coords || [])));
    setModal(true);
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function addCoord() {
    setCoords(c => [...c, { lat: '', lon: '', note: '' }]);
  }

  function updateCoord(i, field, val) {
    setCoords(c => c.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  function removeCoord(i) {
    setCoords(c => c.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const bname  = form.body_name.trim();
    const system = form.system.trim();
    if (!bname || !system) return;
    const validCoords = coords.filter(c => {
      const lat = parseFloat(c.lat);
      const lon = parseFloat(c.lon);
      return !isNaN(lat) && !isNaN(lon);
    }).map(c => ({ lat: parseFloat(c.lat), lon: parseFloat(c.lon), note: c.note || '' }));

    const note = {
      id:          editing || String(Date.now()),
      ts:          editing ? (bodyNotes.find(x => x.id === editing)?.ts || Date.now()) : Date.now(),
      system,
      body_name:   bname,
      body_type:   form.body_type,
      atmo_type:   form.atmo_type,
      terraform:   form.terraform,
      gravity:     parseFloat(form.gravity) || null,
      distance_ls: parseFloat(form.distance_ls) || null,
      bio_signals: parseInt(form.bio_signals) || 0,
      geo_signals: parseInt(form.geo_signals) || 0,
      value:       parseInt(form.value) || 0,
      landable:    form.landable,
      notes:       form.notes.trim(),
      tags:        form.tags.split(',').map(t => t.trim()).filter(Boolean),
      coords:      validCoords,
    };
    await upsertBodyNote(note);
    setModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this body note?')) return;
    await deleteBodyNote(id);
  }

  const canSave = form.body_name.trim() && form.system.trim();

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '16px', color: 'var(--ed-orange)', letterSpacing: '4px' }}>Body Scan Notes</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginTop: '3px' }}>Planetary &amp; stellar survey data</div>
        </div>
        <Btn onClick={openNew} variant="cyan" small>+ New Scan</Btn>
      </div>

      {/* Search */}
      <SearchBar value={query} onChange={e => setQuery(e.target.value)} placeholder="SEARCH BODIES..." />

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            background: '#050e18', border: '1px solid var(--border-c)',
            color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            fontSize: '11px', padding: '9px 10px', outline: 'none',
          }}
        >
          <option value="">ALL BODY TYPES</option>
          <option value="Earth-like">Earth-like</option>
          <option value="Water">Water World</option>
          <option value="Ammonia">Ammonia World</option>
          <option value="Rocky">Rocky</option>
          <option value="Icy">Icy</option>
          <option value="Gas Giant">Gas Giant</option>
          <option value="Metal">Metal Content</option>
          <option value="Star">Star</option>
          <option value="Neutron">Neutron</option>
          <option value="BlackHole">Black Hole</option>
        </select>
        <select
          value={landFilter}
          onChange={e => setLandFilter(e.target.value)}
          style={{
            background: '#050e18', border: '1px solid var(--border-c)',
            color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            fontSize: '11px', padding: '9px 10px', outline: 'none',
          }}
        >
          <option value="">ALL LANDABILITY</option>
          <option value="1">LANDABLE ONLY</option>
          <option value="0">NOT LANDABLE</option>
        </select>
      </div>

      {/* Cards */}
      {filtered.length === 0
        ? <Empty icon="⬡" text={bodyNotes.length === 0 ? 'No scan notes yet. Tap + New Scan to start.' : 'No bodies match your filter.'} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {filtered.map(n => {
              const icon = BN_TYPE_ICONS[n.body_type] || '◈';
              const coordCount = (n.coords || []).length;
              return (
                <div key={n.id} style={{
                  border: '1px solid rgba(0,212,255,0.25)',
                  padding: '13px',
                  background: 'rgba(5,14,24,0.8)',
                  clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                }}>
                  {/* Body name */}
                  <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', color: 'var(--ed-cyan)', marginBottom: '2px', wordBreak: 'break-word' }}>
                    {n.body_name}
                  </div>
                  {/* System + date */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '7px' }}>
                    ◇ {n.system}
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '7px' }}>
                    {n.body_type && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 5px', border: '1px solid rgba(255,98,0,0.5)', color: 'var(--ed-orange)', letterSpacing: '0.5px' }}>
                        {icon} {n.body_type}
                      </span>
                    )}
                    {n.landable && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 5px', border: '1px solid rgba(0,255,136,0.5)', color: '#00FF88' }}>
                        ✓ LAND
                      </span>
                    )}
                    {n.bio_signals > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 5px', border: '1px solid rgba(180,100,255,0.5)', color: '#C87AFF' }}>
                        🌿 ×{n.bio_signals}
                      </span>
                    )}
                    {n.geo_signals > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 5px', border: '1px solid rgba(255,180,50,0.5)', color: '#FFB432' }}>
                        🌋 ×{n.geo_signals}
                      </span>
                    )}
                    {coordCount > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 5px', border: '1px solid rgba(255,98,0,0.5)', color: 'var(--ed-orange)' }}>
                        📍 {coordCount}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  {(n.gravity != null || n.distance_ls != null) && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '5px' }}>
                      {n.gravity != null && <span>g:{n.gravity} </span>}
                      {n.distance_ls != null && <span>{n.distance_ls}ls</span>}
                    </div>
                  )}

                  {/* Notes preview */}
                  {n.notes && (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.4, marginBottom: '5px',
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {n.notes}
                    </div>
                  )}

                  {/* Coord list (no copy button) */}
                  {coordCount > 0 && (
                    <div style={{ marginTop: '6px', borderTop: '1px solid rgba(0,212,255,0.1)', paddingTop: '6px' }}>
                      {n.coords.map((c, ci) => (
                        <div key={ci} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', padding: '2px 0', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                          <span style={{ color: 'var(--ed-orange)', flexShrink: 0 }}>◈</span>
                          <span style={{ color: 'var(--ed-cyan)' }}>{Number(c.lat).toFixed(4)}°, {Number(c.lon).toFixed(4)}°</span>
                          {c.note && <span style={{ color: 'var(--text-dim)', flex: 1 }}>— {c.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  {n.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px', marginBottom: '2px' }}>
                      {n.tags.map(t => <Tag key={t} label={t} />)}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <Btn onClick={() => setViewModal(n)} variant="orange" small>View</Btn>
                    <Btn onClick={() => openEdit(n)} variant="cyan" small>Edit</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* ── Edit / New Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Scan Note' : 'New Scan Note'} cyan>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <FormInput label="System"    value={form.system}    onChange={set('system')}    placeholder="Star system..." />
          <FormInput label="Body Name" value={form.body_name} onChange={set('body_name')} placeholder="e.g. Sol 3" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <FormSelect label="Body Type"  value={form.body_type}  onChange={set('body_type')}  options={BODY_TYPE_OPTIONS} />
          <FormSelect label="Atmosphere" value={form.atmo_type}  onChange={set('atmo_type')}  options={ATMO_OPTIONS} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <FormInput label="Gravity (g)"  value={form.gravity}     onChange={set('gravity')}     placeholder="0.28" type="number" inputMode="decimal" />
          <FormInput label="Dist (ls)"    value={form.distance_ls} onChange={set('distance_ls')} placeholder="320" type="number" inputMode="decimal" />
          <FormSelect label="Terraform"   value={form.terraform}   onChange={set('terraform')}   options={TERRAFORM_OPTIONS} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <FormInput label="Bio Signals" value={form.bio_signals} onChange={set('bio_signals')} placeholder="0" type="number" inputMode="numeric" />
          <FormInput label="Geo Signals" value={form.geo_signals} onChange={set('geo_signals')} placeholder="0" type="number" inputMode="numeric" />
          <FormInput label="Value (Cr)"  value={form.value}       onChange={set('value')}       placeholder="0" type="number" inputMode="numeric" />
        </div>

        {/* Landable toggle */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
            Landable
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setForm(f => ({ ...f, landable: false }))}
              style={{
                flex: 1, padding: '9px', fontFamily: 'var(--font-hud)', fontSize: '11px', letterSpacing: '2px',
                border: `1px solid ${!form.landable ? '#FF4040' : 'var(--border-c)'}`,
                background: !form.landable ? 'rgba(255,64,64,0.15)' : 'transparent',
                color: !form.landable ? '#FF4040' : 'var(--text-dim)', cursor: 'pointer',
              }}
            >NO</button>
            <button
              onClick={() => setForm(f => ({ ...f, landable: true }))}
              style={{
                flex: 1, padding: '9px', fontFamily: 'var(--font-hud)', fontSize: '11px', letterSpacing: '2px',
                border: `1px solid ${form.landable ? '#00FF88' : 'var(--border-c)'}`,
                background: form.landable ? 'rgba(0,255,136,0.15)' : 'transparent',
                color: form.landable ? '#00FF88' : 'var(--text-dim)', cursor: 'pointer',
              }}
            >YES</button>
          </div>
        </div>

        <FormTextarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="Observations, materials found..." rows={3} />
        <FormInput    label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="first-footfall, guardian..." />

        {/* Surface coordinates */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Surface Coords
            </label>
            <Btn onClick={addCoord} variant="cyan" small>+ Add</Btn>
          </div>
          {coords.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '6px', marginBottom: '7px', alignItems: 'center' }}>
              <input
                type="number" inputMode="decimal" placeholder="Lat"
                value={c.lat}
                onChange={e => updateCoord(i, 'lat', e.target.value)}
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '14px', padding: '8px 10px', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
              />
              <input
                type="number" inputMode="decimal" placeholder="Lon"
                value={c.lon}
                onChange={e => updateCoord(i, 'lon', e.target.value)}
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '14px', padding: '8px 10px', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
              />
              <input
                type="text" placeholder="Note (optional)"
                value={c.note}
                onChange={e => updateCoord(i, 'note', e.target.value)}
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '14px', padding: '8px 10px', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
              />
              <Btn onClick={() => removeCoord(i)} variant="red" small>✕</Btn>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn onClick={() => setModal(false)} variant="red" small>Cancel</Btn>
          <Btn onClick={handleSave} variant="cyan" small disabled={!canSave}>Save Scan</Btn>
        </div>
      </Modal>

      {/* ── Detail View Modal ── */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Scan Detail">
        {viewModal && (() => {
          const n = viewModal;
          const icon = BN_TYPE_ICONS[n.body_type] || '◈';
          return (
            <div>
              <div style={{ fontFamily: 'var(--font-hud)', fontSize: '18px', color: 'var(--ed-cyan)', marginBottom: '4px' }}>{n.body_name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '16px' }}>◇ {n.system}</div>

              {/* Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '14px' }}>
                {n.body_type && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(255,98,0,0.5)', color: 'var(--ed-orange)' }}>{icon} {n.body_type}</span>}
                {n.landable  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(0,255,136,0.5)', color: '#00FF88' }}>✓ LANDABLE</span>}
                {n.atmo_type && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(0,212,255,0.4)', color: 'var(--ed-cyan)' }}>ATM: {n.atmo_type}</span>}
                {n.bio_signals > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(180,100,255,0.5)', color: '#C87AFF' }}>🌿 BIO ×{n.bio_signals}</span>}
                {n.geo_signals > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(255,180,50,0.5)', color: '#FFB432' }}>🌋 GEO ×{n.geo_signals}</span>}
                {n.terraform  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(0,200,80,0.5)', color: '#00C850' }}>TF: {n.terraform}</span>}
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                {n.gravity != null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                    Gravity <span style={{ color: 'var(--ed-cyan)' }}>{n.gravity}g</span>
                  </div>
                )}
                {n.distance_ls != null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                    Distance <span style={{ color: 'var(--ed-cyan)' }}>{n.distance_ls} ls</span>
                  </div>
                )}
                {n.value > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                    Value <span style={{ color: 'var(--ed-cyan)' }}>{n.value.toLocaleString()} Cr</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {n.notes && (
                <div style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '14px', userSelect: 'text', WebkitUserSelect: 'text' }}>
                  {n.notes}
                </div>
              )}

              {/* Coords (no copy button) */}
              {(n.coords || []).length > 0 && (
                <div style={{ borderTop: '1px solid rgba(0,212,255,0.1)', paddingTop: '10px', marginBottom: '14px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginBottom: '8px' }}>SURFACE COORDS</div>
                  {n.coords.map((c, ci) => (
                    <div key={ci} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', padding: '7px 10px', border: '1px solid rgba(0,212,255,0.15)', background: 'rgba(5,14,24,0.7)', marginBottom: '5px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      <span style={{ color: 'var(--ed-orange)', flexShrink: 0 }}>◈</span>
                      <span style={{ color: 'var(--ed-cyan)' }}>{Number(c.lat).toFixed(4)}°, {Number(c.lon).toFixed(4)}°</span>
                      {c.note && <span style={{ color: 'var(--text-dim)', flex: 1 }}>— {c.note}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              {n.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {n.tags.map(t => <Tag key={t} label={t} />)}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Btn onClick={() => { if (!window.confirm('Delete this body note?')) return; handleDelete(n.id); setViewModal(null); }} variant="red" small>Delete</Btn>
                <Btn onClick={() => { setViewModal(null); openEdit(n); }} variant="cyan" small>Edit</Btn>
                <Btn onClick={() => setViewModal(null)} variant="orange" small>Close</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

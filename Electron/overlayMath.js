// overlayMath.js
//
// Pure helpers for the in-game surface-marker overlay. No Electron / DB
// dependencies so it can be unit-tested with plain node.
//
// Elite conventions (Status.json):
//   Latitude  : degrees, +north / -south
//   Longitude : degrees, +east  / -west
//   Heading   : degrees, 0-359, clockwise from north
//   PlanetRadius, Altitude : metres

const DEG = Math.PI / 180;

function normName(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// A body note's body_name may be the full name ("HIP 36601 C 5 a") or just
// the suffix after the system name ("C 5 a"). Accept either.
function noteMatchesBody(note, statusBodyName) {
    const sb  = normName(statusBodyName);
    const bn  = normName(note && note.body_name);
    const sys = normName(note && note.system);
    if (!sb || !bn) return false;
    if (bn === sb) return true;
    if (sys && (sys + ' ' + bn) === sb) return true;
    return false;
}

// Initial great-circle bearing from point 1 to point 2, 0-360 clockwise from north.
function bearingDeg(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / DEG + 360) % 360;
}

// Central angle (radians) between two lat/lon points (haversine).
function centralAngle(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * DEG, p2 = lat2 * DEG;
    const dp = p2 - p1, dl = (lon2 - lon1) * DEG;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Wrap to (-180, 180]
function wrap180(d) {
    return ((d % 360) + 540) % 360 - 180;
}

// Everything the overlay needs for one marker, given a Status.json object.
function computeMarker(status, marker) {
    const R   = Number(status.PlanetRadius);
    const alt = Number(status.Altitude) || 0;
    const hdg = Number(status.Heading)  || 0;
    const th  = centralAngle(status.Latitude, status.Longitude, marker.lat, marker.lon);
    const ground  = R * th;                                   // along the surface
    const range   = Math.sqrt(Math.max(0,
        (R + alt) ** 2 + R ** 2 - 2 * R * (R + alt) * Math.cos(th)));   // straight line
    const bearing = bearingDeg(status.Latitude, status.Longitude, marker.lat, marker.lon);
    return { ground, range, bearing, rel: wrap180(bearing - hdg) };
}

// Merge every coord from every note that matches the body being approached.
function collectMarkers(notes, statusBodyName) {
    const out = [];
    for (const n of notes) {
        if (!noteMatchesBody(n, statusBodyName)) continue;
        (n.coords || []).forEach((c, i) => {
            const lat = Number(c.lat), lon = Number(c.lon);
            if (c.lat === null || c.lon === null || c.lat === undefined || c.lon === undefined) return;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            out.push({
                key:   `${n.id}:${i}`,
                lat, lon,
                label: (c.note && String(c.note).trim()) || `Marker ${String(i + 1).padStart(2, '0')}`,
            });
        });
    }
    return out;
}


// ─── Glide guidance ──────────────────────────────────────────────────────────
// Geometry is done in the 2-D plane containing the ship, the planet's centre
// and the target, on a sphere — so it stays correct from 100+ km up (where
// planet curvature matters) all the way down to the glide-end altitude.
//
//   r1 = R + altitude      (ship)        r2 = R + exitAlt   (aim point, straight
//   θ  = ground distance / R              above the marker at glide-end height)

// Angle BELOW the local horizon at the ship of the straight line to the aim
// point above the marker. This is the pitch (as a positive number of degrees
// nose-down) that flies you to glide-end directly over the target.
function requiredDepression(alt, R, exitAlt, groundDist) {
    const r1 = R + alt, r2 = R + exitAlt, th = groundDist / R;
    return Math.atan2(r1 - r2 * Math.cos(th), r2 * Math.sin(th)) / DEG;
}

// Where a straight path at `gammaDeg` below the horizon reaches the exit
// altitude, as a distance along the surface from the point under the ship.
// null if that path never gets down to the exit altitude.
function glideHitGround(alt, R, exitAlt, gammaDeg) {
    const r1 = R + alt, r2 = R + exitAlt;
    const g = gammaDeg * DEG, sn = Math.sin(g), cs = Math.cos(g);
    if (!(sn > 0) || r1 <= r2) return null;
    const disc = r1 * r1 * sn * sn - (r1 * r1 - r2 * r2);
    if (disc < 0) return null;
    const t = r1 * sn - Math.sqrt(disc);
    if (t < 0) return null;
    return R * Math.atan2(t * cs, r1 - t * sn);
}

// Straight-line distance from the ship to the aim point.
function rangeToAim(alt, R, exitAlt, groundDist) {
    const r1 = R + alt, r2 = R + exitAlt, th = groundDist / R;
    return Math.sqrt(Math.max(0, r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(th)));
}

// The path actually being flown, measured from recent Status.json samples
// ({ t: ms, alt, lat, lon }, oldest first). Uses the newest sample and the
// oldest one within the last 6 s, and needs at least 1.5 s between them.
// Angle is positive when descending. Ground distance is measured at the ship's
// own altitude, not at the surface, so it stays accurate high above small worlds.
function flightPath(samples, R) {
    if (!samples || samples.length < 2) return null;
    const b = samples[samples.length - 1];
    let a = null;
    for (const sm of samples) { if (b.t - sm.t <= 6000) { a = sm; break; } }
    if (!a || a === b) return null;
    const dt = (b.t - a.t) / 1000;
    if (dt < 1.5) return null;
    const rAvg   = R + (a.alt + b.alt) / 2;
    const arc    = centralAngle(a.lat, a.lon, b.lat, b.lon);   // radians of planet swept
    const ground = rAvg * arc;
    const drop   = a.alt - b.alt;
    if (ground < 30 && Math.abs(drop) < 30) return null;   // basically stationary
    // The chord slope is the depression angle at the MIDDLE of the window. The local
    // horizon tilts away by `arc` over the window, so the depression at the newest
    // sample (where the required pitch is computed) is half an arc smaller. Without
    // this the reading is biased steep by up to ~0.8 deg on small worlds.
    const chord = Math.atan2(drop, ground) / DEG;
    return {
        gamma:  chord - (arc / 2) / DEG,                   // + descending, - climbing
        speed:  Math.sqrt(ground * ground + drop * drop) / dt,
        vs:     drop / dt,
    };
}

// Everything the overlay's glide block shows for one target marker.
function glideSolution(status, marker, samples, exitAlt) {
    const R   = Number(status.PlanetRadius);
    const alt = Number(status.Altitude) || 0;
    if (!(R > 0) || !(alt > exitAlt + 50)) return null;     // already at/below glide end
    const c = computeMarker(status, marker);
    if (c.ground < 300) return null;

    const required = requiredDepression(alt, R, exitAlt, c.ground);
    const fp = flightPath(samples, R);
    const out = {
        exitAlt, required, groundM: c.ground,
        actual: null, delta: null, state: 'unknown',
        missM: null, noReach: false, etaS: null, speed: null,
        window: required < 5 ? 'shallow' : required > 60 ? 'steep' : 'ok',
    };
    if (fp) {
        out.actual = fp.gamma;
        out.speed  = fp.speed;
        out.delta  = fp.gamma - required;
        out.state  = out.delta > 1.5 ? 'steep' : out.delta < -1.5 ? 'shallow' : 'ok';
        if (fp.speed > 50) out.etaS = rangeToAim(alt, R, exitAlt, c.ground) / fp.speed;
        // Only predict where glide ends if you're roughly pointed at the target
        if (Math.abs(c.rel) < 45 && fp.gamma > 0.2) {
            const hit = glideHitGround(alt, R, exitAlt, fp.gamma);
            if (hit === null) out.noReach = true;
            else out.missM = c.ground - hit;                // + = ends short, - = ends past
        }
    }
    return out;
}

// Full pipeline: Status.json object + markers -> overlay payload, or null if
// the status doesn't describe a position over a planet's surface.
function buildPayload(status, markers, maxMarkers, onSiteMetres, glideOpts) {
    if (!status || !status.BodyName) return null;
    if (typeof status.Latitude  !== 'number' || typeof status.Longitude !== 'number') return null;
    if (!(Number(status.PlanetRadius) > 0)) return null;
    if (!markers.length) return null;

    const all = markers.map(m => {
        const c = computeMarker(status, m);
        return { key: m.key, label: m.label, dist: c.ground, range: c.range,
                 bearing: c.bearing, rel: c.rel, onSite: c.ground <= (onSiteMetres || 100) };
    }).sort((a, b) => a.dist - b.dist);

    const max = maxMarkers || 6;

    // Glide target: the one the pilot cycled to, else the nearest marker that
    // isn't already underneath them.
    let targetKey = null, glide = null;
    if (glideOpts && glideOpts.enabled) {
        const chosen = (glideOpts.targetKey && all.find(m => m.key === glideOpts.targetKey))
                    || all.find(m => !m.onSite) || null;
        if (chosen) {
            targetKey = chosen.key;
            const mk = markers.find(m => m.key === chosen.key);
            glide = glideSolution(status, mk, glideOpts.samples || [], glideOpts.exitAlt || 5000);
            if (glide) glide.label = chosen.label;
        }
    }

    // Always show the glide target's row, even if it's further than the cut-off.
    let shown = all.slice(0, max);
    if (targetKey && !shown.some(m => m.key === targetKey)) {
        shown = shown.slice(0, Math.max(0, max - 1)).concat(all.find(m => m.key === targetKey));
    }
    shown.forEach(m => { m.target = (m.key === targetKey); });

    return {
        active:   true,
        body:     status.BodyName,
        heading:  Number(status.Heading) || 0,
        altitude: Number(status.Altitude) || 0,
        lat:      status.Latitude,
        lon:      status.Longitude,
        markers:  shown,
        hidden:   Math.max(0, all.length - shown.length),
        order:    all.map(m => m.key),      // nearest-first, for cycling the target
        targetKey,
        glide,
    };
}

module.exports = { normName, noteMatchesBody, bearingDeg, centralAngle, wrap180,
                   computeMarker, collectMarkers, buildPayload,
                   requiredDepression, glideHitGround, rangeToAim, flightPath, glideSolution };

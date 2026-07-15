// netlify/functions/sync.js
// Syncs journal entries between the browser and Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
};

async function supabase(path, method = 'GET', body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
  return method === 'DELETE' ? null : res.json();
}

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // ── GET ALL ENTRIES ──────────────────────────────
    if (req.method === 'GET' && action === 'entries') {
      const data = await supabase('journal_entries?order=date.desc&limit=500');
      return new Response(JSON.stringify(data), { status: 200, headers });
    }

    // ── PUSH ENTRIES TO SUPABASE ─────────────────────
    if (req.method === 'POST' && action === 'entries') {
      const { entries } = await req.json();
      if (!entries?.length) return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

      const rows = entries.map(e => ({
        id: e.id,
        date: e.date,
        spoons: e.spoons || null,
        es: e.es || null,
        pain: e.pain || null,
        flare: e.flare || null,
        o2: e.o2 || null,
        sleep_hours: e.sleepHours ? parseFloat(e.sleepHours) : null,
        sleep_score: e.sleepScore ? parseInt(e.sleepScore) : null,
        sleep_quality: e.sleepQuality || null,
        cpap_hours: e.cpapHours ? parseFloat(e.cpapHours) : null,
        cpap_score: e.cpapScore ? parseInt(e.cpapScore) : null,
        mood: e.mood || null,
        bp_sys: e.bpSys ? parseInt(e.bpSys) : null,
        bp_dia: e.bpDia ? parseInt(e.bpDia) : null,
        hrv: e.hrv ? parseInt(e.hrv) : null,
        spo2_avg: e.spo2Avg ? parseInt(e.spo2Avg) : null,
        spo2_low: e.spo2Low ? parseInt(e.spo2Low) : null,
        weight: e.weight ? parseFloat(e.weight) : null,
        meds: e.meds || [],
        symptoms: e.symptoms || [],
        therapy: e.therapy || [],
        factors: e.factors || [],
        activity: e.activity || [],
        note: e.note || null,
        images: (e.images || []).map(img => ({ name: img.name })) // don't store full dataUrls in DB
      }));

      await supabase('journal_entries?on_conflict=id', 'POST', rows);
      return new Response(JSON.stringify({ ok: true, synced: rows.length }), { status: 200, headers });
    }

    // ── DELETE ENTRY ─────────────────────────────────
    if (req.method === 'DELETE' && action === 'entry') {
      const id = url.searchParams.get('id');
      await supabase(`journal_entries?id=eq.${id}`, 'DELETE');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });

  } catch (err) {
    console.error('Sync error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

export const config = { path: '/api/sync' };

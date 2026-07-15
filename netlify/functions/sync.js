// netlify/functions/sync.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, method, body) {
  method = method || 'GET';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (method === 'DELETE') return null;
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const action = (event.queryStringParameters || {}).action;

  try {
    if (event.httpMethod === 'GET' && action === 'entries') {
      const data = await supabaseRequest('journal_entries?order=date.desc&limit=500');
      return { statusCode: 200, headers: headers, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'POST' && action === 'entries') {
      const body = JSON.parse(event.body || '{}');
      const entries = body.entries || [];
      if (!entries.length) {
        return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, synced: 0 }) };
      }
      const rows = entries.map(function(e) {
        return {
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
          images: (e.images || []).map(function(img) { return { name: img.name }; })
        };
      });
      await supabaseRequest('journal_entries?on_conflict=id', 'POST', rows);
      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, synced: rows.length }) };
    }

    if (event.httpMethod === 'DELETE' && action === 'entry') {
      const id = (event.queryStringParameters || {}).id;
      await supabaseRequest('journal_entries?id=eq.' + id, 'DELETE');
      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('Sync error:', err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};

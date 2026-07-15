// netlify/functions/analyze.js
// Generates AI insights from journal data using Claude

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

async function callClaude(systemPrompt, userMessage) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text;
}

const SYSTEM_BASE = `You are a compassionate health data analyst helping Lauri, a patient with Relapsing Polychondritis, Seronegative RA, Psoriatic Arthritis, chronic hypoxia, and Complex Pain Syndrome. She uses a custom health journal called The Spoonbook. Her existential scale goes 1 (Utopia) to 10 (Fuck — medical emergency). Her spoon count (1-12) reflects daily energy. Be warm, direct, and clinically relevant. Never minimize her experience. Flag anything medically concerning clearly but without alarm.`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  try {
    const { type, entries, dateRange } = await req.json();

    // ── DAILY INSIGHT ────────────────────────────────
    if (type === 'daily') {
      const entry = entries[0];
      const recent = entries.slice(0, 7);

      const entryText = formatEntry(entry);
      const trendText = recent.length > 1
        ? `\n\nRecent context (last ${recent.length} entries):\n` + recent.slice(1).map(formatEntry).join('\n---\n')
        : '';

      const insight = await callClaude(SYSTEM_BASE,
        `Today's journal entry:\n${entryText}${trendText}\n\nGive Lauri a brief, warm daily insight (3-5 sentences). Note any patterns you see, anything worth flagging to her care team, and one encouraging observation. Be specific to her actual data — no generic wellness advice.`
      );

      return new Response(JSON.stringify({ insight }), { status: 200, headers });
    }

    // ── WEEKLY SUMMARY ───────────────────────────────
    if (type === 'weekly') {
      const weekEntries = entries.slice(0, 14); // up to 2 weeks of entries
      const summary = await callClaude(SYSTEM_BASE,
        `Here are Lauri's recent journal entries:\n\n${weekEntries.map(formatEntry).join('\n---\n')}\n\nWrite a weekly health summary covering:\n1. Overall trend (better/worse/stable)\n2. Spoon count and energy patterns\n3. Most frequent symptoms\n4. What factors correlated with better vs worse days\n5. Sleep quality pattern\n6. SpO2 and vitals observations\n7. Anything that warrants clinical attention\n\nKeep it conversational and specific. 200-300 words.`
      );

      return new Response(JSON.stringify({ summary }), { status: 200, headers });
    }

    // ── PROVIDER REPORT ──────────────────────────────
    if (type === 'report') {
      const { provider, specialty } = req.json ? await req.json().catch(() => ({})) : {};
      const reportEntries = entries;

      const report = await callClaude(
        `You are generating a clinical summary for a specialist visit. Lauri has: Relapsing Polychondritis, Seronegative RA, Psoriatic Arthritis, Complex Pain Syndrome & Neuropathy, Chronic Hypoxia on home O2, Paroxysmal AFib (post-ablation), borderline PHTN, OSA on CPAP, Hypothyroidism, Hyperlipidemia, Hypertension, Osteoporosis with pathological fractures, Steroid-induced Myopathy. Current meds include Cellcept 3g, Cimzia 400mg, Prednisone (variable), Lyrica 200mg TID, Tegretol 200mg BID, Metoprolol 50mg, Losartan 50mg, Duloxetine 60mg. Allergies: Ancef, Vancomycin, Compazine, Adhesive Tape, CHG. Format as a structured clinical document.`,
        `Generate a provider-ready clinical summary from these journal entries for a ${specialty || 'specialist'} visit${provider ? ` with ${provider}` : ''}.\n\nEntries covering ${dateRange || 'recent period'}:\n\n${reportEntries.map(formatEntry).join('\n---\n')}\n\nInclude:\n1. PERIOD SUMMARY — dates covered, number of entries\n2. FUNCTIONAL STATUS — average scale scores, spoon counts, pain levels\n3. VITAL SIGNS SUMMARY — BP range, HRV trend, SpO2 average and low values\n4. SYMPTOM FREQUENCY — ranked list with percentage of days present\n5. KEY CORRELATIONS — what factors correlated with better or worse days\n6. SLEEP & CPAP — hours, quality, scores\n7. MEDICATIONS USED — PRN meds taken during this period\n8. FLARE ACTIVITY — number of flares, duration, triggers if identifiable\n9. CLINICALLY SIGNIFICANT FINDINGS — anything warranting discussion\n10. SUGGESTED QUESTIONS — 3-5 specific questions to raise with this provider\n\nBe precise and clinical. Use actual numbers from the data.`
      );

      return new Response(JSON.stringify({ report }), { status: 200, headers });
    }

    // ── CORRELATIONS ─────────────────────────────────
    if (type === 'correlations') {
      const analysis = await callClaude(SYSTEM_BASE,
        `Analyze these ${entries.length} journal entries for Lauri and identify meaningful correlations:\n\n${entries.map(formatEntry).join('\n---\n')}\n\nIdentify:\n1. Top 3 factors that correlate with WORSE days (higher scale score, more symptoms)\n2. Top 3 factors that correlate with BETTER days\n3. Any weather/environmental patterns\n4. Activity impact (does Pilates help or cause post-exertional crashes?)\n5. Sleep quality correlation with next-day function\n6. SpO2 patterns and what precedes low readings\n\nBe specific with percentages or counts where possible. Example: "On days when [factor] was logged, her existential scale averaged X vs Y on other days."`
      );

      return new Response(JSON.stringify({ analysis }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown analysis type' }), { status: 400, headers });

  } catch (err) {
    console.error('Analysis error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

function formatEntry(e) {
  if (!e) return '';
  const lines = [];
  const d = new Date(e.date);
  lines.push(`Date: ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`);
  if (e.flare === 'yes') lines.push('🔥 FLARE DAY');
  if (e.spoons) lines.push(`Spoons: ${e.spoons}/12`);
  if (e.es) lines.push(`Existential Scale: ${e.es}/10`);
  if (e.pain != null) lines.push(`Pain: ${e.pain}/10`);
  if (e.mood) lines.push(`Mood: ${e.mood}`);
  if (e.sleepHours || e.sleep_hours) lines.push(`Sleep: ${e.sleepHours || e.sleep_hours}h${e.sleepQuality || e.sleep_quality ? ` (${(e.sleepQuality || e.sleep_quality)?.label || ''})` : ''}`);
  if (e.sleepScore || e.sleep_score) lines.push(`Sleep Score: ${e.sleepScore || e.sleep_score}`);
  if (e.cpapHours || e.cpap_hours) lines.push(`CPAP: ${e.cpapHours || e.cpap_hours}h${e.cpapScore || e.cpap_score ? ` (score: ${e.cpapScore || e.cpap_score})` : ''}`);
  if ((e.bpSys || e.bp_sys) && (e.bpDia || e.bp_dia)) lines.push(`BP: ${e.bpSys || e.bp_sys}/${e.bpDia || e.bp_dia}`);
  if (e.hrv) lines.push(`HRV: ${e.hrv}ms`);
  if (e.spo2Avg || e.spo2_avg) lines.push(`SpO2 avg: ${e.spo2Avg || e.spo2_avg}%`);
  if (e.spo2Low || e.spo2_low) lines.push(`SpO2 low: ${e.spo2Low || e.spo2_low}%`);
  if (e.weight) lines.push(`Weight: ${e.weight}lbs`);
  if (e.o2 === 'yes') lines.push('On supplemental O2');
  const symptoms = e.symptoms || [];
  if (symptoms.length) lines.push(`Symptoms: ${symptoms.join(', ')}`);
  const therapy = e.therapy || [];
  if (therapy.length) lines.push(`Therapy: ${therapy.join(', ')}`);
  const factors = e.factors || [];
  if (factors.length) lines.push(`Factors: ${factors.join(', ')}`);
  const activity = e.activity || [];
  if (activity.length) lines.push(`Activity: ${activity.join(', ')}`);
  const meds = e.meds || [];
  if (meds.length) lines.push(`Meds taken: ${meds.join(', ')}`);
  if (e.note) lines.push(`Notes: ${e.note}`);
  return lines.join('\n');
}

export const config = { path: '/api/analyze' };

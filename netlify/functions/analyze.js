// netlify/functions/analyze.js
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_BASE = 'You are a compassionate health data analyst helping Lauri, a patient with Relapsing Polychondritis, Seronegative RA, Psoriatic Arthritis, chronic hypoxia, and Complex Pain Syndrome. She uses a custom health journal called The Spoonbook. Her existential scale goes 1 (Utopia) to 10 (Fuck - medical emergency). Her spoon count (1-12) reflects daily energy. Be warm, direct, and clinically relevant. Never minimize her experience. Flag anything medically concerning clearly but without alarm.';

function formatEntry(e) {
  if (!e) return '';
  var lines = [];
  var d = new Date(e.date);
  lines.push('Date: ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
  if (e.flare === 'yes') lines.push('FLARE DAY');
  if (e.spoons) lines.push('Spoons: ' + e.spoons + '/12');
  if (e.es) lines.push('Existential Scale: ' + e.es + '/10');
  if (e.pain != null) lines.push('Pain: ' + e.pain + '/10');
  if (e.mood) lines.push('Mood: ' + e.mood);
  if (e.sleepHours || e.sleep_hours) lines.push('Sleep: ' + (e.sleepHours || e.sleep_hours) + 'h');
  if (e.sleepScore || e.sleep_score) lines.push('Sleep Score: ' + (e.sleepScore || e.sleep_score));
  if (e.cpapHours || e.cpap_hours) lines.push('CPAP: ' + (e.cpapHours || e.cpap_hours) + 'h');
  if (e.cpapScore || e.cpap_score) lines.push('CPAP Score: ' + (e.cpapScore || e.cpap_score));
  if ((e.bpSys || e.bp_sys) && (e.bpDia || e.bp_dia)) lines.push('BP: ' + (e.bpSys || e.bp_sys) + '/' + (e.bpDia || e.bp_dia));
  if (e.hrv) lines.push('HRV: ' + e.hrv + 'ms');
  if (e.spo2Avg || e.spo2_avg) lines.push('SpO2 avg: ' + (e.spo2Avg || e.spo2_avg) + '%');
  if (e.spo2Low || e.spo2_low) lines.push('SpO2 low: ' + (e.spo2Low || e.spo2_low) + '%');
  if (e.weight) lines.push('Weight: ' + e.weight + 'lbs');
  if (e.o2 === 'yes') lines.push('On supplemental O2');
  if (e.symptoms && e.symptoms.length) lines.push('Symptoms: ' + e.symptoms.join(', '));
  if (e.therapy && e.therapy.length) lines.push('Therapy: ' + e.therapy.join(', '));
  if (e.factors && e.factors.length) lines.push('Factors: ' + e.factors.join(', '));
  if (e.activity && e.activity.length) lines.push('Activity: ' + e.activity.join(', '));
  if (e.meds && e.meds.length) lines.push('Meds taken: ' + e.meds.join(', '));
  if (e.note) lines.push('Notes: ' + e.note);
  return lines.join('\n');
}

async function callClaude(system, userMessage) {
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: system,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Anthropic error: ' + errText);
  }
  var data = await res.json();
  return data.content[0].text;
}

exports.handler = async function(event, context) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    var body = JSON.parse(event.body || '{}');
    var type = body.type;
    var entries = body.entries || [];
    var specialty = body.specialty || 'Specialist';
    var dateRange = body.dateRange || 'recent period';

    if (type === 'daily') {
      var entry = entries[0];
      var recent = entries.slice(1, 7);
      var entryText = formatEntry(entry);
      var trendText = recent.length > 0 ? '\n\nRecent context:\n' + recent.map(formatEntry).join('\n---\n') : '';
      var insight = await callClaude(SYSTEM_BASE,
        'Today\'s journal entry:\n' + entryText + trendText + '\n\nGive Lauri a brief, warm daily insight (3-5 sentences). Note any patterns, anything worth flagging to her care team, and one encouraging observation. Be specific to her actual data.');
      return { statusCode: 200, headers: headers, body: JSON.stringify({ insight: insight }) };
    }

    if (type === 'weekly') {
      var weekEntries = entries.slice(0, 14);
      var summary = await callClaude(SYSTEM_BASE,
        'Here are Lauri\'s recent journal entries:\n\n' + weekEntries.map(formatEntry).join('\n---\n') + '\n\nWrite a weekly health summary covering:\n1. Overall trend\n2. Spoon count and energy patterns\n3. Most frequent symptoms\n4. What factors correlated with better vs worse days\n5. Sleep quality pattern\n6. SpO2 and vitals observations\n7. Anything warranting clinical attention\n\nKeep it conversational and specific. 200-300 words.');
      return { statusCode: 200, headers: headers, body: JSON.stringify({ summary: summary }) };
    }

    if (type === 'correlations') {
      var analysis = await callClaude(SYSTEM_BASE,
        'Analyze these ' + entries.length + ' journal entries for Lauri and identify meaningful correlations:\n\n' + entries.map(formatEntry).join('\n---\n') + '\n\nIdentify:\n1. Top 3 factors that correlate with WORSE days\n2. Top 3 factors that correlate with BETTER days\n3. Any weather/environmental patterns\n4. Activity impact\n5. Sleep quality correlation with next-day function\n6. SpO2 patterns\n\nBe specific with percentages or counts where possible.');
      return { statusCode: 200, headers: headers, body: JSON.stringify({ analysis: analysis }) };
    }

    if (type === 'report') {
      var reportSystem = 'You are generating a clinical summary for a specialist visit. Lauri has: Relapsing Polychondritis, Seronegative RA, Psoriatic Arthritis, Complex Pain Syndrome, Chronic Hypoxia on home O2, Paroxysmal AFib (post-ablation), borderline PHTN, OSA on CPAP, Hypothyroidism, Hyperlipidemia, Hypertension, Osteoporosis with pathological fractures, Steroid-induced Myopathy. Current meds include Cellcept 3g, Cimzia 400mg, Prednisone (variable), Lyrica 200mg TID, Tegretol 200mg BID, Metoprolol 50mg, Losartan 50mg, Duloxetine 60mg. Allergies: Ancef, Vancomycin, Compazine, Adhesive Tape, CHG. Format as a structured clinical document.';
      var report = await callClaude(reportSystem,
        'Generate a provider-ready clinical summary for a ' + specialty + ' visit covering ' + dateRange + '.\n\nEntries:\n\n' + entries.map(formatEntry).join('\n---\n') + '\n\nInclude:\n1. PERIOD SUMMARY\n2. FUNCTIONAL STATUS - average scores, spoon counts, pain levels\n3. VITAL SIGNS SUMMARY - BP, HRV, SpO2\n4. SYMPTOM FREQUENCY - ranked list\n5. KEY CORRELATIONS\n6. SLEEP & CPAP\n7. MEDICATIONS USED\n8. FLARE ACTIVITY\n9. CLINICALLY SIGNIFICANT FINDINGS\n10. SUGGESTED QUESTIONS for this provider\n\nBe precise and clinical. Use actual numbers.');
      return { statusCode: 200, headers: headers, body: JSON.stringify({ report: report }) };
    }

    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Unknown type' }) };

  } catch (err) {
    console.error('Analysis error:', err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};

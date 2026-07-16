// netlify/functions/analyze.js
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_BASE = 'You are a compassionate health analyst for Lauri, who has Relapsing Polychondritis, Seronegative RA, Psoriatic Arthritis, Complex Pain Syndrome, chronic hypoxia on home O2, OSA on CPAP, borderline PHTN, and steroid-induced myopathy. She tracks health in The Spoonbook. Her existential scale: 1=Utopia, 10=Medical emergency. Spoons 1-12 = daily energy. HRV of 10-14ms is critically low for her. SpO2 below 88% is dangerous. Post-exertional malaise is real — Pilates often causes next-day crashes. She also tracks daily intake (caffeine, water, alcohol, calories, steps) and whether she hit 75g+ protein — protein matters because of her steroid-induced myopathy (muscle wasting), hydration matters given Cellcept and PRN Lasix, and alcohol/caffeine can affect BP, HRV, and sleep. Be warm, direct, specific to her data. Never generic. Flag concerns clearly but calmly.';

const SPECIALTY_LENSES = {
  pcp: 'Focus on: overall functional trend, weight changes, mood patterns, medication adherence, sleep quality, hydration and caffeine/alcohol intake, protein adequacy relative to the 75g/day goal (relevant to steroid-induced myopathy), step count as a functional proxy, and any symptoms that cut across multiple systems. Give a complete picture.',
  rheum: 'Focus on: existential scale trends, flare activity, joint pain frequency, symptom patterns (ear, eye, cartilage), post-exertional crashes after Pilates, PRN medication use, factors correlating with flares, and protein intake relative to the 75g/day goal (important for preserving muscle given steroid-induced myopathy). Current meds: Cellcept 3g, Cimzia 400mg, Prednisone variable, Lyrica, Tegretol, Colchicine, Celebrex.',
  cardiology: 'Focus on: BP range and trends (she runs low — systolic often 98-118), HRV trends (her baseline is critically low at 10-16ms), SpO2 average and low values, O2 usage, activity tolerance, any pre-syncope or syncope episodes, palpitation symptoms, and caffeine/alcohol intake in relation to BP, HRV, and palpitations.',
  pulmonary: 'Focus on: SpO2 average and LOW values (flag anything below 88%), CPAP hours and score trends, breathlessness frequency, activity and its effect on symptoms (including step count as an objective functional measure), O2 usage patterns, sleep quality in context of OSA.',
  gi: 'Focus on: nausea episodes and frequency, any GI symptoms mentioned in notes, medication timing issues (she takes many meds that affect GI), weight trends, calorie intake, alcohol and caffeine intake, and any food-related patterns in notes.',
  gu: 'Focus on: any urinary symptoms, fluid retention patterns, weight fluctuations, Lasix PRN use, edema mentions in notes, daily water intake (oz), and alcohol use in relation to fluid balance.',
  gyn: 'Focus on: mood patterns and hormonal correlations, weight trends, any relevant symptoms. She is surgically menopausal on estradiol gel 1mg daily.'
};

const SPECIALTY_NAMES = {
  pcp: 'Primary Care',
  rheum: 'Rheumatology',
  cardiology: 'Cardiology',
  pulmonary: 'Pulmonology',
  gi: 'Gastroenterology',
  gu: 'Urology/Nephrology',
  gyn: 'Gynecology'
};

function formatEntry(e) {
  if (!e) return '';
  var lines = [];
  var d = new Date(e.date);
  lines.push('Date: ' + d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' }));
  if (e.flare === 'yes') lines.push('*** FLARE DAY ***');
  if (e.spoons) lines.push('Spoons: ' + e.spoons + '/12');
  if (e.es) lines.push('Existential Scale: ' + e.es + '/10');
  if (e.pain != null) lines.push('Pain: ' + e.pain + '/10');
  if (e.mood) lines.push('Mood: ' + e.mood);
  var dayRating = e.dayRating || e.day_rating;
  if (dayRating) lines.push('Overall Day Rating: ' + (dayRating.label || dayRating) + (dayRating.emoji ? ' ' + dayRating.emoji : ''));
  if (e.sleepHours || e.sleep_hours) lines.push('Sleep: ' + (e.sleepHours || e.sleep_hours) + 'h' + (e.sleepQuality || e.sleep_quality ? ' (' + ((e.sleepQuality || e.sleep_quality).label || '') + ')' : ''));
  if (e.sleepScore || e.sleep_score) lines.push('Sleep Score: ' + (e.sleepScore || e.sleep_score));
  if (e.cpapHours || e.cpap_hours) lines.push('CPAP: ' + (e.cpapHours || e.cpap_hours) + 'h, Score: ' + (e.cpapScore || e.cpap_score || '?'));
  if ((e.bpSys || e.bp_sys) && (e.bpDia || e.bp_dia)) lines.push('BP: ' + (e.bpSys || e.bp_sys) + '/' + (e.bpDia || e.bp_dia));
  if (e.hrv) lines.push('HRV: ' + e.hrv + 'ms' + (parseInt(e.hrv) < 15 ? ' [CRITICALLY LOW]' : ''));
  if (e.spo2Avg || e.spo2_avg) lines.push('SpO2 avg: ' + (e.spo2Avg || e.spo2_avg) + '%');
  if (e.spo2Low || e.spo2_low) lines.push('SpO2 low: ' + (e.spo2Low || e.spo2_low) + '%' + (parseInt(e.spo2Low || e.spo2_low) < 88 ? ' [BELOW THRESHOLD]' : ''));
  if (e.weight) lines.push('Weight: ' + e.weight + 'lbs');
  if (e.o2 === 'yes') lines.push('On supplemental O2: Yes');
  var caffeine = e.caffeineCups || e.caffeine_cups;
  if (caffeine) lines.push('Caffeine: ' + caffeine + ' cups');
  var water = e.waterOz || e.water_oz;
  if (water) lines.push('Water: ' + water + 'oz');
  var alcohol = e.alcoholDrinks || e.alcohol_drinks;
  if (alcohol) lines.push('Alcohol: ' + alcohol + ' drink' + (parseFloat(alcohol) === 1 ? '' : 's'));
  if (e.calories) lines.push('Calories: ' + e.calories);
  if (e.steps) lines.push('Steps: ' + e.steps);
  var protein75 = e.protein75 || e.protein_75;
  if (protein75) lines.push('Protein 75g+: ' + (protein75 === 'yes' ? 'Yes' : 'No'));
  if (e.symptoms && e.symptoms.length) lines.push('Symptoms: ' + e.symptoms.join(', '));
  if (e.therapy && e.therapy.length) lines.push('Therapy/Devices: ' + e.therapy.join(', '));
  if (e.factors && e.factors.length) lines.push('Factors: ' + e.factors.join(', '));
  if (e.activity && e.activity.length) lines.push('Activity: ' + e.activity.join(', '));
  if (e.meds && e.meds.length) lines.push('PRN Meds used: ' + e.meds.join(', '));
  if (e.note) lines.push('Notes: ' + e.note);
  return lines.join('\n');
}

async function callClaude(system, userMessage, maxTokens) {
  maxTokens = maxTokens || 1024;
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
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

function avg(arr, decimals) {
  if (!arr.length) return null;
  var sum = arr.reduce(function(a,b){ return a+b; }, 0);
  return (sum/arr.length).toFixed(decimals == null ? 1 : decimals);
}

function calcStats(entries) {
  var stats = {
    count: entries.length,
    avgES: 0, avgPain: 0, avgSpoons: 0, avgHRV: 0,
    avgSpo2: 0, lowSpo2: [], bpReadings: [],
    flares: 0, symptomCounts: {}, factorCounts: {},
    activityDays: {}, sleepHours: [], sleepScores: [],
    cpapHours: [], cpapScores: [], weights: [],
    moodCounts: {}, o2Days: 0,
    caffeineCups: [], waterOz: [], alcoholDrinks: [], calories: [], steps: [],
    proteinYesDays: 0, proteinNoDays: 0, dayRatingCounts: {}
  };
  var esCount=0, painCount=0, spoonCount=0, hrvCount=0, spo2Count=0;
  entries.forEach(function(e) {
    if (e.es) { stats.avgES += e.es; esCount++; }
    if (e.pain != null) { stats.avgPain += e.pain; painCount++; }
    if (e.spoons) { stats.avgSpoons += e.spoons; spoonCount++; }
    if (e.hrv) { stats.avgHRV += parseInt(e.hrv); hrvCount++; }
    if (e.spo2Avg || e.spo2_avg) { stats.avgSpo2 += parseInt(e.spo2Avg || e.spo2_avg); spo2Count++; }
    if (e.spo2Low || e.spo2_low) stats.lowSpo2.push(parseInt(e.spo2Low || e.spo2_low));
    if (e.bpSys && e.bpDia) stats.bpReadings.push({ s: parseInt(e.bpSys||e.bp_sys), d: parseInt(e.bpDia||e.bp_dia) });
    if (e.flare === 'yes') stats.flares++;
    if (e.o2 === 'yes') stats.o2Days++;
    if (e.sleepHours || e.sleep_hours) stats.sleepHours.push(parseFloat(e.sleepHours || e.sleep_hours));
    if (e.sleepScore || e.sleep_score) stats.sleepScores.push(parseInt(e.sleepScore || e.sleep_score));
    if (e.cpapHours || e.cpap_hours) stats.cpapHours.push(parseFloat(e.cpapHours || e.cpap_hours));
    if (e.cpapScore || e.cpap_score) stats.cpapScores.push(parseInt(e.cpapScore || e.cpap_score));
    if (e.weight) stats.weights.push(parseFloat(e.weight));
    if (e.mood) stats.moodCounts[e.mood] = (stats.moodCounts[e.mood] || 0) + 1;
    (e.symptoms || []).forEach(function(s) { stats.symptomCounts[s] = (stats.symptomCounts[s] || 0) + 1; });
    (e.factors || []).forEach(function(f) { stats.factorCounts[f] = (stats.factorCounts[f] || 0) + 1; });
    (e.activity || []).forEach(function(a) { stats.activityDays[a] = (stats.activityDays[a] || 0) + 1; });

    var caffeine = e.caffeineCups || e.caffeine_cups;
    if (caffeine) stats.caffeineCups.push(parseFloat(caffeine));
    var water = e.waterOz || e.water_oz;
    if (water) stats.waterOz.push(parseFloat(water));
    var alcohol = e.alcoholDrinks || e.alcohol_drinks;
    if (alcohol) stats.alcoholDrinks.push(parseFloat(alcohol));
    if (e.calories) stats.calories.push(parseFloat(e.calories));
    if (e.steps) stats.steps.push(parseFloat(e.steps));
    var protein75 = e.protein75 || e.protein_75;
    if (protein75 === 'yes') stats.proteinYesDays++;
    else if (protein75 === 'no') stats.proteinNoDays++;
    var dayRating = e.dayRating || e.day_rating;
    if (dayRating) {
      var lbl = dayRating.label || dayRating;
      stats.dayRatingCounts[lbl] = (stats.dayRatingCounts[lbl] || 0) + 1;
    }
  });
  if (esCount) stats.avgES = (stats.avgES/esCount).toFixed(1);
  if (painCount) stats.avgPain = (stats.avgPain/painCount).toFixed(1);
  if (spoonCount) stats.avgSpoons = (stats.avgSpoons/spoonCount).toFixed(1);
  if (hrvCount) stats.avgHRV = (stats.avgHRV/hrvCount).toFixed(0);
  if (spo2Count) stats.avgSpo2 = (stats.avgSpo2/spo2Count).toFixed(0);
  stats.minSpo2 = stats.lowSpo2.length ? Math.min.apply(null, stats.lowSpo2) : null;
  stats.avgSleepHours = stats.sleepHours.length ? (stats.sleepHours.reduce(function(a,b){return a+b;},0)/stats.sleepHours.length).toFixed(1) : null;
  stats.avgSleepScore = stats.sleepScores.length ? (stats.sleepScores.reduce(function(a,b){return a+b;},0)/stats.sleepScores.length).toFixed(0) : null;
  stats.avgCpapHours = stats.cpapHours.length ? (stats.cpapHours.reduce(function(a,b){return a+b;},0)/stats.cpapHours.length).toFixed(1) : null;
  stats.avgCpapScore = stats.cpapScores.length ? (stats.cpapScores.reduce(function(a,b){return a+b;},0)/stats.cpapScores.length).toFixed(0) : null;
  if (stats.bpReadings.length) {
    stats.avgBpSys = (stats.bpReadings.reduce(function(a,b){return a+b.s;},0)/stats.bpReadings.length).toFixed(0);
    stats.avgBpDia = (stats.bpReadings.reduce(function(a,b){return a+b.d;},0)/stats.bpReadings.length).toFixed(0);
  }
  stats.avgCaffeine = avg(stats.caffeineCups, 1);
  stats.avgWaterOz = avg(stats.waterOz, 0);
  stats.avgAlcohol = avg(stats.alcoholDrinks, 1);
  stats.avgCalories = avg(stats.calories, 0);
  stats.avgSteps = avg(stats.steps, 0);
  stats.proteinGoalDays = stats.proteinYesDays; // days hitting 75g+
  stats.proteinTrackedDays = stats.proteinYesDays + stats.proteinNoDays;
  stats.topSymptoms = Object.entries(stats.symptomCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  stats.topFactors = Object.entries(stats.factorCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
  return stats;
}

exports.handler = async function(event, context) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    var body = JSON.parse(event.body || '{}');
    var type = body.type;
    var entries = body.entries || [];
    var specialty = body.specialty || 'pcp';
    var dateRange = body.dateRange || 'recent period';
    var lastVisit = body.lastVisit || null;

    // ── 1. DAILY INSIGHT WITH ACTION TIER ────────────────
    if (type === 'daily') {
      var entry = entries[0];
      var recent = entries.slice(1, 6);
      var recentText = recent.length ? '\n\nPrevious entries for context:\n' + recent.map(formatEntry).join('\n---\n') : '';

      var insight = await callClaude(SYSTEM_BASE,
        'Today\'s entry:\n' + formatEntry(entry) + recentText + '\n\n' +
        'Respond with a JSON object only, no other text:\n' +
        '{\n' +
        '  "tier": "rest" | "light" | "full" | "checkin",\n' +
        '  "headline": "One short sentence — the main takeaway",\n' +
        '  "insight": "2-3 sentences — specific observations from today\'s data and recent trend",\n' +
        '  "action": "1-2 sentences — concrete next action recommendation",\n' +
        '  "flag": "One sentence if something is clinically concerning, otherwise empty string"\n' +
        '}\n\n' +
        'Tier guide: rest=significant symptoms/low spoons/high scale; light=moderate symptoms, some capacity; full=good spoons/low scale/feeling okay; checkin=SpO2 below 88%, HRV below 12, flare+high pain+balance issues together, or other urgent concern. Low protein or alcohol intake on a rest/checkin day is a reasonable thing to mention in the insight or action (e.g. protein for muscle preservation, alcohol/hydration for recovery) but should not by itself change the tier.\n' +
        'Be specific — reference her actual numbers, not generic advice.',
        512
      );

      // Parse JSON response
      var parsed;
      try {
        var clean = insight.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch(e) {
        parsed = { tier: 'light', headline: 'Entry saved.', insight: insight, action: '', flag: '' };
      }
      return { statusCode: 200, headers: headers, body: JSON.stringify({ insight: parsed }) };
    }

    // ── 2. WEEKLY SUMMARY WITH CHART DATA ────────────────
    if (type === 'weekly') {
      var weekEntries = entries.slice(0, 21); // up to 3 weeks
      var stats = calcStats(weekEntries);

      // Build chart data for frontend
      var chartData = {
        dates: [],
        spoons: [],
        es: [],
        pain: [],
        spo2Low: [],
        sleepHours: [],
        sleepScore: [],
        hrv: [],
        steps: [],
        waterOz: []
      };

      // Group by date (take worst/last entry per day)
      var byDate = {};
      weekEntries.forEach(function(e) {
        var d = new Date(e.date).toLocaleDateString('en-US', { month:'short', day:'numeric' });
        if (!byDate[d] || e.es > (byDate[d].es || 0)) byDate[d] = e;
      });
      Object.keys(byDate).sort(function(a,b){ return new Date(byDate[a].date) - new Date(byDate[b].date); }).forEach(function(d) {
        var e = byDate[d];
        chartData.dates.push(d);
        chartData.spoons.push(e.spoons || null);
        chartData.es.push(e.es || null);
        chartData.pain.push(e.pain || null);
        chartData.spo2Low.push(parseInt(e.spo2Low || e.spo2_low) || null);
        chartData.sleepHours.push(parseFloat(e.sleepHours || e.sleep_hours) || null);
        chartData.sleepScore.push(parseInt(e.sleepScore || e.sleep_score) || null);
        chartData.hrv.push(parseInt(e.hrv) || null);
        chartData.steps.push(parseInt(e.steps) || null);
        chartData.waterOz.push(parseFloat(e.waterOz || e.water_oz) || null);
      });

      var summary = await callClaude(SYSTEM_BASE,
        'Journal entries (' + weekEntries.length + ' entries):\n\n' + weekEntries.map(formatEntry).join('\n---\n') +
        '\n\nStats summary:\n' +
        'Avg existential scale: ' + stats.avgES + '/10\n' +
        'Avg spoons: ' + stats.avgSpoons + '/12\n' +
        'Avg pain: ' + stats.avgPain + '/10\n' +
        'Avg HRV: ' + stats.avgHRV + 'ms\n' +
        'Avg SpO2: ' + stats.avgSpo2 + '% | Lowest SpO2: ' + stats.minSpo2 + '%\n' +
        'Flare days: ' + stats.flares + '\n' +
        (stats.avgCaffeine ? 'Avg caffeine: ' + stats.avgCaffeine + ' cups/day\n' : '') +
        (stats.avgWaterOz ? 'Avg water: ' + stats.avgWaterOz + 'oz/day\n' : '') +
        (stats.avgAlcohol ? 'Avg alcohol: ' + stats.avgAlcohol + ' drinks/day\n' : '') +
        (stats.avgCalories ? 'Avg calories: ' + stats.avgCalories + '/day\n' : '') +
        (stats.avgSteps ? 'Avg steps: ' + stats.avgSteps + '/day\n' : '') +
        (stats.proteinTrackedDays ? 'Hit 75g+ protein: ' + stats.proteinGoalDays + ' of ' + stats.proteinTrackedDays + ' tracked days\n' : '') +
        'Top symptoms: ' + stats.topSymptoms.map(function(s){ return s[0] + ' (' + s[1] + ' days)'; }).join(', ') + '\n\n' +
        'Write a weekly health narrative covering:\n' +
        '1. Overall trend and what the numbers actually mean for her\n' +
        '2. Sleep and CPAP patterns\n' +
        '3. SpO2 and HRV — any concerning patterns\n' +
        '4. What factors or activities correlated with worse days\n' +
        '5. What correlated with better days\n' +
        '6. Intake patterns worth noting — hydration, caffeine, alcohol, protein goal (75g+), steps — and anything that seems linked to how she felt\n' +
        '7. One thing that deserves clinical attention\n\n' +
        'Be specific with numbers. Warm but direct. 250-350 words.',
        1200
      );

      return { statusCode: 200, headers: headers, body: JSON.stringify({ summary: summary, chartData: chartData, stats: stats }) };
    }

    // ── 3. PROVIDER REPORT ───────────────────────────────
    if (type === 'report') {
      var specialtyName = SPECIALTY_NAMES[specialty] || 'Specialist';
      var specialtyLens = SPECIALTY_LENSES[specialty] || SPECIALTY_LENSES.pcp;
      var stats = calcStats(entries);

      // Build "what changed since last visit" if lastVisit provided
      var changesSince = '';
      if (lastVisit) {
        var lastVisitDate = new Date(lastVisit);
        var sinceEntries = entries.filter(function(e) { return new Date(e.date) >= lastVisitDate; });
        var beforeEntries = entries.filter(function(e) { return new Date(e.date) < lastVisitDate; });
        if (sinceEntries.length && beforeEntries.length) {
          var sinceStats = calcStats(sinceEntries);
          var beforeStats = calcStats(beforeEntries);
          changesSince = '\n\nCHANGES SINCE LAST VISIT (' + new Date(lastVisit).toLocaleDateString() + '):\n' +
            'Scale: ' + beforeStats.avgES + ' → ' + sinceStats.avgES + '\n' +
            'Spoons: ' + beforeStats.avgSpoons + ' → ' + sinceStats.avgSpoons + '\n' +
            'HRV: ' + beforeStats.avgHRV + 'ms → ' + sinceStats.avgHRV + 'ms\n' +
            'Avg SpO2: ' + beforeStats.avgSpo2 + '% → ' + sinceStats.avgSpo2 + '%\n';
        }
      }

      var reportSystem = SYSTEM_BASE + ' ' + specialtyLens;

      // Generate full report
      var fullReport = await callClaude(reportSystem,
        'Generate a ' + specialtyName + ' visit report for Lauri covering ' + dateRange + ' (' + entries.length + ' entries).\n\n' +
        'STATISTICS:\n' +
        'Avg scale: ' + stats.avgES + '/10 | Avg spoons: ' + stats.avgSpoons + '/12 | Avg pain: ' + stats.avgPain + '/10\n' +
        (stats.avgBpSys ? 'BP avg: ' + stats.avgBpSys + '/' + stats.avgBpDia + '\n' : '') +
        'HRV avg: ' + stats.avgHRV + 'ms\n' +
        'SpO2 avg: ' + stats.avgSpo2 + '% | Lowest SpO2: ' + stats.minSpo2 + '%\n' +
        (stats.avgSleepHours ? 'Sleep avg: ' + stats.avgSleepHours + 'h | Sleep score avg: ' + stats.avgSleepScore + '\n' : '') +
        (stats.avgCpapHours ? 'CPAP avg: ' + stats.avgCpapHours + 'h | CPAP score avg: ' + stats.avgCpapScore + '\n' : '') +
        'Flare days: ' + stats.flares + ' | O2 days: ' + stats.o2Days + '\n' +
        (stats.avgCaffeine ? 'Avg caffeine: ' + stats.avgCaffeine + ' cups/day\n' : '') +
        (stats.avgWaterOz ? 'Avg water: ' + stats.avgWaterOz + 'oz/day\n' : '') +
        (stats.avgAlcohol ? 'Avg alcohol: ' + stats.avgAlcohol + ' drinks/day\n' : '') +
        (stats.avgCalories ? 'Avg calories: ' + stats.avgCalories + '/day\n' : '') +
        (stats.avgSteps ? 'Avg steps: ' + stats.avgSteps + '/day\n' : '') +
        (stats.proteinTrackedDays ? 'Hit 75g+ protein: ' + stats.proteinGoalDays + ' of ' + stats.proteinTrackedDays + ' tracked days\n' : '') +
        'Top symptoms: ' + stats.topSymptoms.map(function(s){ return s[0] + ' (' + Math.round(s[1]/stats.count*100) + '% of days)'; }).join(', ') + '\n' +
        'Top factors: ' + stats.topFactors.map(function(f){ return f[0] + ' (' + f[1] + ' days)'; }).join(', ') + '\n' +
        changesSince + '\n\nSELECTED ENTRIES:\n' + entries.slice(0, 15).map(formatEntry).join('\n---\n') +
        '\n\nWrite a structured clinical report with these sections:\n' +
        '## PERIOD SUMMARY\n## FUNCTIONAL STATUS\n## KEY FINDINGS\n## SYMPTOM ANALYSIS\n## TRENDS & PATTERNS\n## SINCE LAST VISIT (if applicable)\n## RECOMMENDED DISCUSSION POINTS\n\n' +
        'Be specific with numbers. Clinical but readable. Flag anything urgent. Only mention intake/protein/steps data if it is relevant to ' + specialtyName + '.',
        1500
      );

      // Generate 200-character portal message
      var portalMsg = await callClaude(reportSystem,
        'Based on this data for a ' + specialtyName + ' visit:\n' +
        'Period: ' + dateRange + ', ' + entries.length + ' entries\n' +
        'Avg scale: ' + stats.avgES + '/10, Spoons: ' + stats.avgSpoons + '/12, Pain: ' + stats.avgPain + '/10\n' +
        'HRV: ' + stats.avgHRV + 'ms, SpO2 avg: ' + stats.avgSpo2 + '%, SpO2 low: ' + stats.minSpo2 + '%\n' +
        'Flares: ' + stats.flares + ', Top symptoms: ' + stats.topSymptoms.slice(0,4).map(function(s){return s[0];}).join(', ') + '\n' +
        (stats.proteinTrackedDays ? 'Protein 75g+: ' + stats.proteinGoalDays + '/' + stats.proteinTrackedDays + ' days\n' : '') +
        '\n\nWrite ONE patient portal message of MAXIMUM 200 characters total (including spaces). It must be dense with the most clinically relevant data for ' + specialtyName + '. No greeting, no sign-off. Just data. Count characters carefully.',
        150
      );

      return { statusCode: 200, headers: headers, body: JSON.stringify({
        report: fullReport,
        portalMessage: portalMsg.trim(),
        stats: stats,
        specialty: specialtyName,
        dateRange: dateRange
      })};
    }

    // ── CORRELATIONS ────────────────────────────────────
    if (type === 'correlations') {
      var stats = calcStats(entries);
      var analysis = await callClaude(SYSTEM_BASE,
        'Analyze ' + entries.length + ' journal entries for Lauri.\n\n' +
        entries.map(formatEntry).join('\n---\n') +
        '\n\nIdentify:\n1. Top 3 factors correlating with WORSE days (higher scale, more symptoms)\n2. Top 3 factors correlating with BETTER days\n3. Pilates impact — does it help or cause post-exertional crashes?\n4. Sleep quality effect on next-day function\n5. SpO2 low patterns — what precedes them\n6. HRV patterns — what days is it lowest\n7. Weather or environment correlations if noted\n8. Intake patterns — does caffeine, alcohol, or hydration correlate with symptom severity, sleep, or HRV? Is hitting the 75g+ protein goal associated with better function or lower pain?\n\nBe specific with numbers. Example: "On days when [factor] was logged, scale averaged X vs Y on other days."',
        1200
      );
      return { statusCode: 200, headers: headers, body: JSON.stringify({ analysis: analysis }) };
    }

    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Unknown type: ' + type }) };

  } catch (err) {
    console.error('Analysis error:', err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};

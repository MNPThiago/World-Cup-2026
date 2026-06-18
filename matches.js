// ── Team flag codes ──
// Maps lowercase team name → ISO flag code for flagcdn.com.
// Add new teams here as needed.
const TEAM_FLAGS = {
  'mexico': 'mx',              'south africa': 'za',
  'south korea': 'kr',         'czechia': 'cz',
  'canada': 'ca',              'bosnia-herzegovina': 'ba',
  'united states': 'us',       'paraguay': 'py',
  'portugal': 'pt',            'congo dr': 'cd',
  'dr congo': 'cd',            'england': 'gb-eng',
  'croatia': 'hr',             'ghana': 'gh',
  'panama': 'pa',              'uzbekistan': 'uz',
  'colombia': 'co',
  'qatar': 'qa',               'switzerland': 'ch',
  'brazil': 'br',              'morocco': 'ma',
  'haiti': 'ht',               'scotland': 'gb-sct',
  'australia': 'au',           'turkey': 'tr',
  'germany': 'de',             'curaçao': 'cw',
  'netherlands': 'nl',         'japan': 'jp',
  'ivory coast': 'ci',         'ecuador': 'ec',
  'sweden': 'se',              'tunisia': 'tn',
  'spain': 'es',               'cape verde islands': 'cv',
  'belgium': 'be',             'egypt': 'eg',
  'saudi arabia': 'sa',        'uruguay': 'uy',
  'iran': 'ir',                'new zealand': 'nz',
  'france': 'fr',              'senegal': 'sn',
  'iraq': 'iq',                'norway': 'no',
  'argentina': 'ar',           'algeria': 'dz',
  'austria': 'at',             'jordan': 'jo',
  'turkiey': 'tr'
};

// ── Helpers ──
function _normalize(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function _flagCode(teamName) {
  return TEAM_FLAGS[_normalize(teamName)] || 'xx';
}

function _categorizePrediction(prediction, team1, team2) {
  const pred = _normalize(prediction);
  if (pred === 'draw') return 'draw';
  if (pred === _normalize(team1) + ' win') return 't1';
  if (pred === _normalize(team2) + ' win') return 't2';
  if (pred.startsWith(_normalize(team1))) return 't1';
  return 't2';
}

function _isoToLabel(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function _submittedAtToNextDayLabel(submittedAt) {
  const d = new Date(submittedAt);
  if (isNaN(d.getTime())) return 'Unknown date';
  d.setUTCDate(d.getUTCDate() + 1);
  return _isoToLabel(d.toISOString());
}

async function _loadMatchInfoMap() {
  try {
    const res = await fetch('Match.json');
    if (!res.ok) return {};
    const rows = await res.json();
    const map = {};
    for (const row of rows) {
      const id = (row.MatchID || '').trim();
      if (!id) continue;
      map[id] = row;
    }
    return map;
  } catch (_) {
    return {};
  }
}

// ── Load Matches ──
// Fetches data.json (written by Power Automate), groups by MatchID,
// categorises predictions, and merges known scores.
async function loadMatches() {
  const res = await fetch('data.json');
  if (!res.ok) throw new Error(`Could not load data.json (HTTP ${res.status})`);
  const payload = await res.json();
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload && payload.Body)
      ? payload.Body
      : Array.isArray(payload && payload.body)
        ? payload.body
        : [];

  if (!Array.isArray(records)) {
    throw new Error('Invalid data.json format: expected an array or { Body: [...] }');
  }
  const matchInfoMap = await _loadMatchInfoMap();

  const byMatch = {};
  for (const r of records) {
    const id = (r.MatchID || '').trim();
    if (!id) continue;
    if (!byMatch[id]) {
      byMatch[id] = {
        matchLabel:  (r.Match || '').trim(),
        submittedAt: r.SubmittedAt,
        rows: [],
      };
    }
    byMatch[id].rows.push({
      prediction: (r.Prediction || '').trim(),
      userName:   (r.UserName   || '').trim(),
    });
  }

  const matches = Object.entries(byMatch).map(([id, { matchLabel, submittedAt, rows }]) => {
    const info = matchInfoMap[id] || null;
    const vsSplit  = matchLabel.split(' vs ');
    const team1    = vsSplit[0].trim();
    const team2    = vsSplit.slice(1).join(' vs ').trim();

    const t1 = [], draw = [], t2 = [];
    for (const { prediction, userName } of rows) {
      const bucket = _categorizePrediction(prediction, team1, team2);
      if (bucket === 'draw')     draw.push(userName);
      else if (bucket === 't1') t1.push(userName);
      else                      t2.push(userName);
    }

    return {
      id,
      date:  info && info.MatchDate ? _isoToLabel(info.MatchDate) : _submittedAtToNextDayLabel(submittedAt),
      team1: { name: team1, flag: _flagCode(team1) },
      team2: { name: team2, flag: _flagCode(team2) },
      score: Array.isArray(info && info.Score) ? info.Score : undefined,
      result: info && info.Result ? info.Result : undefined,
      winner: info && Object.prototype.hasOwnProperty.call(info, 'Winner') ? info.Winner : undefined,
      t1, draw, t2,
    };
  });

  matches.sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
  return matches;
}

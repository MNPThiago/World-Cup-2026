const test = 0;
// ── Team flag codes ──
// Maps lowercase team name → ISO flag code for flagcdn.com.
// Add new teams here as needed.
const TEAM_FLAGS = {
  'mexico': 'mx',              'south africa': 'za',
  'south korea': 'kr',         'czechia': 'cz',
  'czech republic': 'cz',      'canada': 'ca',
  'bosnia herzegovina': 'ba',   'bosnia and herzegovina': 'ba',
  'united states': 'us',       'usa': 'us',
  'paraguay': 'py',
  'portugal': 'pt',            'congo dr': 'cd',
  'dr congo': 'cd',            'england': 'gb-eng',
  'croatia': 'hr',             'ghana': 'gh',
  'panama': 'pa',              'uzbekistan': 'uz',
  'colombia': 'co',
  'qatar': 'qa',               'switzerland': 'ch',
  'brazil': 'br',              'morocco': 'ma',
  'haiti': 'ht',               'scotland': 'gb-sct',
  'australia': 'au',           'turkey': 'tr',
  'turkiye': 'tr',             'cape verde': 'cv',
  'curacao': 'cw',             'germany': 'de',
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

const TEAM_CANONICAL = {
  'south korea': 'south korea',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'czechia': 'czech republic',
  'czech republic': 'czech republic',
  'bosnia herzegovina': 'bosnia herzegovina',
  'bosnia and herzegovina': 'bosnia herzegovina',
  'united states': 'usa',
  'united states of america': 'usa',
  'usa': 'usa',
  'congo dr': 'dr congo',
  'dr congo': 'dr congo',
  'cape verde islands': 'cape verde',
  'cape verde': 'cape verde',
  'turkiye': 'turkey',
  'turkiey': 'turkey',
  'turkey': 'turkey',
  'curacao': 'curacao',
};

// ── Helpers ──
function _normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _canonicalTeamName(teamName) {
  return TEAM_CANONICAL[_normalize(teamName)] || _normalize(teamName);
}

function _normalizeMatchLabel(value) {
  const parts = String(value || '').split(' vs ');
  if (parts.length < 2) return _canonicalTeamName(value);
  const team1 = _canonicalTeamName(parts[0]);
  const team2 = _canonicalTeamName(parts.slice(1).join(' vs '));
  return `${team1} vs ${team2}`;
}

function _flagCode(teamName) {
  return TEAM_FLAGS[_normalize(teamName)] || 'xx';
}

function _categorizePrediction(prediction, team1, team2) {
  const pred = _normalize(prediction);
  const team1Canonical = _canonicalTeamName(team1);
  const team2Canonical = _canonicalTeamName(team2);

  if (pred === 'draw') return 'draw';

  const predTeamRaw = pred.replace(/\bwin\b/g, '').trim();
  const predTeamCanonical = _canonicalTeamName(predTeamRaw);

  if (predTeamCanonical === team1Canonical) return 't1';
  if (predTeamCanonical === team2Canonical) return 't2';

  if (pred === `${team1Canonical} win`) return 't1';
  if (pred === `${team2Canonical} win`) return 't2';
  if (pred.startsWith(team1Canonical)) return 't1';
  if (pred.startsWith(team2Canonical)) return 't2';

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
      const match = (row.Match || '').trim();
      if (!match) continue;
      map[_normalizeMatchLabel(match)] = row;
    }
    return map;
  } catch (_) {
    return {};
  }
}

// ── Load Matches ──
// Fetches data.json (written by Power Automate), groups by Match text,
// categorises predictions, and merges schedule rows from Match.json.
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
    const matchLabel = (r.Match || '').trim();
    if (!matchLabel) continue;

    const key = _normalizeMatchLabel(matchLabel);
    if (!byMatch[key]) {
      byMatch[key] = {
        matchLabel,
        submittedAt: r.SubmittedAt,
        rows: [],
      };
    }
    byMatch[key].rows.push({
      prediction: (r.Prediction || '').trim(),
      userName:   (r.UserName   || '').trim(),
    });
  }

  const matches = Object.values(matchInfoMap).map((info) => {
    const matchLabel = (info && info.Match ? info.Match : '').trim();
    const byMatchRow = byMatch[_normalizeMatchLabel(matchLabel)] || null;
    const submittedAt = byMatchRow ? byMatchRow.submittedAt : null;
    const rows = byMatchRow ? byMatchRow.rows : [];
    const vsSplit = matchLabel.split(' vs ');
    const team1 = vsSplit[0].trim();
    const team2 = vsSplit.slice(1).join(' vs ').trim();

    const t1 = [], draw = [], t2 = [];
    for (const { prediction, userName } of rows) {
      const bucket = _categorizePrediction(prediction, team1, team2);
      if (bucket === 'draw')     draw.push(userName);
      else if (bucket === 't1') t1.push(userName);
      else                      t2.push(userName);
    }

    return {
      id: info && info.MatchID ? info.MatchID.trim() : matchLabel,
      date: info && info.MatchDate ? _isoToLabel(info.MatchDate) : _submittedAtToNextDayLabel(submittedAt),
      team1: { name: team1, flag: _flagCode(team1) },
      team2: { name: team2, flag: _flagCode(team2) },
      score: Array.isArray(info && info.Score) ? info.Score : undefined,
      result: info && info.Result ? info.Result : undefined,
      winner: info && Object.prototype.hasOwnProperty.call(info, 'Winner') ? info.Winner : undefined,
      t1, draw, t2,
    };
  });

  matches.sort((a, b) => new Date(`${a.date}, 2026`) - new Date(`${b.date}, 2026`));
  return matches;
}

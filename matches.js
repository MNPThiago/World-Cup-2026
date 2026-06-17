// ── Match metadata: date and flag codes per match ID ──
// This is the only place to update when new matches are added.
const MATCH_META = {
  M1:  { date: 'June 11', team1Flag: 'mx',     team2Flag: 'za'     },
  M2:  { date: 'June 11', team1Flag: 'kr',     team2Flag: 'cz'     },
  M3:  { date: 'June 12', team1Flag: 'ca',     team2Flag: 'ba'     },
  M4:  { date: 'June 12', team1Flag: 'us',     team2Flag: 'py'     },
  M5:  { date: 'June 13', team1Flag: 'qa',     team2Flag: 'ch'     },
  M6:  { date: 'June 13', team1Flag: 'br',     team2Flag: 'ma'     },
  M7:  { date: 'June 13', team1Flag: 'ht',     team2Flag: 'gb-sct' },
  M8:  { date: 'June 13', team1Flag: 'au',     team2Flag: 'tr'     },
  M9:  { date: 'June 14', team1Flag: 'de',     team2Flag: 'cw'     },
  M10: { date: 'June 14', team1Flag: 'nl',     team2Flag: 'jp'     },
  M11: { date: 'June 14', team1Flag: 'ci',     team2Flag: 'ec'     },
  M12: { date: 'June 14', team1Flag: 'se',     team2Flag: 'tn'     },
  M13: { date: 'June 15', team1Flag: 'es',     team2Flag: 'cv'     },
  M14: { date: 'June 15', team1Flag: 'be',     team2Flag: 'eg'     },
  M15: { date: 'June 15', team1Flag: 'sa',     team2Flag: 'uy'     },
  M16: { date: 'June 15', team1Flag: 'ir',     team2Flag: 'nz'     },
  M17: { date: 'June 16', team1Flag: 'fr',     team2Flag: 'sn'     },
  M18: { date: 'June 16', team1Flag: 'iq',     team2Flag: 'no'     },
  M19: { date: 'June 16', team1Flag: 'ar',     team2Flag: 'dz'     },
  M20: { date: 'June 16', team1Flag: 'at',     team2Flag: 'jo'     },
};

// ── Match Scores ──
// Update this object whenever a match result is known.
// score:  [team1Goals, team2Goals]
// result: 't1' | 't2' | 'draw'
// winner: team name string, or null for draws
const MATCH_SCORES = {
  M1:  { score: [2, 0], result: 't1',   winner: 'Mexico'        },
  M2:  { score: [2, 1], result: 't1',   winner: 'South Korea'   },
  M3:  { score: [1, 1], result: 'draw', winner: null            },
  M4:  { score: [4, 1], result: 't1',   winner: 'United States' },
  M5:  { score: [1, 1], result: 'draw', winner: null            },
  M6:  { score: [1, 1], result: 'draw', winner: null            },
  M7:  { score: [0, 1], result: 't2',   winner: 'Scotland'      },
  M8:  { score: [2, 0], result: 't1',   winner: 'Australia'     },
  M9:  { score: [7, 1], result: 't1',   winner: 'Germany'       },
  M10: { score: [2, 2], result: 'draw', winner: null            },
  M11: { score: [1, 0], result: 't1',   winner: 'Ivory Coast'   },
  M12: { score: [5, 1], result: 't1',   winner: 'Sweden'        },
  M13: { score: [0, 0], result: 'draw', winner: null            },
  M14: { score: [1, 1], result: 'draw', winner: null            },
  M15: { score: [1, 1], result: 'draw', winner: null            },
  M16: { score: [2, 2], result: 'draw', winner: null            },
  M17: null, // update when result is known
  M18: null,
  M19: null,
  M20: null,
};

// ── Helpers ──
function normalizeStr(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function categorizePrediction(prediction, team1Name, team2Name) {
  const pred = normalizeStr(prediction);
  if (pred === 'draw') return 'draw';
  if (pred === normalizeStr(team1Name) + ' win') return 't1';
  if (pred === normalizeStr(team2Name) + ' win') return 't2';
  // Fallback: partial match
  if (pred.startsWith(normalizeStr(team1Name))) return 't1';
  return 't2';
}

// ── CSV Parsing ──
// Handles the Power Automate export format:
//   - File may be wrapped in a JSON envelope: {"body":"...csv content..."}
//   - CSV is RFC 4180: comma-delimited, fields double-quoted, "" = escaped quote
//   - Columns resolved from header row (resilient to future column reordering)
// Also handles the legacy tab-separated SharePoint export as a fallback.

function _parseCSVLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCSV(raw) {
  // Unwrap Power Automate JSON envelope if present
  let text = raw.trim();
  if (text.startsWith('{')) {
    try { text = JSON.parse(text).body; } catch (_) { /* not JSON, use as-is */ }
  }

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const firstLine = lines[0];

  // Legacy tab-separated fallback
  if (!firstLine.startsWith('@odata') && firstLine.includes('\t')) {
    return lines.slice(1).filter(Boolean).map(line => {
      const cols = line.split('\t');
      return {
        matchId:    (cols[1] || '').trim(),
        matchLabel: (cols[2] || '').trim(),
        prediction: (cols[3] || '').trim(),
        userName:   (cols[4] || '').trim(),
      };
    });
  }

  // New Power Automate CSV — resolve columns from header
  const header = _parseCSVLine(firstLine);
  const idx = {
    matchId:    header.findIndex(h => h.trim() === 'MatchID'),
    matchLabel: header.findIndex(h => h.trim() === 'Match'),
    prediction: header.findIndex(h => h.trim() === 'Prediction'),
    userName:   header.findIndex(h => h.trim() === 'UserName'),
  };

  return lines.slice(1).filter(Boolean).map(line => {
    const cols = _parseCSVLine(line);
    return {
      matchId:    (cols[idx.matchId]    || '').trim(),
      matchLabel: (cols[idx.matchLabel] || '').trim(),
      prediction: (cols[idx.prediction] || '').trim(),
      userName:   (cols[idx.userName]   || '').trim(),
    };
  });
}

function buildMatches(rows) {
  const byMatch = {};

  for (const row of rows) {
    if (!row.matchId || !MATCH_META[row.matchId]) continue;
    if (!byMatch[row.matchId]) {
      byMatch[row.matchId] = { matchLabel: row.matchLabel, rows: [] };
    }
    byMatch[row.matchId].rows.push(row);
  }

  const matches = Object.entries(byMatch).map(([id, { matchLabel, rows }]) => {
    const meta = MATCH_META[id];

    // Parse "Team1 vs Team2" — collapse extra spaces
    const vsSplit = matchLabel.split(' vs ');
    const team1Name = vsSplit[0].trim();
    const team2Name = vsSplit.slice(1).join(' vs ').trim(); // handles "vs" in team names

    const t1 = [], draw = [], t2 = [];
    for (const row of rows) {
      const bucket = categorizePrediction(row.prediction, team1Name, team2Name);
      if (bucket === 'draw') draw.push(row.userName);
      else if (bucket === 't1') t1.push(row.userName);
      else t2.push(row.userName);
    }

    return {
      id,
      date: meta.date,
      team1: { name: team1Name, flag: meta.team1Flag },
      team2: { name: team2Name, flag: meta.team2Flag },
      t1,
      draw,
      t2,
    };
  });

  // Sort by numeric match ID (M1, M2, ..., M20)
  return matches.sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
}

async function loadMatches() {
  const res = await fetch('data.csv');
  if (!res.ok) throw new Error(`Could not load data.csv (HTTP ${res.status})`);
  const text = await res.text();
  return buildMatches(parseCSV(text));
}

// ── Apply Scores ──
// Merges MATCH_SCORES into the matches array built from the CSV.
function applyScores(matches) {
  for (const match of matches) {
    const entry = MATCH_SCORES[match.id];
    if (!entry) continue;
    match.score  = entry.score;
    match.result = entry.result;
    match.winner = entry.winner;
  }
  return matches;
}

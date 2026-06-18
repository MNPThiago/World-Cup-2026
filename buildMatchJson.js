const test = 2;
const fs = require('fs/promises');
const path = require('path');

const ROOT = __dirname;
const DATA_PATH = path.join(ROOT, 'data.json');
const MATCH_PATH = path.join(ROOT, 'Match.json');
const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

function uniqueMatches(rows) {
  const map = {};
  for (const row of rows) {
    const id = String(row.MatchID || '').trim();
    if (!id) continue;

    // Keep first occurrence for each MatchID and preserve a readable fallback.
    if (!map[id]) {
      const rawMatch = row.Match;
      const match = typeof rawMatch === 'string' && rawMatch.trim()
        ? rawMatch.trim()
        : 'undefined vs undefined';

      map[id] = { MatchID: id, Match: match };
    }
  }

  return Object.values(map).sort((a, b) => {
    return parseInt(a.MatchID.slice(1), 10) - parseInt(b.MatchID.slice(1), 10);
  });
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.Body)) return payload.Body;
  if (payload && Array.isArray(payload.body)) return payload.body;
  throw new Error('Invalid data.json format: expected an array or { Body: [...] }');
}

async function loadOpenFootballMatches() {
  const response = await fetch(OPENFOOTBALL_URL);
  if (!response.ok) throw new Error(`OpenFootball HTTP ${response.status}`);
  const json = await response.json();
  if (!json || !Array.isArray(json.matches)) {
    throw new Error('OpenFootball payload has no matches array');
  }
  return json.matches;
}

async function main() {
  const rawData = await fs.readFile(DATA_PATH, 'utf8');
  const rows = extractRows(JSON.parse(rawData));
  const sourceMatches = uniqueMatches(rows);
  const openfootballMatches = await loadOpenFootballMatches();

  const out = [];
  for (const entry of sourceMatches) {
    const num = parseInt(String(entry.MatchID).slice(1), 10);
    const index = Number.isFinite(num) ? num - 1 : -1;
    const ofMatch = index >= 0 ? openfootballMatches[index] : null;

    out.push({
      MatchID: entry.MatchID,
      Match: entry.Match,
      MatchDate: ofMatch && ofMatch.date ? ofMatch.date : null,
      Score: [null, null],
      Result: null,
      Winner: null,
      Source: 'openfootball/worldcup.json',
    });
  }

  await fs.writeFile(MATCH_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${out.length} records to Match.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

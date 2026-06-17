const fs = require('fs/promises');
const path = require('path');

const ROOT = __dirname;
const DATA_PATH = path.join(ROOT, 'data.json');
const MATCH_PATH = path.join(ROOT, 'Match.json');
const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const TEAM_ALIASES = {
  'south korea': ['korea republic'],
  'czechia': ['czech republic'],
  'bosnia-herzegovina': ['bosnia and herzegovina', 'bosnia & herzegovina'],
  'united states': ['usa', 'united states of america'],
  'congo dr': ['dr congo', 'congo dr'],
  'cape verde islands': ['cape verde'],
  'curaçao': ['curacao'],
  'curacao': ['curaçao'],
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function allAliases(name) {
  const key = normalizeKey(name);
  const extra = TEAM_ALIASES[key] || [];
  return [name].concat(extra);
}

function teamMatches(apiTeam, localTeam) {
  const apiNorm = normalize(apiTeam);
  const candidates = allAliases(localTeam);
  for (const candidate of candidates) {
    if (normalize(candidate) === apiNorm) return true;
  }
  return false;
}

function parseMatchLabel(label) {
  const parts = String(label || '').split(' vs ');
  if (parts.length < 2) return null;
  const team1 = parts[0].trim();
  const team2 = parts.slice(1).join(' vs ').trim();
  if (!team1 || !team2) return null;
  return { team1, team2 };
}

function uniqueMatches(rows) {
  const map = {};
  for (const row of rows) {
    const id = String(row.MatchID || '').trim();
    const match = String(row.Match || '').trim();
    if (!id || !match) continue;
    if (!map[id]) map[id] = { MatchID: id, Match: match };
  }

  return Object.values(map).sort((a, b) => {
    return parseInt(a.MatchID.slice(1), 10) - parseInt(b.MatchID.slice(1), 10);
  });
}

function deriveOutcome(ft, team1, team2) {
  if (!Array.isArray(ft) || ft.length < 2) {
    return { Score: undefined, Result: undefined, Winner: undefined };
  }

  const t1 = Number(ft[0]);
  const t2 = Number(ft[1]);
  if (Number.isNaN(t1) || Number.isNaN(t2)) {
    return { Score: undefined, Result: undefined, Winner: undefined };
  }

  let result = 'draw';
  let winner = null;
  if (t1 > t2) {
    result = 't1';
    winner = team1;
  } else if (t2 > t1) {
    result = 't2';
    winner = team2;
  }

  return { Score: [t1, t2], Result: result, Winner: winner };
}

function findOpenFootballMatch(allMatches, team1, team2) {
  for (const match of allMatches) {
    const apiTeam1 = match.team1 || '';
    const apiTeam2 = match.team2 || '';

    const direct = teamMatches(apiTeam1, team1) && teamMatches(apiTeam2, team2);
    if (direct) return { match, reversed: false };

    const reversed = teamMatches(apiTeam1, team2) && teamMatches(apiTeam2, team1);
    if (reversed) return { match, reversed: true };
  }
  return null;
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
  const rows = JSON.parse(rawData);
  const sourceMatches = uniqueMatches(rows);
  const openfootballMatches = await loadOpenFootballMatches();

  const out = [];
  for (const entry of sourceMatches) {
    const parsed = parseMatchLabel(entry.Match);
    if (!parsed) {
      out.push({
        MatchID: entry.MatchID,
        Match: entry.Match,
        MatchDate: null,
        Source: 'openfootball/worldcup.json',
      });
      continue;
    }

    const found = findOpenFootballMatch(openfootballMatches, parsed.team1, parsed.team2);
    if (!found) {
      out.push({
        MatchID: entry.MatchID,
        Match: entry.Match,
        MatchDate: null,
        Source: 'openfootball/worldcup.json',
      });
      continue;
    }

    const match = found.match;
    const ft = match.score && match.score.ft ? match.score.ft : undefined;
    let scoreForOutput = ft;
    if (Array.isArray(ft) && found.reversed) {
      scoreForOutput = [ft[1], ft[0]];
    }

    const outcome = deriveOutcome(scoreForOutput, parsed.team1, parsed.team2);
    out.push({
      MatchID: entry.MatchID,
      Match: entry.Match,
      MatchDate: match.date || null,
      Score: outcome.Score,
      Result: outcome.Result,
      Winner: outcome.Winner,
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

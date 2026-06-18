const fs = require('fs/promises');
const path = require('path');

const ROOT = __dirname;
const OUTPUT_PATH = path.join(ROOT, 'OpenFootbalMatches.json');
const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

function deriveOutcome(score, team1, team2) {
  if (!Array.isArray(score) || score.length < 2) {
    return { Score: [null, null], Result: null, Winner: null };
  }

  const t1 = Number(score[0]);
  const t2 = Number(score[1]);
  if (Number.isNaN(t1) || Number.isNaN(t2)) {
    return { Score: [null, null], Result: null, Winner: null };
  }

  if (t1 > t2) {
    return { Score: [t1, t2], Result: 't1', Winner: team1 };
  }

  if (t2 > t1) {
    return { Score: [t1, t2], Result: 't2', Winner: team2 };
  }

  return { Score: [t1, t2], Result: 'draw', Winner: null };
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
  const matches = await loadOpenFootballMatches();

  const out = matches.map((match, index) => {
    const team1 = match.team1 || 'undefined';
    const team2 = match.team2 || 'undefined';
    const outcome = deriveOutcome(match.score && match.score.ft, team1, team2);

    return {
      MatchID: `M${index + 1}`,
      Match: `${team1} vs ${team2}`,
      MatchDate: match.date || null,
      Score: outcome.Score,
      Result: outcome.Result,
      Winner: outcome.Winner,
      Source: 'openfootball/worldcup.json',
    };
  });

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${out.length} records to OpenFootbalMatches.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
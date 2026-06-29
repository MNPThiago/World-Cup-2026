#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const OPENFOOTBALL_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Invalid JSON from ${url}: ${err.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function mapResult(score1, score2) {
  if (!Number.isFinite(score1) || !Number.isFinite(score2)) return null;
  if (score1 > score2) return 't1';
  if (score2 > score1) return 't2';
  return 'draw';
}

function parseMatchIdNum(matchId) {
  const n = Number(String(matchId || '').replace(/^M/i, ''));
  return Number.isFinite(n) ? n : null;
}

function matchByTeamsAndDate(apiMatch, row) {
  const [rowTeam1, rowTeam2] = String(row.Match || '').split(' vs ');
  if (!rowTeam1 || !rowTeam2) return false;

  const sameDate = String(apiMatch.date || '') === String(row.MatchDate || '');
  if (!sameDate) return false;

  return (
    normalize(apiMatch.team1) === normalize(rowTeam1) &&
    normalize(apiMatch.team2) === normalize(rowTeam2)
  );
}

async function main() {
  const targetArg = process.argv[2] || 'Match.json';
  const targetPath = path.resolve(process.cwd(), targetArg);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`File not found: ${targetPath}`);
  }

  const localRows = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  if (!Array.isArray(localRows)) {
    throw new Error(`Expected array in ${targetPath}`);
  }

  const remotePayload = await fetchJson(OPENFOOTBALL_URL);
  const remoteMatches = Array.isArray(remotePayload && remotePayload.matches)
    ? remotePayload.matches
    : [];

  const remoteByNum = new Map();
  for (const m of remoteMatches) {
    if (Number.isFinite(m && m.num)) remoteByNum.set(m.num, m);
  }

  let updatedRows = 0;
  let renamedRows = 0;

  for (const row of localRows) {
    const idNum = parseMatchIdNum(row.MatchID);
    let remote = idNum !== null ? remoteByNum.get(idNum) : null;

    if (!remote) {
      remote = remoteMatches.find((m) => matchByTeamsAndDate(m, row)) || null;
    }

    if (!remote) continue;

    const nextMatchLabel = `${remote.team1} vs ${remote.team2}`;
    if (row.Match !== nextMatchLabel) {
      row.Match = nextMatchLabel;
      renamedRows += 1;
    }

    row.MatchDate = remote.date || row.MatchDate;

    const ft = remote.score && Array.isArray(remote.score.ft) ? remote.score.ft : null;
    if (ft && Number.isFinite(ft[0]) && Number.isFinite(ft[1])) {
      const score1 = Number(ft[0]);
      const score2 = Number(ft[1]);

      row.Score = [score1, score2];
      row.Result = mapResult(score1, score2);

      const [team1, team2] = String(row.Match || '').split(' vs ');
      if (row.Result === 't1') row.Winner = team1 || remote.team1;
      else if (row.Result === 't2') row.Winner = team2 || remote.team2;
      else row.Winner = null;
    } else {
      row.Score = [null, null];
      row.Result = null;
      row.Winner = null;
    }

    row.Source = 'openfootball/worldcup.json';
    updatedRows += 1;
  }

  fs.writeFileSync(targetPath, `${JSON.stringify(localRows, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `Updated ${updatedRows} rows in ${path.basename(targetPath)}. Renamed ${renamedRows} match labels.\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});

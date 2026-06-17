// ── Score Fetcher ──
// Loops MATCH_META and updates MATCH_SCORES with live results from TheSportsDB.
// Only fetches matches where MATCH_SCORES[id] is null (not yet known).
// Call fetchAndUpdateScores() after init() — it re-renders automatically on success.

const TEAM_API_ALIASES = {
  'South Korea':        ['Korea Republic'],
  'Ivory Coast':        ["Côte d'Ivoire", "Cote d'Ivoire"],
  'Bosnia-Herzegovina': ['Bosnia and Herzegovina', 'Bosnia & Herzegovina'],
  'Cape Verde Islands': ['Cape Verde'],
  'Curaçao':            ['Curacao'],
  'United States':      ['USA', 'United States of America'],
};

function _normTeam(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function _teamMatches(apiName, ourName) {
  const normApi = _normTeam(apiName);
  return [ourName, ...(TEAM_API_ALIASES[ourName] || [])]
    .some(alias => _normTeam(alias) === normApi);
}

function _dateToISO(dateLabel) {
  // e.g. "June 16" → "2026-06-16"
  return new Date(`${dateLabel}, 2026`).toISOString().slice(0, 10);
}

async function fetchAndUpdateScores(onUpdate) {
  // Collect only match IDs that still need a score
  const pending = Object.keys(MATCH_META).filter(id => !MATCH_SCORES[id]);
  if (pending.length === 0) return;

  // Group pending IDs by date to minimise API calls
  const byDate = {};
  for (const id of pending) {
    const date = MATCH_META[id].date;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(id);
  }

  let updated = false;

  await Promise.all(Object.entries(byDate).map(async ([dateLabel, ids]) => {
    const isoDate = _dateToISO(dateLabel);
    try {
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${isoDate}&s=Soccer`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { events = [] } = await res.json();

      // Only World Cup events
      const wcEvents = events.filter(e => /world cup/i.test(e.strLeague || ''));

      for (const id of ids) {
        // Find the team names from MATCH_META — requires at least one match row in CSV,
        // but we can resolve names from the already-built matches array if available.
        // We look them up from the global `matches` variable exposed by app.js.
        const matchObj = (typeof matches !== 'undefined')
          ? matches.find(m => m.id === id)
          : null;
        if (!matchObj) continue;

        const event = wcEvents.find(e =>
          _teamMatches(e.strHomeTeam, matchObj.team1.name) &&
          _teamMatches(e.strAwayTeam, matchObj.team2.name)
        );
        if (!event) continue;

        const home = parseInt(event.intHomeScore, 10);
        const away = parseInt(event.intAwayScore, 10);
        if (isNaN(home) || isNaN(away)) continue;

        const result = home > away ? 't1' : away > home ? 't2' : 'draw';
        const winner = result === 't1' ? matchObj.team1.name
                     : result === 't2' ? matchObj.team2.name
                     : null;

        // Update MATCH_SCORES in place
        MATCH_SCORES[id] = { score: [home, away], result, winner };
        console.log(`[fetchScores] ${id}: ${matchObj.team1.name} ${home}–${away} ${matchObj.team2.name}`);
        updated = true;
      }
    } catch (err) {
      console.warn(`[fetchScores] ${dateLabel}:`, err.message);
    }
  }));

  if (updated) {
    // Re-apply scores to the live matches array and re-render
    if (typeof applyScores === 'function' && typeof matches !== 'undefined') {
      applyScores(matches);
    }
    if (typeof onUpdate === 'function') {
      onUpdate();
    }
  }
}

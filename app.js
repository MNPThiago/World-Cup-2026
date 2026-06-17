// ── Module state ──
let matches   = [];
let grouped   = {};
let dates     = [];
let currentIdx = 0;

const gallery = document.getElementById('gallery');

const flagImg = code => `<img src="https://flagcdn.com/w40/${code}.png" alt="${code}" loading="lazy">`;

function buildPickers(names) {
  if (names.length === 0) return `<span class="empty-note">No picks</span>`;
  return `<ul class="picker-list">${names.map(n => `<li class="picker">${n}</li>`).join('')}</ul>`;
}

function render() {
  gallery.innerHTML = '';
  const date = dates[currentIdx];
  const group = grouped[date];

  // Date heading with prev/next navigation
  const heading = document.createElement('div');
  heading.className = 'date-group';
  heading.innerHTML = `
    <button class="nav-btn" id="btn-prev" ${currentIdx === 0 ? 'disabled' : ''}>&#8249;</button>
    <h2>${date}, 2026</h2>
    <hr>
    <span class="day-indicator">Day ${currentIdx + 1} / ${dates.length}</span>
    <button class="nav-btn" id="btn-next" ${currentIdx === dates.length - 1 ? 'disabled' : ''}>&#8250;</button>
  `;
  gallery.appendChild(heading);

  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentIdx > 0) { currentIdx--; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    if (currentIdx < dates.length - 1) { currentIdx++; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  for (const m of group) {
    const card = document.createElement('div');
    card.className = 'card';

    const total = m.t1.length + m.draw.length + m.t2.length;

    card.innerHTML = `
      <div class="card-grid">

        <!-- Col 1: Match Info -->
        <div class="col-match">
          <span class="match-id">${m.id}</span>
          <span class="match-date">${m.date}</span>
          <div class="match-teams">
            <div class="team-row">
              <span class="flag">${flagImg(m.team1.flag)}</span>
              <span>${m.team1.name}</span>
              ${m.score !== undefined ? `<span class="match-score">${m.score[0]}</span>` : ''}
            </div>
            <span class="vs-badge${m.score !== undefined ? ' has-score' : ''}">${m.score !== undefined ? '&ndash;' : 'VS'}</span>
            <div class="team-row">
              <span class="flag">${flagImg(m.team2.flag)}</span>
              <span>${m.team2.name}</span>
              ${m.score !== undefined ? `<span class="match-score">${m.score[1]}</span>` : ''}
            </div>
          </div>
          <span class="vote-count">${total} prediction${total !== 1 ? 's' : ''}</span>
        </div>

        <!-- Col 2: Team 1 Win -->
        <div class="col-pred col-team1${m.result === 't1' ? ' col-winner' : ''}">
          <div class="col-header">
            <span class="hflag">${flagImg(m.team1.flag)}</span>
            <span class="hname">${m.team1.name}</span>
            <span class="hcount">${m.t1.length}</span>
          </div>
          ${buildPickers(m.t1)}
        </div>

        <!-- Col 3: Draw -->
        <div class="col-pred col-draw${m.result === 'draw' ? ' col-winner' : ''}">
          <div class="col-header">
            <span class="hname">🤝 Draw</span>
            <span class="hcount">${m.draw.length}</span>
          </div>
          ${buildPickers(m.draw)}
        </div>

        <!-- Col 4: Team 2 Win -->
        <div class="col-pred col-team2${m.result === 't2' ? ' col-winner' : ''}">
          <div class="col-header">
            <span class="hflag">${flagImg(m.team2.flag)}</span>
            <span class="hname">${m.team2.name}</span>
            <span class="hcount">${m.t2.length}</span>
          </div>
          ${buildPickers(m.t2)}
        </div>

      </div>
    `;

    gallery.appendChild(card);
  }
}

// ── Leaderboard ──
function computeLeaderboard() {
  const scores = {};
  const allNames = new Set();
  for (const m of matches) {
    for (const n of [...m.t1, ...m.draw, ...m.t2]) allNames.add(n);
    if (!m.result) continue;
    const winners = m.result === 't1' ? m.t1 : m.result === 't2' ? m.t2 : m.draw;
    for (const n of winners) scores[n] = (scores[n] || 0) + 1;
  }
  return [...allNames]
    .map(name => ({ name, pts: scores[name] || 0 }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
}

const modalEl = document.createElement('div');
modalEl.className = 'modal-overlay';
modalEl.id = 'lb-modal';
modalEl.innerHTML = `
  <div class="modal">
    <div class="modal-header">
      <h3>🏆 Leaderboard</h3>
      <button class="modal-close" id="lb-close">&times;</button>
    </div>
    <div class="modal-body" id="lb-body"></div>
  </div>
`;
document.body.appendChild(modalEl);

document.getElementById('leaderboard-btn').addEventListener('click', () => {
  const board = computeLeaderboard();
  const medals = ['🥇','🥈','🥉'];
  document.getElementById('lb-body').innerHTML = board.map((e, i) => {
    const rank = medals[i] !== undefined ? medals[i] : `${i + 1}`;
    return `<div class="lb-row">
      <span class="lb-rank">${rank}</span>
      <span class="lb-name">${e.name}</span>
      <span class="lb-points">${e.pts} pt${e.pts !== 1 ? 's' : ''}</span>
    </div>`;
  }).join('');
  modalEl.classList.add('open');
});

document.getElementById('lb-close').addEventListener('click', () => modalEl.classList.remove('open'));
modalEl.addEventListener('click', e => { if (e.target === e.currentTarget) modalEl.classList.remove('open'); });

// ── Init ──
async function init() {
  gallery.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px">Loading matches…</p>';

  try {
    matches = await loadMatches();
  } catch (err) {
    gallery.innerHTML = `<p style="text-align:center;color:#f85149;padding:40px">⚠️ ${err.message}</p>`;
    return;
  }

  // Build grouped structure
  grouped = {};
  for (const m of matches) {
    if (!grouped[m.date]) grouped[m.date] = [];
    grouped[m.date].push(m);
  }
  dates = Object.keys(grouped);

  // Default to today's date, fallback to last available day
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  currentIdx = dates.findIndex(d => d === todayLabel);
  if (currentIdx === -1) currentIdx = dates.length - 1;

  applyScores(matches);
  render();

  // Fetch any missing scores in the background and re-render if found
  fetchAndUpdateScores(render).catch(err => console.warn('[fetchScores]', err));
}

init();

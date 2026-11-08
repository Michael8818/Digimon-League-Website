// Leaderboard page: every trainer in players.json, ranked by progress.

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("board-summary");
const refreshBtn = document.getElementById("refresh-btn");

function renderBoard(data) {
  const me = normalizeName(store.get(STORAGE_KEYS.trainer));
  const rows = data.players
    .map((p) => ({ name: p.name, progress: getProgress(p) }))
    .sort(compareProgress);

  const invited = rows.filter((r) => r.progress.invited).length;
  summaryEl.textContent = rows.length
    ? `${rows.length} trainer${rows.length === 1 ? "" : "s"} · ${invited} championship invitation${invited === 1 ? "" : "s"}`
    : "";

  if (!rows.length) {
    boardEl.innerHTML = `<li class="empty">No trainers yet. Wins show up here once a leader records them.</li>`;
    return;
  }

  boardEl.innerHTML = rows.map((r, i) => {
    const p = r.progress;
    const isMe = normalizeName(r.name) === me;

    return `
      <li class="board-row ${isMe ? "me" : ""}">
        <span class="rank">${i + 1}</span>
        <div>
          <div class="board-name">${escapeHtml(r.name)}${isMe ? "<small>You</small>" : ""}</div>
          <div class="mini-badges">${miniBadgesHtml(p)}</div>
        </div>
        <div class="board-score">
          ${p.invited
            ? `<strong class="invite-tag">Invited</strong>Championship`
            : `<strong>${p.gymCount} / ${LEAGUE.gyms.length}</strong>badges · ${p.e4Count} / ${LEAGUE.elite4.length} E4`}
        </div>
      </li>`;
  }).join("");
}

async function refresh() {
  refreshBtn.disabled = true;
  statusEl.textContent = "Loading…";
  try {
    renderBoard(await loadLeagueData());
    statusEl.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. New wins can take about a minute to appear.`;
  } catch (err) {
    statusEl.textContent = `${err.message} Check your connection and tap Refresh.`;
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener("click", refresh);
refresh();

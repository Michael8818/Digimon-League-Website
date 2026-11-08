// Trainer card page: asks for a name once, then shows that trainer's progress.

const els = {
  nameView: document.getElementById("name-view"),
  nameForm: document.getElementById("name-form"),
  nameInput: document.getElementById("name-input"),
  cardView: document.getElementById("card-view"),
  trainerName: document.getElementById("trainer-name"),
  summary: document.getElementById("trainer-summary"),
  status: document.getElementById("status"),
  refreshBtn: document.getElementById("refresh-btn"),
  switchBtn: document.getElementById("switch-btn"),
  gymGrid: document.getElementById("gym-grid"),
  gymCount: document.getElementById("gym-count"),
  e4Grid: document.getElementById("e4-grid"),
  e4Count: document.getElementById("e4-count"),
  e4Hint: document.getElementById("e4-hint"),
  champPanel: document.getElementById("champ-panel"),
  champArt: document.getElementById("champ-art"),
  champTitle: document.getElementById("champ-title"),
  champText: document.getElementById("champ-text"),
  qrBox: document.getElementById("qr-box"),
};

let leagueData = null;

function showNameForm() {
  els.cardView.hidden = true;
  els.nameView.hidden = false;
  els.nameInput.value = "";
  els.nameInput.focus();
}

function showCard() {
  els.nameView.hidden = true;
  els.cardView.hidden = false;
  render();
  refresh();
}

async function refresh() {
  els.refreshBtn.disabled = true;
  els.status.textContent = "Loading latest results…";
  try {
    leagueData = await loadLeagueData();
    render();
  } catch (err) {
    els.status.textContent = `${err.message} Check your connection and tap Refresh.`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

function render() {
  const name = store.get(STORAGE_KEYS.trainer);
  if (!name) return;

  const player = leagueData ? findPlayer(leagueData, name) : null;
  const progress = getProgress(player);
  const displayName = player ? player.name : name;

  els.trainerName.textContent = displayName;
  els.summary.textContent =
    `${progress.gymCount} / ${LEAGUE.gyms.length} badges · ${progress.e4Count} / ${LEAGUE.elite4.length} Elite Four` +
    (progress.invited ? " · Championship invite" : "");

  if (leagueData) {
    els.status.textContent = player
      ? `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
      : "New challenger! Nothing recorded yet. Win a gym battle and have the leader scan your QR code below.";
  }

  // Gym badges
  els.gymCount.textContent = `${progress.gymCount} / ${LEAGUE.gyms.length}`;
  els.gymGrid.innerHTML = progress.gyms.map((g) => `
    <li class="badge ${g.earned ? "earned" : "locked"}">
      ${gymBadgeSvg(g, g.earned)}
      <span class="badge-name">${escapeHtml(g.badge)}</span>
      <span class="badge-meta">${g.earned ? `Earned ${escapeHtml(formatDate(g.date))}` : `Beat ${escapeHtml(g.leader)}`}</span>
    </li>`).join("");

  // Elite Four
  els.e4Count.textContent = `${progress.e4Count} / ${LEAGUE.elite4.length}`;
  const next = progress.elite4.find((m) => m.status === "next");
  if (!progress.allGyms) {
    els.e4Hint.textContent = `Earn all ${LEAGUE.gyms.length} gym badges to challenge the Elite Four. They must be beaten in order.`;
  } else if (next) {
    els.e4Hint.textContent = `You can challenge the Elite Four! Next up: ${next.name}.`;
  } else {
    els.e4Hint.textContent = "You've defeated the entire Elite Four!";
  }

  const statusLabel = { defeated: "Defeated", next: "Next challenge", locked: "Locked" };
  els.e4Grid.innerHTML = progress.elite4.map((m) => `
    <li class="badge ${m.status === "defeated" ? "earned" : m.status}">
      ${elite4Svg(m, m.status)}
      <span class="badge-name">${escapeHtml(m.name)}</span>
      <span class="chip chip-${m.status}">${statusLabel[m.status]}</span>
      ${m.defeated ? `<span class="badge-meta">${escapeHtml(formatDate(m.date))}</span>` : ""}
    </li>`).join("");

  // Championship invitation
  els.champPanel.classList.toggle("earned", progress.invited);
  els.champArt.innerHTML = trophySvg(progress.invited);
  els.champTitle.textContent = LEAGUE.championship.badge;
  els.champText.textContent = progress.invited
    ? "You're invited to the League Championship. Congratulations, trainer!"
    : "Defeat all four Elite Four members to earn your invitation to the League Championship.";

  renderQr(displayName);
}

let lastQrName = null;
function renderQr(name) {
  if (name === lastQrName && els.qrBox.firstChild) return;
  if (typeof qrcode !== "function") {
    els.qrBox.textContent = "QR code unavailable. Leaders can type your name instead.";
    return;
  }
  const url = new URL(`leader.html#challenger=${encodeURIComponent(name)}`, location.href).href;
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();

  const count = qr.getModuleCount();
  const margin = 2;
  const size = count + margin * 2;
  let path = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  els.qrBox.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${escapeHtml(name)}">
      <rect width="${size}" height="${size}" fill="#fff"/>
      <path d="${path}" fill="#000"/>
    </svg>`;
  lastQrName = name;
}

els.nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = cleanName(els.nameInput.value);
  if (!name) return;
  store.set(STORAGE_KEYS.trainer, name);
  showCard();
});

els.switchBtn.addEventListener("click", () => {
  store.remove(STORAGE_KEYS.trainer);
  lastQrName = null;
  showNameForm();
});

els.refreshBtn.addEventListener("click", refresh);

// Refresh when the trainer comes back to the tab (e.g. right after a leader records a win).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && store.get(STORAGE_KEYS.trainer)) refresh();
});

if (store.get(STORAGE_KEYS.trainer)) showCard();
else showNameForm();

// Trainer card page: asks for a name once, then shows that trainer's progress.

const els = {
  nameView: document.getElementById("name-view"),
  nameForm: document.getElementById("name-form"),
  nameInput: document.getElementById("name-input"),
  cardView: document.getElementById("card-view"),
  trainerName: document.getElementById("trainer-name"),
  summary: document.getElementById("trainer-summary"),
  status: document.getElementById("status"),
  codeBtn: document.getElementById("code-btn"),
  codeDialog: document.getElementById("code-dialog"),
  codeName: document.getElementById("code-name"),
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
  leaderDialog: document.getElementById("leader-dialog"),
  leaderBody: document.getElementById("leader-body"),
};

let leagueData = null;
let leaderDetails = { gyms: {}, elite4: {} };

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

let loading = false;
async function refresh() {
  if (loading || !store.get(STORAGE_KEYS.trainer)) return;
  loading = true;
  if (!leagueData) els.status.textContent = "Loading latest results…";
  try {
    // Leader details are optional: if they fail to load, keep whatever we had.
    const [data, details] = await Promise.all([
      loadLeagueData(),
      loadLeaderDetails().catch(() => leaderDetails),
    ]);
    leagueData = data;
    leaderDetails = details;
    render();
  } catch (err) {
    els.status.textContent = `${err.message} Check your connection; the page will try again shortly.`;
  } finally {
    loading = false;
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
      : "New challenger! Nothing recorded yet. Tap a gym badge to challenge its leader, then have them scan your Challenge Code after you win.";
  }

  // Gym badges
  els.gymCount.textContent = `${progress.gymCount} / ${LEAGUE.gyms.length}`;
  els.gymGrid.innerHTML = progress.gyms.map((g) => `
    <li>
      <button type="button" class="badge ${g.earned ? "earned" : "locked"}" data-leader="${g.id}" aria-haspopup="dialog">
        ${gymBadgeSvg(g, g.earned)}
        <span class="badge-name">${escapeHtml(g.badge)}</span>
        <span class="badge-meta">${g.earned ? `Earned ${escapeHtml(formatDate(g.date))}` : `Beat ${escapeHtml(g.leader)}`}</span>
      </button>
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
    <li>
      <button type="button" class="badge ${m.status === "defeated" ? "earned" : m.status}" data-leader="${m.id}" aria-haspopup="dialog">
        ${elite4Svg(m, m.status)}
        <span class="badge-name">${escapeHtml(m.name)}</span>
        <span class="chip chip-${m.status}">${statusLabel[m.status]}</span>
        ${m.defeated ? `<span class="badge-meta">${escapeHtml(formatDate(m.date))}</span>` : ""}
      </button>
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
  els.codeName.textContent = name;
  els.qrBox.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${escapeHtml(name)}">
      <rect width="${size}" height="${size}" fill="#fff"/>
      <path d="${path}" fill="#000"/>
    </svg>`;
  lastQrName = name;
}

// ---------- Leader details pop-up ----------
function rulesHtml(rules) {
  const lines = (Array.isArray(rules) ? rules : [rules]).map((r) => String(r ?? "").trim()).filter(Boolean);
  if (!lines.length) return `<p class="muted small">No special rules. Standard league rules apply.</p>`;
  if (lines.length === 1) return `<p class="small">${escapeHtml(lines[0])}</p>`;
  return `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
}

function openLeader(leaderId) {
  const leader = getLeader(leaderId);
  if (!leader) return;
  const isGym = leader.type === "gym";
  const info = (isGym ? leaderDetails.gyms : leaderDetails.elite4)[leaderId] || {};

  const trainerName = store.get(STORAGE_KEYS.trainer) || "";
  const player = leagueData ? findPlayer(leagueData, trainerName) : null;
  const trainer = player ? player.name : trainerName;
  const progress = getProgress(player);
  const check = checkChallenge(player, leaderId);

  const discord = String(info.discord || "").trim().replace(/^@/, "");
  const discordId = /^\d{5,25}$/.test(String(info.discordId || "").trim()) ? String(info.discordId).trim() : "";

  // Art and status
  let art, eyebrow, chip;
  if (isGym) {
    const gym = progress.gyms.find((g) => g.id === leaderId);
    art = gymBadgeSvg(gym, gym.earned);
    eyebrow = `Gym Leader · ${gym.badge}`;
    chip = gym.earned
      ? `<span class="chip chip-defeated">Earned ${escapeHtml(formatDate(gym.date))}</span>`
      : `<span class="chip chip-next">Ready to challenge</span>`;
  } else {
    const member = progress.elite4.find((m) => m.id === leaderId);
    art = elite4Svg(member, member.status);
    eyebrow = `Elite Four · Battle ${member.order} of ${LEAGUE.elite4.length}`;
    chip = {
      defeated: `<span class="chip chip-defeated">Defeated ${escapeHtml(formatDate(member.date))}</span>`,
      next: `<span class="chip chip-next">Next challenge</span>`,
      locked: `<span class="chip chip-locked">Locked</span>`,
    }[member.status];
  }

  // Gym: special rules. Elite Four: deck and decklist.
  let specifics;
  if (isGym) {
    specifics = `
      <div class="leader-section">
        <span class="label">Special rules</span>
        <div class="rules-box">${rulesHtml(info.rules)}</div>
      </div>`;
  } else {
    const deckName = String(info.deckName || "").trim();
    const decklist = safeUrl(info.decklistUrl);
    specifics = `
      <div class="leader-section">
        <div class="fact"><span>Deck</span><strong>${deckName ? escapeHtml(deckName) : `<span class="muted">Not announced yet</span>`}</strong></div>
        ${decklist
          ? `<a class="button ghost block" href="${escapeHtml(decklist)}" target="_blank" rel="noopener noreferrer">View decklist</a>`
          : `<button class="button ghost block" type="button" disabled>Decklist not posted yet</button>`}
      </div>`;
  }

  // Challenge request
  const locked = !isGym && !check.ok && !check.already;
  const message = isGym
    ? `Hi ${discord ? `@${discord}` : leader.name}! I'm ${trainer} from the Digimon League and I'd like to challenge you for the ${leader.award}. When are you free to battle?`
    : `Hi ${discord ? `@${discord}` : leader.name}! I'm ${trainer} from the Digimon League and I'm ready for my Elite Four battle against you (${leader.name}). When are you free?`;

  let challenge;
  if (locked) {
    challenge = `
      <button class="button block" type="button" disabled>Send challenge</button>
      <p class="muted small">${escapeHtml(check.reason)}</p>`;
  } else if (!discord && !discordId) {
    challenge = `
      <button class="button block" type="button" disabled>Send challenge</button>
      <p class="muted small">This leader's Discord hasn't been added yet.</p>`;
  } else {
    const action = discordId
      ? `<a id="challenge-btn" class="button block" href="https://discord.com/users/${discordId}" target="_blank" rel="noopener noreferrer">Send challenge on Discord</a>`
      : `<button id="challenge-btn" class="button block" type="button">Copy challenge message</button>`;
    const help = discordId
      ? "Copies your message and opens their Discord profile. Tap Message, then paste."
      : `Copies your message. Then find @${escapeHtml(discord)} in Discord and paste it.`;
    challenge = `
      <label for="challenge-msg" class="label">Challenge message</label>
      <textarea id="challenge-msg" rows="4">${escapeHtml(message)}</textarea>
      ${action}
      <p id="challenge-note" class="muted small">${help}</p>`;
  }

  els.leaderBody.innerHTML = `
    <div class="leader-head">
      <div class="leader-art">${art}</div>
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h2 id="leader-title" tabindex="-1">${escapeHtml(leader.name)}</h2>
        ${chip}
      </div>
    </div>
    <div class="leader-section">
      <div class="fact"><span>Discord</span><strong>${discord ? `@${escapeHtml(discord)}` : `<span class="muted">Not added yet</span>`}</strong></div>
    </div>
    ${specifics}
    <div class="leader-section">${challenge}</div>`;

  if (typeof els.leaderDialog.showModal === "function") els.leaderDialog.showModal();
  else els.leaderDialog.setAttribute("open", "");
  // Focus the title, not the message box, so phones don't pop up the keyboard.
  els.leaderBody.querySelector("#leader-title").focus();
  els.leaderDialog.scrollTop = 0;
}

// Tap a badge or Elite Four member to see their details.
[els.gymGrid, els.e4Grid].forEach((grid) => grid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-leader]");
  if (btn) openLeader(btn.dataset.leader);
}));

// Send challenge: copy the message, and (when we know their Discord ID) open their profile.
els.leaderBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("#challenge-btn");
  if (!btn) return;
  const msg = els.leaderBody.querySelector("#challenge-msg");
  const note = els.leaderBody.querySelector("#challenge-note");
  try {
    await navigator.clipboard.writeText(msg.value);
    note.textContent = btn.tagName === "A"
      ? "Message copied! In Discord, tap Message and paste it."
      : "Message copied! Find them in Discord and paste it in a message.";
    note.className = "small note-ok";
  } catch {
    msg.focus();
    msg.select();
    note.textContent = "Couldn't copy automatically. Copy the message above, then paste it in Discord.";
    note.className = "small note-warn";
  }
});

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

// Challenge Code pop-up
els.codeBtn.addEventListener("click", () => {
  if (typeof els.codeDialog.showModal === "function") els.codeDialog.showModal();
  else els.codeDialog.setAttribute("open", "");
});

// Tapping outside a pop-up closes it.
[els.codeDialog, els.leaderDialog].forEach((dialog) => dialog.addEventListener("click", (e) => {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) dialog.close();
}));

// Check for new badges when the code is closed (the leader has usually just scanned it).
els.codeDialog.addEventListener("close", refresh);

// Keep the dashboard current: when the trainer comes back to the tab, and every minute while open.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
setInterval(() => {
  if (document.visibilityState === "visible" && !els.codeDialog.open) refresh();
}, 60_000);

if (store.get(STORAGE_KEYS.trainer)) showCard();
else showNameForm();

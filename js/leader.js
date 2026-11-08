// Leader tools: scan a challenger's QR code and save the win to data/players.json on GitHub.
//
// GitHub Pages can't write files, so this page saves through the GitHub API using a
// fine-grained token (Contents: read & write on this repo only). The token is never in the
// repo: it arrives in a private leader link (#role=...&token=...) and is kept on this device.

const $ = (id) => document.getElementById(id);

const els = {
  setupView: $("setup-view"),
  setupForm: $("setup-form"),
  tokenInput: $("token-input"),
  roleSelect: $("role-select"),
  setupError: $("setup-error"),
  setupBtn: $("setup-btn"),
  challengerNote: $("challenger-note"),
  mainView: $("main-view"),
  roleArt: $("role-art"),
  roleName: $("role-name"),
  signoutBtn: $("signout-btn"),
  organizerPick: $("organizer-pick"),
  leaderSelect: $("leader-select"),
  challengerInput: $("challenger-input"),
  playerList: $("player-list"),
  scanBtn: $("scan-btn"),
  box: $("challenger-box"),
  cName: $("challenger-name"),
  cTag: $("challenger-tag"),
  cBadges: $("challenger-badges"),
  cSummary: $("challenger-summary"),
  check: $("challenge-check"),
  recordBtn: $("record-btn"),
  removeBtn: $("remove-btn"),
  result: $("result"),
  loadStatus: $("load-status"),
  linksPanel: $("links-panel"),
  linksList: $("links-list"),
  confirmDialog: $("confirm-dialog"),
  confirmText: $("confirm-text"),
  confirmOk: $("confirm-ok"),
  scanner: $("scanner"),
  video: $("scanner-video"),
  scanCancel: $("scan-cancel"),
};

const ORGANIZER = "organizer";
const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

let leagueData = { players: [] };
let busy = false;

// ---------- Settings on this device ----------
function getToken() { return store.get(STORAGE_KEYS.token); }
function getRole() { return store.get(STORAGE_KEYS.role); }
function isValidRole(role) { return role === ORGANIZER || Boolean(getLeader(role)); }

function apiBase() {
  // A local mock API can be used while testing on localhost; the live site always uses GitHub.
  return (isLocalHost && store.get(STORAGE_KEYS.apiBase)) || "https://api.github.com";
}

// The leader whose win is being recorded: fixed for a leader, chosen from a list for the organizer.
function activeLeaderId() {
  const role = getRole();
  return role === ORGANIZER ? els.leaderSelect.value : role;
}

// Reads #role=, #token= and #challenger= from the link, then removes the token from the address bar.
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("token");
  const role = params.get("role");
  const api = params.get("api");
  const challenger = params.get("challenger");

  if (api && isLocalHost) store.set(STORAGE_KEYS.apiBase, api);
  if (token) store.set(STORAGE_KEYS.token, token);
  if (role && isValidRole(role)) store.set(STORAGE_KEYS.role, role);

  if (token || role || api) {
    const keep = challenger ? `#challenger=${encodeURIComponent(challenger)}` : "";
    history.replaceState(null, "", location.pathname + location.search + keep);
  }
  return { challenger: challenger ? cleanName(challenger) : null };
}

// ---------- GitHub API ----------
const contentsPath = () =>
  `/repos/${LEAGUE.repo.owner}/${LEAGUE.repo.name}/contents/${LEAGUE.repo.dataPath}`;

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function encodeBase64(text) {
  let bin = "";
  new TextEncoder().encode(text).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function githubRequest(path, options = {}, token = getToken()) {
  return fetch(`${apiBase()}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

async function apiError(res) {
  let detail = "";
  try { detail = (await res.json()).message || ""; } catch { /* no body */ }
  if (res.status === 401) return new Error("The access token is invalid or has expired. Ask the organizer for a new leader link.");
  if (res.status === 403 || res.status === 404) {
    return new Error("This token can't reach the league data. It needs Contents: Read and write on the Digimon-League-Website repo.");
  }
  return new Error(`GitHub error ${res.status}${detail ? `: ${detail}` : ""}`);
}

async function fetchRemote(token) {
  const res = await githubRequest(`${contentsPath()}?ref=${encodeURIComponent(LEAGUE.repo.branch)}`, {}, token);
  if (!res.ok) throw await apiError(res);
  const file = await res.json();
  return { sha: file.sha, data: normalizeData(JSON.parse(decodeBase64(file.content))) };
}

// Loads the latest file, applies the change, and saves it. Retries if someone else saved at the same moment.
async function updateRemote(change, message) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { sha, data } = await fetchRemote();
    change(data); // throws if the change isn't allowed against the latest data

    const res = await githubRequest(contentsPath(), {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`),
        sha,
        branch: LEAGUE.repo.branch,
      }),
    });

    if (res.ok) return data;
    if (res.status === 409 || res.status === 422) continue; // file changed underneath us: reload and retry
    throw await apiError(res);
  }
  throw new Error("Couldn't save because the data kept changing. Please try again.");
}

// ---------- In-page confirmation ----------
// Browser pop-ups (confirm/prompt) are silently blocked in some in-app browsers, so we use our own.
function askConfirm(message, okLabel = "Confirm", danger = false) {
  const dialog = els.confirmDialog;
  if (typeof dialog.showModal !== "function") return Promise.resolve(true);

  return new Promise((resolve) => {
    els.confirmText.textContent = message;
    els.confirmOk.textContent = okLabel;
    els.confirmOk.className = danger ? "button danger" : "button";
    dialog.returnValue = "";
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
    dialog.showModal();
    els.confirmOk.focus();
  });
}

// ---------- Setup ----------
function fillRoleOptions(select, includeOrganizer) {
  const options = [];
  if (includeOrganizer) options.push(`<option value="${ORGANIZER}">Organizer (all leaders)</option>`);
  options.push(`<optgroup label="Gym leaders">${LEAGUE.gyms.map((g) =>
    `<option value="${g.id}">${escapeHtml(g.leader)}</option>`).join("")}</optgroup>`);
  options.push(`<optgroup label="Elite Four">${LEAGUE.elite4.map((m) =>
    `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}</optgroup>`);
  select.innerHTML = options.join("");
}

function showSetup(challenger) {
  els.mainView.hidden = true;
  els.setupView.hidden = false;
  els.challengerNote.hidden = !challenger;
  els.setupError.hidden = true;
}

els.setupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = els.tokenInput.value.trim();
  const role = els.roleSelect.value;
  if (!token) return;

  els.setupBtn.disabled = true;
  els.setupBtn.textContent = "Checking…";
  els.setupError.hidden = true;
  try {
    await fetchRemote(token); // make sure the token can read the data before saving it
    store.set(STORAGE_KEYS.token, token);
    store.set(STORAGE_KEYS.role, role);
    els.tokenInput.value = "";
    showMain(cleanName(els.challengerInput.value) || null);
  } catch (err) {
    els.setupError.textContent = err.message;
    els.setupError.hidden = false;
  } finally {
    els.setupBtn.disabled = false;
    els.setupBtn.textContent = "Save on this device";
  }
});

els.signoutBtn.addEventListener("click", async () => {
  if (!(await askConfirm("Remove the leader access token from this device?", "Sign out", true))) return;
  store.remove(STORAGE_KEYS.token);
  store.remove(STORAGE_KEYS.role);
  showSetup(false);
});

// ---------- Main view ----------
function showMain(challenger) {
  els.setupView.hidden = true;
  els.mainView.hidden = false;

  const role = getRole();
  const organizer = role === ORGANIZER;
  els.organizerPick.hidden = !organizer;
  els.linksPanel.hidden = !organizer;
  if (organizer) renderLinks();

  if (challenger) els.challengerInput.value = challenger;
  renderRole();
  renderChallenger();
  loadData();
}

function renderRole() {
  const role = getRole();
  if (role === ORGANIZER) {
    els.roleName.textContent = "Organizer";
    els.roleArt.innerHTML = trophySvg(true);
    return;
  }
  const leader = getLeader(role);
  els.roleName.textContent = leader.name;
  els.roleArt.innerHTML = leader.type === "gym"
    ? gymBadgeSvg(LEAGUE.gyms.find((g) => g.id === leader.id), true)
    : elite4Svg({ order: leader.order }, "next");
}

async function loadData() {
  els.loadStatus.textContent = "Loading league data…";
  try {
    leagueData = (await fetchRemote()).data;
    renderPlayerList();
    renderChallenger();
  } catch (err) {
    els.loadStatus.textContent = "";
    showResult("error", err.message);
  }
}

// Name suggestions for the challenger box, plus the trainer count.
function renderPlayerList() {
  const count = leagueData.players.length;
  els.playerList.innerHTML = leagueData.players
    .map((p) => `<option value="${escapeHtml(p.name)}"></option>`).join("");
  els.loadStatus.textContent = `${count} trainer${count === 1 ? "" : "s"} on record.`;
}

function renderChallenger() {
  const typed = cleanName(els.challengerInput.value);
  if (!typed) { els.box.hidden = true; return; }

  const leaderId = activeLeaderId();
  const leader = getLeader(leaderId);
  const player = findPlayer(leagueData, typed);
  const progress = getProgress(player);
  const check = checkChallenge(player, leaderId);

  els.box.hidden = false;
  els.cName.textContent = player ? player.name : typed;
  els.cTag.textContent = player ? `${progress.gymCount} / ${LEAGUE.gyms.length} badges` : "New challenger";
  els.cBadges.innerHTML = miniBadgesHtml(progress);
  els.cSummary.textContent = player
    ? `${progress.e4Count} / ${LEAGUE.elite4.length} Elite Four defeated${progress.invited ? " · Championship invite" : ""}`
    : "Not on record yet. Recording a win adds them to the league.";

  els.check.hidden = check.ok;
  els.check.textContent = check.ok ? "" : check.reason;
  els.recordBtn.disabled = !check.ok || busy;
  els.recordBtn.textContent = `Record win: ${player ? player.name : typed} beat ${leader.name}`;

  // The organizer can undo a mistaken win.
  const canRemove = getRole() === ORGANIZER && check.already;
  els.removeBtn.hidden = !canRemove;
  els.removeBtn.disabled = busy;
  els.removeBtn.textContent = `Remove this win (${leader.award})`;
}

function showResult(kind, html) {
  els.result.className = `notice ${kind}`;
  els.result.innerHTML = html;
  els.result.hidden = false;
}

async function save(kind) {
  const typed = cleanName(els.challengerInput.value);
  const leaderId = activeLeaderId();
  const leader = getLeader(leaderId);
  if (!typed || !leader) return;

  const verb = kind === "record" ? "Record" : "Remove";
  const question = kind === "record"
    ? `Record that ${typed} beat ${leader.name}?`
    : `Remove ${typed}'s win against ${leader.name}?`;
  if (!(await askConfirm(question, kind === "record" ? "Record win" : "Remove win", kind !== "record"))) return;

  busy = true;
  renderChallenger();
  showResult("warn", "Saving…");

  try {
    let savedName = typed;
    leagueData = await updateRemote((data) => {
      let player = findPlayer(data, typed);
      const field = leader.type === "gym" ? "gyms" : "elite4";

      if (kind === "record") {
        const check = checkChallenge(player, leaderId);
        if (!check.ok) throw new Error(check.reason);
        if (!player) {
          player = { name: typed, gyms: {}, elite4: {} };
          data.players.push(player);
        }
        player[field] = player[field] || {};
        player[field][leaderId] = new Date().toISOString();
      } else {
        if (!player || !player[field]?.[leaderId]) throw new Error("That win isn't on record.");
        delete player[field][leaderId];
        // A trainer with no wins left is taken off the leaderboard entirely.
        if (!Object.keys(player.gyms || {}).length && !Object.keys(player.elite4 || {}).length) {
          data.players.splice(data.players.indexOf(player), 1);
        }
      }
      savedName = player.name;
    }, `${verb} win: ${typed} vs ${leader.name}`);
    renderPlayerList();

    const progress = getProgress(findPlayer(leagueData, savedName));
    let message = kind === "record"
      ? `Saved! ${escapeHtml(savedName)} earned the <strong>${escapeHtml(leader.award)}</strong>.`
      : `Removed ${escapeHtml(savedName)}'s win against ${escapeHtml(leader.name)}.`;
    if (kind === "record" && progress.invited) {
      message += ` They've beaten the whole Elite Four and earned the <strong>${escapeHtml(LEAGUE.championship.badge)}</strong>!`;
    } else if (kind === "record" && leader.type === "gym" && progress.allGyms) {
      message += " That's all 6 badges, so they can now challenge the Elite Four.";
    }
    message += " It'll show on their dashboard in about a minute.";
    showResult("ok", message);
  } catch (err) {
    showResult("error", escapeHtml(err.message));
  } finally {
    busy = false;
    renderChallenger();
  }
}

els.recordBtn.addEventListener("click", () => save("record"));
els.removeBtn.addEventListener("click", () => save("remove"));
els.challengerInput.addEventListener("input", () => { els.result.hidden = true; renderChallenger(); });
els.leaderSelect.addEventListener("change", () => { els.result.hidden = true; renderChallenger(); });

// ---------- Leader links (organizer only) ----------
function renderLinks() {
  const token = getToken();
  const roles = [{ id: ORGANIZER, name: "Organizer (all leaders)" }, ...allLeaders()];
  els.linksList.innerHTML = roles.map((r) => `
    <li>
      <span>${escapeHtml(r.name)}</span>
      <button class="button ghost small" type="button" data-role="${escapeHtml(r.id)}">Copy link</button>
    </li>`).join("");

  els.linksList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = new URL(`leader.html#role=${encodeURIComponent(btn.dataset.role)}&token=${encodeURIComponent(token)}`, location.href).href;
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy link"; }, 2000);
      } catch {
        // Clipboard blocked: show the link in a box so it can be copied by hand.
        const input = document.createElement("input");
        input.type = "text";
        input.readOnly = true;
        input.className = "link-fallback";
        input.value = url;
        btn.replaceWith(input);
        input.focus();
        input.select();
      }
    });
  });
}

// ---------- QR scanner ----------
let stream = null;
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

function nameFromScan(text) {
  try {
    const url = new URL(text);
    const name = new URLSearchParams(url.hash.slice(1)).get("challenger");
    if (name) return cleanName(name);
  } catch { /* not a URL: treat it as a plain name */ }
  return cleanName(text);
}

async function startScan() {
  els.result.hidden = true;
  if (!navigator.mediaDevices?.getUserMedia || typeof jsQR !== "function") {
    showResult("error", "The QR scanner isn't available in this browser. You can scan with your phone's camera app, or type the name.");
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch {
    showResult("error", "Couldn't use the camera. Allow camera access for this site, or type the challenger's name.");
    return;
  }
  els.video.srcObject = stream;
  els.scanner.hidden = false;
  await els.video.play().catch(() => {});
  requestAnimationFrame(scanFrame);
}

function stopScan() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  els.video.srcObject = null;
  els.scanner.hidden = true;
}

function scanFrame() {
  if (!stream) return;
  const v = els.video;
  if (v.readyState >= 2 && v.videoWidth) {
    const scale = Math.min(1, 640 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    if (code?.data) {
      stopScan();
      const name = nameFromScan(code.data);
      if (name) {
        els.challengerInput.value = name;
        renderChallenger();
        els.recordBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
  }
  requestAnimationFrame(scanFrame);
}

els.scanBtn.addEventListener("click", startScan);
els.scanCancel.addEventListener("click", stopScan);

// ---------- Start ----------
function start() {
  fillRoleOptions(els.roleSelect, true);
  fillRoleOptions(els.leaderSelect, false);

  const { challenger } = readHash();
  if (getToken() && isValidRole(getRole())) showMain(challenger);
  else {
    if (challenger) els.challengerInput.value = challenger;
    showSetup(Boolean(challenger));
  }
}

// A leader who scans with their phone's camera app lands here with #challenger=Name.
// Opening a different leader link in an open tab switches to that role.
window.addEventListener("hashchange", () => {
  const before = `${getToken()}|${getRole()}`;
  const { challenger } = readHash();
  if (before !== `${getToken()}|${getRole()}` && getToken() && isValidRole(getRole())) {
    els.result.hidden = true;
    showMain(challenger);
    return;
  }
  if (challenger && !els.mainView.hidden) {
    els.challengerInput.value = challenger;
    els.result.hidden = true;
    renderChallenger();
  }
});

start();

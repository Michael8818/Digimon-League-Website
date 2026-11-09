// Shared helpers used by every page.

// ---------- Safe local storage (works even when storage is blocked) ----------
const store = (() => {
  const memory = {};
  return {
    get(key) {
      try { return localStorage.getItem(key); } catch { return memory[key] ?? null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { memory[key] = value; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { delete memory[key]; }
    },
  };
})();

const STORAGE_KEYS = {
  trainer: "dl.trainerName",
  token: "dl.leaderToken",
  role: "dl.leaderRole",
  apiBase: "dl.apiBase", // local testing only
};

// ---------- Text helpers ----------
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ---------- Data ----------
async function loadLeagueData() {
  // The query string skips GitHub Pages' cache so new wins show up quickly.
  const res = await fetch(`data/players.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load player data (${res.status}).`);
  return normalizeData(await res.json());
}

// Extra leader details (Discord, rules, decks) from data/leaders.json. Missing file = no details.
async function loadLeaderDetails() {
  const res = await fetch(`data/leaders.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load leader details (${res.status}).`);
  const data = await res.json();
  return { gyms: data?.gyms || {}, elite4: data?.elite4 || {} };
}

// Only allow real web links (blocks javascript: and other schemes).
function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeData(data) {
  const players = Array.isArray(data?.players) ? data.players : [];
  return {
    ...data,
    players: players
      .filter((p) => p && typeof p.name === "string" && p.name.trim())
      .map((p) => ({ ...p, gyms: p.gyms || {}, elite4: p.elite4 || {} })),
  };
}

function findPlayer(data, name) {
  const key = normalizeName(name);
  return data.players.find((p) => normalizeName(p.name) === key) || null;
}

// Every leader a win can be recorded against: the 6 gyms, then the Elite 4.
function allLeaders() {
  return [
    ...LEAGUE.gyms.map((g) => ({ id: g.id, type: "gym", name: g.leader, award: g.badge, color: g.color })),
    ...LEAGUE.elite4.map((m, i) => ({ id: m.id, type: "elite4", name: m.name, award: `Elite Four win #${i + 1}`, order: i + 1 })),
  ];
}

function getLeader(id) {
  return allLeaders().find((l) => l.id === id) || null;
}

// Works out what a player has earned and what they can challenge next.
function getProgress(player) {
  const gymWins = player?.gyms || {};
  const e4Wins = player?.elite4 || {};

  const gyms = LEAGUE.gyms.map((g) => ({ ...g, earned: Boolean(gymWins[g.id]), date: gymWins[g.id] || null }));
  const gymCount = gyms.filter((g) => g.earned).length;
  const allGyms = gymCount === LEAGUE.gyms.length;

  let previousBeaten = true;
  const elite4 = LEAGUE.elite4.map((m, i) => {
    const date = e4Wins[m.id] || null;
    const defeated = Boolean(date);
    let status = "locked";
    if (defeated) status = "defeated";
    else if (allGyms && previousBeaten) status = "next";
    previousBeaten = previousBeaten && defeated;
    return { ...m, order: i + 1, defeated, date, status };
  });
  const e4Count = elite4.filter((m) => m.defeated).length;
  const invited = allGyms && e4Count === LEAGUE.elite4.length;

  const dates = [...Object.values(gymWins), ...Object.values(e4Wins)].filter(Boolean).sort();
  const lastWin = dates.length ? dates[dates.length - 1] : null;

  return { gyms, gymCount, allGyms, elite4, e4Count, invited, lastWin };
}

// Can this player record a win against this leader right now? Returns { ok, reason }.
function checkChallenge(player, leaderId) {
  const leader = getLeader(leaderId);
  if (!leader) return { ok: false, reason: "Unknown leader." };
  const progress = getProgress(player);

  if (leader.type === "gym") {
    const gym = progress.gyms.find((g) => g.id === leaderId);
    if (gym.earned) return { ok: false, already: true, reason: `Already has the ${gym.badge}.` };
    return { ok: true };
  }

  const member = progress.elite4.find((m) => m.id === leaderId);
  if (member.defeated) return { ok: false, already: true, reason: `Already defeated ${member.name}.` };
  if (!progress.allGyms) {
    return { ok: false, reason: `Needs all ${LEAGUE.gyms.length} gym badges first (has ${progress.gymCount}).` };
  }
  if (member.status !== "next") {
    const next = progress.elite4.find((m) => m.status === "next");
    return { ok: false, reason: `Elite Four must be beaten in order. Next up: ${next ? next.name : "none"}.` };
  }
  return { ok: true };
}

// Sort for the leaderboard: invitation, then Elite 4 wins, then badges, then whoever got there first.
function compareProgress(a, b) {
  return (
    Number(b.progress.invited) - Number(a.progress.invited) ||
    b.progress.e4Count - a.progress.e4Count ||
    b.progress.gymCount - a.progress.gymCount ||
    String(a.progress.lastWin || "9999").localeCompare(String(b.progress.lastWin || "9999")) ||
    a.name.localeCompare(b.name)
  );
}

// ---------- Badge artwork (inline SVG) ----------
const LOCK_GLYPH = `
  <g class="lock">
    <path d="M26.5 31v-4.5a5.5 5.5 0 0 1 11 0V31" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <rect x="23" y="30" width="18" height="14" rx="3" fill="currentColor"/>
  </g>`;

function gymBadgeSvg(gym, earned) {
  const fill = earned ? gym.color : "var(--locked)";
  return `
    <svg class="badge-art ${earned ? "earned" : "is-locked"}" viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill="${fill}" stroke="var(--badge-stroke)" stroke-width="2"/>
      <polygon points="32,13 48,22.5 48,41.5 32,51 16,41.5 16,22.5" fill="rgba(255,255,255,${earned ? 0.22 : 0.06})"/>
      ${earned
        ? `<polygon points="32,22 41,32 32,42 23,32" fill="rgba(255,255,255,0.9)"/>`
        : LOCK_GLYPH}
    </svg>`;
}

function elite4Svg(member, status) {
  const defeated = status === "defeated";
  return `
    <svg class="badge-art ${defeated ? "earned" : "is-locked"}" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="${defeated ? "var(--e4)" : "var(--locked)"}" stroke="var(--badge-stroke)" stroke-width="2"/>
      <circle cx="32" cy="32" r="20" fill="rgba(255,255,255,${defeated ? 0.18 : 0.06})"/>
      ${status === "locked"
        ? LOCK_GLYPH
        : `<text x="32" y="40" text-anchor="middle" font-size="22" font-weight="800" fill="${defeated ? "#fff" : "currentColor"}">${member.order}</text>`}
    </svg>`;
}

function trophySvg(earned) {
  return `
    <svg class="badge-art ${earned ? "earned" : "is-locked"}" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 10h28v14a14 14 0 0 1-28 0z" fill="${earned ? "var(--gold)" : "var(--locked)"}" stroke="var(--badge-stroke)" stroke-width="2"/>
      <path d="M18 14H10v4a10 10 0 0 0 9 10M46 14h8v4a10 10 0 0 1-9 10" fill="none" stroke="${earned ? "var(--gold)" : "var(--locked)"}" stroke-width="3"/>
      <rect x="28" y="37" width="8" height="9" fill="${earned ? "var(--gold)" : "var(--locked)"}"/>
      <rect x="20" y="46" width="24" height="7" rx="2" fill="${earned ? "var(--gold)" : "var(--locked)"}" stroke="var(--badge-stroke)" stroke-width="2"/>
      ${earned ? `<path d="M32 15l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="#fff" opacity=".9"/>` : ""}
    </svg>`;
}

// Small badge row used on the leaderboard and leader page. Earned = filled, locked = hollow outline.
function miniBadgesHtml(progress) {
  const gyms = progress.gyms.map((g) => `
    <svg class="mini" viewBox="0 0 20 20" role="img" aria-label="${escapeHtml(g.badge)}${g.earned ? "" : " (locked)"}">
      <title>${escapeHtml(g.badge)}${g.earned ? "" : " (locked)"}</title>
      <polygon points="10,1.5 17.5,5.75 17.5,14.25 10,18.5 2.5,14.25 2.5,5.75"
        fill="${g.earned ? g.color : "none"}" stroke="${g.earned ? "var(--badge-stroke)" : "var(--mini-off)"}" stroke-width="1.5"/>
    </svg>`).join("");
  const e4 = progress.elite4.map((m) => `
    <svg class="mini" viewBox="0 0 20 20" role="img" aria-label="${escapeHtml(m.name)}${m.defeated ? " defeated" : ""}">
      <title>${escapeHtml(m.name)}${m.defeated ? " defeated" : ""}</title>
      <circle cx="10" cy="10" r="8" fill="${m.defeated ? "var(--e4)" : "none"}"
        stroke="${m.defeated ? "var(--badge-stroke)" : "var(--mini-off)"}" stroke-width="1.5"/>
    </svg>`).join("");
  return `${gyms}<span class="mini-sep"></span>${e4}`;
}

// ---------- Shared page bits ----------
function setFooterYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = new Date().getFullYear();
}

document.addEventListener("DOMContentLoaded", setFooterYear);

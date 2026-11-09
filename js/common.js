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
const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// The newest version of players.json in the gist. The changing query string skips the cache,
// so new wins show up right away. (On localhost a mock API can stand in for GitHub.)
function gistRawUrl() {
  const mock = isLocalHost && store.get(STORAGE_KEYS.apiBase);
  const base = mock ? `${mock}/gist-raw` : "https://gist.githubusercontent.com";
  const { owner, id, file } = LEAGUE.gist;
  return `${base}/${owner}/${id}/raw/${encodeURIComponent(file)}?v=${Date.now()}`;
}

async function loadLeagueData() {
  const res = await fetch(gistRawUrl(), { cache: "no-store" });
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

  // Elite Four rules: with all gym badges, every member except the last can be challenged in
  // any order. The last member (#4) unlocks only after all the others are beaten.
  // "next" means available to challenge now.
  const lastIndex = LEAGUE.elite4.length - 1;
  const othersBeaten = LEAGUE.elite4.slice(0, lastIndex).every((m) => e4Wins[m.id]);
  const elite4 = LEAGUE.elite4.map((m, i) => {
    const date = e4Wins[m.id] || null;
    const defeated = Boolean(date);
    let status = "locked";
    if (defeated) status = "defeated";
    else if (allGyms && (i < lastIndex || othersBeaten)) status = "next";
    return { ...m, order: i + 1, defeated, date, status, isFinal: i === lastIndex };
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
    const missing = progress.elite4.filter((m) => !m.isFinal && !m.defeated).map((m) => m.name);
    return { ok: false, reason: `${member.name} is the final battle. Beat ${listNames(missing)} first.` };
  }
  return { ok: true };
}

// "A", "A and B", "A, B and C"
function listNames(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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
// Every SVG gets its own gradient ids, so badges in different colors never share one.
let svgUid = 0;

// Mix a #rrggbb color toward white (amt > 0) or black (amt < 0).
function shade(hex, amt) {
  const n = parseInt(String(hex).replace("#", ""), 16) || 0;
  const t = amt > 0 ? 255 : 0;
  const a = Math.abs(amt);
  const ch = (v) => Math.round(v + (t - v) * a);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// Five tones of one color, from highlight to deep shadow, for a metallic bevel.
function tones(hex) {
  return { hi: shade(hex, 0.6), light: shade(hex, 0.3), base: shade(hex, 0), dark: shade(hex, -0.3), deep: shade(hex, -0.55) };
}

// Not earned yet: dull gunmetal.
const LOCKED_TONES = { hi: "#a3a9b5", light: "#7c828e", base: "#5e6470", dark: "#454a55", deep: "#2f333c" };

function lockGlyph(cx, cy) {
  return `
    <g transform="translate(${cx - 9} ${cy - 10})">
      <path d="M4.5 9V6.5a4.5 4.5 0 0 1 9 0V9" fill="none" stroke="#e8eaf0" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="2" y="8.5" width="14" height="11" rx="2.5" fill="#e8eaf0"/>
      <circle cx="9" cy="13.5" r="1.7" fill="#454a55"/>
    </g>`;
}

const pts = (list) => list.map((p) => p.map((v) => Math.round(v * 10) / 10).join(",")).join(" ");

// Hexagon corners, pointy side up: top, top-right, bottom-right, bottom, bottom-left, top-left.
function hexCorners(cx, cy, r) {
  return [-90, -30, 30, 90, 150, 210].map((d) => {
    const a = (d * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

// One laurel branch up the left side; the right side is a mirror image.
function laurelBranch(fill) {
  const R = 38, cx = 50, cy = 50;
  const at = (deg, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const [sx, sy] = at(118);
  const [ex, ey] = at(222);
  let leaves = "";
  for (let i = 0; i < 8; i++) {
    const deg = 124 + i * 13;
    const along = deg + 90; // direction the branch grows (upward)
    for (const side of [1, -1]) {
      const [x, y] = at(deg, R + side * 3.6);
      leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="2.5" transform="rotate(${(along + side * 32).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${fill}"/>`;
    }
  }
  const [tx, ty] = at(228);
  leaves += `<ellipse cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" rx="6" ry="2.5" transform="rotate(${228 + 90} ${tx.toFixed(1)} ${ty.toFixed(1)})" fill="${fill}"/>`;
  return `
    <path d="M${sx.toFixed(1)} ${sy.toFixed(1)} A${R} ${R} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${fill}" stroke-width="1.6"/>
    ${leaves}`;
}

// Gym badge: beveled hexagon medal with a gem, laurel wreath and ribbon tails.
function gymBadgeSvg(gym, earned) {
  const t = earned ? tones(gym.color) : LOCKED_TONES;
  const id = `gb${++svgUid}`;
  const O = hexCorners(50, 44, 30);
  const I = hexCorners(50, 44, 21);
  const G = hexCorners(50, 44, 9);
  // Bevel facets lit from the top-left: top-right, right, bottom-right, bottom-left, left, top-left.
  const facetTone = [t.light, t.dark, t.deep, t.dark, t.light, t.hi];
  const facets = O.map((p, k) => {
    const n = (k + 1) % 6;
    return `<polygon points="${pts([O[k], O[n], I[n], I[k]])}" fill="${facetTone[k]}"/>`;
  }).join("");

  return `
    <svg class="badge-art ${earned ? "earned" : "is-locked"}" viewBox="0 0 100 110" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${t.hi}"/><stop offset="1" stop-color="${t.dark}"/>
        </linearGradient>
        <linearGradient id="${id}-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${t.light}"/><stop offset="0.55" stop-color="${t.base}"/><stop offset="1" stop-color="${t.dark}"/>
        </linearGradient>
        <linearGradient id="${id}-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="${t.hi}"/><stop offset="1" stop-color="${t.light}"/>
        </linearGradient>
        <linearGradient id="${id}-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${t.dark}"/><stop offset="1" stop-color="${t.base}"/>
        </linearGradient>
      </defs>

      <!-- laurel wreath -->
      <g>${laurelBranch(`url(#${id}-leaf)`)}</g>
      <g transform="translate(100 0) scale(-1 1)">${laurelBranch(`url(#${id}-leaf)`)}</g>

      <!-- ribbon tails -->
      <polygon points="37,62 49,62 49,104 43,97 37,104" fill="url(#${id}-ribbon)" stroke="${t.deep}" stroke-width="1"/>
      <polygon points="51,62 63,62 63,104 57,97 51,104" fill="url(#${id}-ribbon)" stroke="${t.deep}" stroke-width="1"/>

      <!-- medal -->
      ${facets}
      <polygon points="${pts(O)}" fill="none" stroke="${t.deep}" stroke-width="1.6" stroke-linejoin="round"/>
      <polygon points="${pts(I)}" fill="url(#${id}-face)" stroke="${t.deep}" stroke-width="1.4" stroke-linejoin="round"/>

      ${earned
        ? `<polygon points="${pts(G)}" fill="url(#${id}-gem)" stroke="${t.deep}" stroke-width="1"/>
           <polygon points="${pts([G[5], G[0], [50, 44]])}" fill="#fff" opacity="0.55"/>
           <polygon points="${pts([G[2], G[3], [50, 44]])}" fill="${t.dark}" opacity="0.35"/>
           <line x1="44" y1="49" x2="52" y2="37" stroke="#fff" stroke-width="1.6" opacity="0.7"/>`
        : lockGlyph(50, 44)}

      <!-- clasp -->
      <rect x="41" y="72" width="18" height="12" rx="2.5" fill="${t.dark}" stroke="${t.deep}" stroke-width="1.2"/>
      <circle cx="50" cy="78" r="3.8" fill="${earned ? t.hi : t.light}" stroke="${t.deep}" stroke-width="1"/>
    </svg>`;
}

// Elite Four crest: angular emblem that gets grander by rank
// (#2 adds side blades, #3 adds crown spikes, #4 adds wings).
function elite4Svg(member, status) {
  const colored = status === "defeated";
  const t = colored ? tones(member.color || "#6366f1") : LOCKED_TONES;
  const rank = member.order || 1;
  const id = `e4${++svgUid}`;
  const mirror = (inner) => `<g>${inner}</g><g transform="translate(100 0) scale(-1 1)">${inner}</g>`;

  // Four fanned feathers per wing, drawn back (top) to front (bottom).
  const wings = rank >= 4 ? mirror(`
    <path d="M37 42 Q15 20 1 16 Q14 34 34 52 Z" fill="${t.light}" stroke="${t.deep}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M36 47 Q13 32 0 31 Q15 45 33 57 Z" fill="url(#${id}-metal)" stroke="${t.deep}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M35 52 Q15 45 3 47 Q17 56 32 61 Z" fill="${t.base}" stroke="${t.deep}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M34 57 Q19 57 9 62 Q22 65 32 64 Z" fill="${t.dark}" stroke="${t.deep}" stroke-width="1.1" stroke-linejoin="round"/>`) : "";
  const blades = rank >= 2 ? mirror(`
    <polygon points="30,52 5,41 19,63 31,62" fill="${t.light}" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>
    <polygon points="30,52 19,63 31,62" fill="${t.dark}" opacity="0.6"/>`) : "";
  const crown = rank >= 3 ? mirror(`
    <polygon points="42,27 34,5 49,19" fill="${t.light}" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>`) : "";

  const center = status === "locked"
    ? lockGlyph(50, 53)
    : `<text x="50" y="58" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" font-family="system-ui, sans-serif">${rank}</text>`;

  return `
    <svg class="badge-art ${colored ? "earned" : status === "next" ? "is-next" : "is-locked"}" viewBox="0 0 100 110" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${t.hi}"/><stop offset="0.5" stop-color="${t.base}"/><stop offset="1" stop-color="${t.dark}"/>
        </linearGradient>
        <linearGradient id="${id}-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${t.base}"/><stop offset="1" stop-color="${t.deep}"/>
        </linearGradient>
      </defs>
      ${wings}
      ${blades}
      ${crown}
      <!-- crest -->
      <path d="M50 6 L63 30 L86 20 L73 52 L50 102 L27 52 L14 20 L37 30 Z" fill="url(#${id}-metal)" stroke="${t.deep}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M50 6 L63 30 L86 20 L73 52 L50 102 Z" fill="${t.deep}" opacity="0.28"/>
      <!-- inner plate -->
      <path d="M50 24 L59 40 L69 36 L62 56 L50 84 L38 56 L31 36 L41 40 Z" fill="url(#${id}-plate)" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M50 24 L41 40 L31 36 L38 56 L50 84 Z" fill="#fff" opacity="0.12"/>
      <!-- medallion -->
      <circle cx="50" cy="53" r="11" fill="${t.deep}" stroke="${t.hi}" stroke-width="1.6"/>
      ${center}
    </svg>`;
}

// Championship Invitation: winged gold crest with a crown, a central diamond and
// six small gems in the gym colors (one for each badge that led here).
function trophySvg(earned) {
  const t = earned ? tones("#e3a008") : LOCKED_TONES;
  const id = `ch${++svgUid}`;
  const mirror = (inner) => `<g>${inner}</g><g transform="translate(120 0) scale(-1 1)">${inner}</g>`;

  const wings = mirror(`
    <path d="M40 44 Q16 18 2 12 Q16 34 37 54 Z" fill="${t.light}" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M39 50 Q14 32 0 31 Q16 46 36 60 Z" fill="url(#${id}-metal)" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M38 56 Q16 48 3 50 Q18 60 35 65 Z" fill="${t.base}" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M37 62 Q20 62 9 68 Q23 71 35 69 Z" fill="${t.dark}" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>`);

  // Six gym gems in an arc around the diamond.
  const gems = LEAGUE.gyms.map((g, i) => {
    const a = ((180 + i * 36) * Math.PI) / 180;
    const x = (60 + 21 * Math.cos(a)).toFixed(1);
    const y = (57 + 21 * Math.sin(a)).toFixed(1);
    const fill = earned ? g.color : t.light;
    return `<circle cx="${x}" cy="${y}" r="3.8" fill="${fill}" stroke="${t.deep}" stroke-width="1"/>
            <circle cx="${(x - 1.2).toFixed(1)}" cy="${(y - 1.2).toFixed(1)}" r="1.2" fill="#fff" opacity="${earned ? 0.75 : 0.3}"/>`;
  }).join("");

  const center = earned
    ? `<polygon points="60,43 71,57 60,72 49,57" fill="url(#${id}-gem)" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>
       <polygon points="60,43 49,57 60,57" fill="#fff" opacity="0.7"/>
       <polygon points="60,57 71,57 60,72" fill="#0b3a66" opacity="0.25"/>
       <line x1="53" y1="58" x2="61" y2="47" stroke="#fff" stroke-width="1.4" opacity="0.8"/>`
    : lockGlyph(60, 57);

  return `
    <svg class="badge-art ${earned ? "earned" : "is-locked"}" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${t.hi}"/><stop offset="0.5" stop-color="${t.base}"/><stop offset="1" stop-color="${t.dark}"/>
        </linearGradient>
        <linearGradient id="${id}-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${t.dark}"/><stop offset="1" stop-color="${t.deep}"/>
        </linearGradient>
        <linearGradient id="${id}-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#bfe6ff"/><stop offset="1" stop-color="#5fb4f5"/>
        </linearGradient>
      </defs>
      ${wings}
      <!-- crown -->
      <path d="M43 26 L46 6 L54 17 L60 2 L66 17 L74 6 L77 26 Z" fill="url(#${id}-metal)" stroke="${t.deep}" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="46" cy="7" r="2.4" fill="${earned ? "#e5484d" : t.light}" stroke="${t.deep}" stroke-width="0.8"/>
      <circle cx="60" cy="3.5" r="2.6" fill="${earned ? "#3b82f6" : t.light}" stroke="${t.deep}" stroke-width="0.8"/>
      <circle cx="74" cy="7" r="2.4" fill="${earned ? "#22a55b" : t.light}" stroke="${t.deep}" stroke-width="0.8"/>
      <!-- crest -->
      <path d="M60 16 L86 28 L94 56 L60 110 L26 56 L34 28 Z" fill="url(#${id}-metal)" stroke="${t.deep}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M60 16 L86 28 L94 56 L60 110 Z" fill="${t.deep}" opacity="0.25"/>
      <path d="M60 28 L78 37 L84 57 L60 96 L36 57 L42 37 Z" fill="url(#${id}-plate)" stroke="${t.deep}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M60 28 L42 37 L36 57 L60 96 Z" fill="#fff" opacity="0.1"/>
      ${gems}
      ${center}
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
      <circle cx="10" cy="10" r="8" fill="${m.defeated ? (m.color || "var(--e4)") : "none"}"
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

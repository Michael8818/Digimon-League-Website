// Sample data: replace with your league's real standings and events.
const standings = [
  { player: "Player One", wins: 5, losses: 1 },
  { player: "Player Two", wins: 4, losses: 2 },
  { player: "Player Three", wins: 3, losses: 3 },
];

const events = [
  { name: "Weekly Locals", date: "Every Friday, 7pm", location: "Your local game store" },
  { name: "Season Championship", date: "TBD", location: "TBD" },
];

const POINTS_PER_WIN = 3;

function renderStandings() {
  const body = document.getElementById("standings-body");
  const sorted = [...standings].sort((a, b) => b.wins - a.wins);

  body.innerHTML = sorted
    .map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.player}</td>
        <td>${p.wins}</td>
        <td>${p.losses}</td>
        <td>${p.wins * POINTS_PER_WIN}</td>
      </tr>`)
    .join("");
}

function renderEvents() {
  const list = document.getElementById("events-list");

  list.innerHTML = events
    .map((e) => `
      <li class="card">
        <h3>${e.name}</h3>
        <p class="meta">${e.date}</p>
        <p class="meta">${e.location}</p>
      </li>`)
    .join("");
}

function setupNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  nav.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

document.getElementById("year").textContent = new Date().getFullYear();
renderStandings();
renderEvents();
setupNav();

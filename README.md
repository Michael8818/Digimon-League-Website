# Digimon League Website

Badge tracker for the Digimon League, hosted on GitHub Pages.

- **Dashboard** (`index.html`): asks for your trainer name on first visit and remembers it. Shows your 6 gym badges, your Elite Four progress and your Championship Invitation. The **Challenge Code** button shows a QR code for leaders to scan.
- **Leaderboard** (`leaderboard.html`): every trainer and their badges.
- **Leader tools** (`leader.html`): leaders scan a challenger's QR code (or type the name) and record the win.

All results live in `players.json` inside a GitHub gist (set in [`js/config.js`](js/config.js) under `gist`), so recording wins never commits to this repo. There is no database.

## League rules the site enforces

1. There are 6 gym badges: red, blue, green, black, purple and yellow. They can be won in any order.
2. With all 6 badges, a trainer can challenge the Elite Four, **in order** (#1, then #2, #3, #4). Wins carry over.
3. Beating all 4 Elite Four earns the **Championship Invitation**.

## How recording a win works

GitHub Pages can only serve files, so the leader page saves wins through the GitHub API:

1. After a battle, the challenger opens their **Dashboard**, taps **Challenge Code**, and shows the QR code.
2. The leader scans it, either with the **Scan QR** button on the leader page or with the phone's camera app. The leader page opens with the challenger's name filled in.
3. The leader taps **Record win**. The page saves the win to `players.json` in the gist.
4. Dashboards and the leaderboard read the newest version of the gist, so the win shows up the next time they refresh (when the trainer closes their Challenge Code, or within a minute).

If two leaders save at the same moment, the leader page notices from the gist's history and re-applies its win on top of the other one, so no win is lost.

## Organizer setup (one time)

1. **Create a token.** On GitHub go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Public repositories** (read-only). The token doesn't need any repository.
   - Permissions → Account permissions → **Gists: Read and write** (leave everything else alone)
   - Already made the old token? Edit it instead: add **Gists: Read and write** and save. The leader links keep working. You can also remove its **Contents** permission, since the site no longer writes to the repo.
   - Pick an expiration date. You'll need to make a new token and new links when it expires.
2. Open `leader.html` on the live site, paste the token, choose **Organizer**, and tap **Save on this device**.
3. Open **Leader links** at the bottom of the page and copy each leader's private link. Send each one privately to that leader. Opening the link sets up their phone.

### Security notes

- The token is **never** stored in this repo. It only lives inside the leader links and on the leaders' devices.
- The Gists permission covers **every gist on your account**, not just the league one, so anyone with a leader link could edit your other gists too. Share the links only with leaders. If one leaks, delete the token on GitHub (all links stop working), make a new one, and send out new links.
- The organizer can undo a mistaken win from the leader page (**Remove this win**). Every save is also a gist revision, so older versions can be viewed under **Revisions** on the gist page.

## Leader details (Discord, rules, decks)

Tapping a gym badge or Elite Four member on the dashboard opens a pop-up with that leader's details. Edit them in [`data/leaders.json`](data/leaders.json). The easiest way is the pencil icon on GitHub, then **Commit changes**. The site updates in about a minute.

| Field | Who | What it does |
| --- | --- | --- |
| `discord` | everyone | Discord username (no `@`), used in the challenge message. Only shown on screen when there's no `discordId`, so trainers know who to message. |
| `discordId` | everyone | Numeric Discord user ID. With it, **Send challenge** copies the challenge message and opens the leader's Discord profile, where the trainer taps **Message** and pastes. Without it, the button only copies the message. |
| `rules` | gym leaders | Special rules: a list of lines, e.g. `["Best of 3", "No banned cards"]`. Use `[]` for none. |
| `deckName` | Elite Four | Name of their deck. |
| `decklistUrl` | Elite Four | Full link (starting with `https://`) for the **View decklist** button. |

To get a Discord user ID: in Discord open **User Settings → Advanced**, turn on **Developer Mode**, then right-click (desktop) or long-press (phone) the person and choose **Copy User ID**.

Discord doesn't let websites open a DM or pre-fill a message, so the button copies the message for the trainer to paste.

## Renaming leaders and badges

Edit [`js/config.js`](js/config.js). Change the `leader`, `badge` and `name` text freely, but **don't change the `id` values** once wins are recorded, because they're the keys in `players.json`.

## Running locally

The pages load data with `fetch`, so open them through a local web server rather than by double-clicking. Any static server works, for example:

```bash
npx serve .
```

## Data format

```json
{
  "players": [
    {
      "name": "Tai",
      "gyms": { "red": "2026-11-07T19:30:00.000Z" },
      "elite4": { "e4-1": "2026-11-14T20:00:00.000Z" }
    }
  ]
}
```

Each value is the date and time the win was recorded. Names are matched without regard to capitalization.

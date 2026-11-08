# Digimon League Website

Badge tracker for the Digimon League, hosted on GitHub Pages.

- **My card** (`index.html`): asks for your trainer name on first visit and remembers it. Shows your 6 gym badges, your Elite Four progress, your Championship Invitation, and a QR code for leaders to scan.
- **Leaderboard** (`leaderboard.html`): every trainer and their badges.
- **Leader tools** (`leader.html`): leaders scan a challenger's QR code (or type the name) and record the win.

All results live in [`data/players.json`](data/players.json). There is no database.

## League rules the site enforces

1. There are 6 gym badges: red, blue, green, black, purple and yellow. They can be won in any order.
2. With all 6 badges, a trainer can challenge the Elite Four, **in order** (#1, then #2, #3, #4). Wins carry over.
3. Beating all 4 Elite Four earns the **Championship Invitation**.

## How recording a win works

GitHub Pages can only serve files, so the leader page saves wins through the GitHub API:

1. After a battle, the challenger opens **My card** and shows their QR code.
2. The leader scans it, either with the **Scan QR** button on the leader page or with the phone's camera app. The leader page opens with the challenger's name filled in.
3. The leader taps **Record win**. The page updates `data/players.json` in this repo (one commit per win).
4. GitHub Pages republishes, and the win shows on the card and leaderboard in about a minute.

## Organizer setup (one time)

1. **Create a token.** On GitHub go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories → Digimon-League-Website**
   - Permissions → Repository permissions → **Contents: Read and write** (leave everything else alone)
   - Pick an expiration date. You'll need to make a new token and new links when it expires.
2. Open `leader.html` on the live site, paste the token, choose **Organizer**, and tap **Save on this device**.
3. Open **Leader links** at the bottom of the page and copy each leader's private link. Send each one privately to that leader. Opening the link sets up their phone.

### Security notes

- The token is **never** stored in this repo. It only lives inside the leader links and on the leaders' devices.
- Anyone with a leader link can edit `players.json`, so share the links only with leaders. If one leaks, delete the token on GitHub (all links stop working), make a new one, and send out new links.
- The organizer can undo a mistaken win from the leader page (**Remove this win**). Every change is also a commit, so the history is in Git.

## Renaming leaders and badges

Edit [`js/config.js`](js/config.js). Change the `leader`, `badge` and `name` text freely, but **don't change the `id` values** once wins are recorded, because they're the keys in `players.json`.

## Running locally

The pages load `players.json` with `fetch`, so open them through a local web server rather than by double-clicking. Any static server works, for example:

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

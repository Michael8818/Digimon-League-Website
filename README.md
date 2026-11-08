# Digimon League Website

A static website for the Digimon League: standings, upcoming events and league info.
Plain HTML, CSS and JavaScript. There are no build tools or dependencies.

## Run it locally

Open `index.html` in your browser. To use a local server instead, run either of these:

```bash
python -m http.server 8000
```

```bash
npx serve .
```

Then visit http://localhost:8000 (or the URL `serve` prints).

## Project layout

```
index.html      Page markup
css/styles.css  Styles (light and dark mode)
js/main.js      Standings and events data, plus rendering
assets/         Images, icons and other static files
```

## Editing content

Standings and events live at the top of `js/main.js`. Edit those arrays to update the site.

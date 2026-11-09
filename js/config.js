// League configuration. Rename leaders and badges here; everything else reads from this file.
// Gym and Elite 4 ids are stored in players.json, so don't change an id once wins are recorded.
const LEAGUE = {
  title: "Digimon League",

  // Where players.json lives: a GitHub gist, so recording wins doesn't commit to this repo.
  // The id is the long code in the gist's address: gist.github.com/<owner>/<id>
  gist: {
    owner: "Michael8818",
    id: "91d4810deef98b7758a6e7d3aa245ae9",
    file: "players.json",
  },

  // The 6 gyms. Any order works; this is the order they're shown in.
  gyms: [
    { id: "red",    leader: "Red Gym Leader",    badge: "Red Badge",    color: "#e5484d" },
    { id: "blue",   leader: "Blue Gym Leader",   badge: "Blue Badge",   color: "#3b82f6" },
    { id: "green",  leader: "Green Gym Leader",  badge: "Green Badge",  color: "#22a55b" },
    { id: "black",  leader: "Black Gym Leader",  badge: "Black Badge",  color: "#2b2d33" },
    { id: "purple", leader: "Purple Gym Leader", badge: "Purple Badge", color: "#8e4ec6" },
    { id: "yellow", leader: "Yellow Gym Leader", badge: "Yellow Badge", color: "#f5b800" },
  ],

  // The Elite 4. With all gym badges, any member can be challenged except the last one,
  // which unlocks only after the others are beaten. Each crest gets grander by rank;
  // color sets its metal (bronze, silver, gold, diamond by default).
  elite4: [
    { id: "e4-1", name: "Elite Four #1", color: "#c0773a" },
    { id: "e4-2", name: "Elite Four #2", color: "#9eabbf" },
    { id: "e4-3", name: "Elite Four #3", color: "#e0a412" },
    { id: "e4-4", name: "Elite Four #4", color: "#3d8bff" },
  ],

  championship: { badge: "Championship Invitation" },
};

I want to make a typescript project for a chrome extension that, when you open dogflight.io, Tracks changes it makes to local storage that it puts on the browser while using it, and track where on the screen you do a left or right click while using dogflight.io. This will all be placed storage on the browser. Then, a screen should be available to view all the information the extension stores prettily.

The local storage that dogflight puts on the browser is persistent across browser session. One records all time stats (`stats`), another records stats from your last game only (`recentStats`). There is also `firstPlay` that tracks if it is your first play in this tab, and `dogflightName` that records the name you used. The extension should capture a copy both the all time stats and maintain a database of all recentStats captured when each game closes. These will be attached to other metrics attached to each game which will be calculated from tracking when certain data is updated in recentStats and from the mouse clicking information.

The first thing I want to do is to have the tracking tools built for chrome and have the ability to test it on chromium. Here is the structure of `stats` and `recentStats`:

```
{
    "shots": 1088,
    "hits": 599,
    "damage": 120409,
    "kills": 41,
    "bombers": 5,
    "scouts": 2,
    "score": 210261,
    "points": 100,
    "pointsAgainst": 0,
    "time": 905.2000000001373,
    "timeSaved": 301,
    "bonus": 111635,
    "games": 1,
    "deaths": 6,
    "weeklyHighScore": 2,
    "monthlyHighScore": 24,
    "allTimeHighScore": 99
}
```

For dev tests, lets store the raw data in JSON on machine filesystem.

To know when the player joins a game, the easiest thing is to take advantage either of the console statement `Connected to DogFlight room` that is printed,or to use network activity, but I do not know what to identify for that. I don't know what to do for game ending, but for now I will force myself to disconnect, on which time the console prints `Disconnected`.

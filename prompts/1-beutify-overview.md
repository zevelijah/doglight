Like the clicks, lets make the overview a dropdown reveal hidden by default.

However, for this are going to now make the game stats pretty in the full view. Instead of having number of games played, list timestamps of session start and end based that are the actual datetimes taken.
Here is my basic text based scheme:

```
Start Time: []
End Time: []
Length: [`recentStats.time`]
Time Saved: [`recentStats.timeSaved`]

Your Team's Points: [`recentStats.points`]
Opponent's Points: [`recentStats.pointsAgainst`]
Result: [`points == 100: Won, pointsAgainst == 100: Lost, else: Disconnected`]

Shots: [`recentStats.shots`]
Hits: [`recentStats.hits`]
Precision: [`recentStats.hits / recentStats.shots`]

Damage: [`recentStats.damage`]
Damage per shot: [`recentStats.damage / recentStats.shots`]

Bomber Kills: [`recentStats.bombers`]
Scout Kills: [`recentStats.scouts`]

Player Kills: [`recentStats.kills`]
Player Deaths: [`recentStats.deaths`]
Kills - Deaths: [`recentStats.kills - recentStats.deaths`]

Total Score: [`recentStats.score`]
Bonus: [`recentStats.bonus`]
```

If the rankings for each time period are not -1, but them at the top of the card not in a dropdown, horizontally seperated with three spaces between each rank type hit. To the left of that separted by five spaces, place the time as time: [start time]

For the `stats` item, instead of putting it in each game, put it it at the top, as it is the overall in a dropdown. The current rankings shall also be above it un hidden, and five space space to its left shall be the total number of games played. Five spaces to the right of the rankings shall be the best ranking in each category achieved. Only when a ranking from the a or `stats` exceed one of those values, update these to be that value, and it never goes down.

Remove game history from the pop-up.

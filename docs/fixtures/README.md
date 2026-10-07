# App verification fixtures

These are synthetic recordings and a synthetic treadmill screen created by `scripts/create-fixtures.mjs`. They contain no personal activity history or third-party activity files.

- `ride.fit`: one cycling session, 59 minutes moving, 24 km, average heart rate 132 bpm, average power 165 W.
- `run.tcx`: one running session, 30 minutes, 5 km.
- `trail.gpx`: one timed trail track, 10 minutes, distance calculated from its points.
- `workout-screen.png`: a treadmill summary showing 50 minutes, 6.20 miles, and 138 bpm. The review flow deliberately corrects its distance before confirmation.
- `watch-screen.png`: a second view of that workout, showing its corrected 5-mile distance. Used to check multi-photo grouping.
- `pace-screen.png`: a treadmill summary with a separately reported 8:30 min/mile average pace. Used to check that pace extraction and distance corrections stay independent.
- `photo-match.tcx`: the same 50-minute, 5-mile run with a start time eight minutes later. Used to check file/photo duplicate matching.

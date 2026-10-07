// Synthetic activity recordings owned by this project, for app-level checks.
import { mkdirSync, writeFileSync } from "node:fs";
import { FitEncoder, FitBaseType } from "fit-file-parser/encoder";
import { Resvg } from "@resvg/resvg-js";
const folder = "docs/fixtures";
mkdirSync(folder, { recursive: true });
const field = (number, baseType, size, value) => ({
  number,
  baseType,
  size,
  value,
});
const fit = new FitEncoder();
const start = new Date("2026-10-03T15:00:00Z");
fit.writeMessage(0, [
  field(0, FitBaseType.Enum, 1, 4),
  field(1, FitBaseType.Uint16, 2, 255),
  field(4, FitBaseType.Uint32, 4, FitEncoder.toFitTimestamp(start)),
]);
fit.writeMessage(18, [
  field(
    253,
    FitBaseType.Uint32,
    4,
    FitEncoder.toFitTimestamp(new Date(start.valueOf() + 3600000)),
  ),
  field(2, FitBaseType.Uint32, 4, FitEncoder.toFitTimestamp(start)),
  field(5, FitBaseType.Enum, 1, 2),
  field(7, FitBaseType.Uint32, 4, 3600000),
  field(8, FitBaseType.Uint32, 4, 3540000),
  field(9, FitBaseType.Uint32, 4, 2400000),
  field(16, FitBaseType.Uint8, 1, 132),
  field(17, FitBaseType.Uint8, 1, 155),
  field(20, FitBaseType.Uint16, 2, 165),
  field(21, FitBaseType.Uint16, 2, 320),
  field(22, FitBaseType.Uint16, 2, 180),
  field(34, FitBaseType.Uint16, 2, 186),
]);
writeFileSync(`${folder}/ride.fit`, fit.close());
writeFileSync(
  `${folder}/run.tcx`,
  `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2026-10-02T15:00:00Z</Id><Lap StartTime="2026-10-02T15:00:00Z"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters><AverageHeartRateBpm><Value>130</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>149</Value></MaximumHeartRateBpm><Track><Trackpoint><Time>2026-10-02T15:00:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>125</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>2026-10-02T15:30:00Z</Time><DistanceMeters>5000</DistanceMeters><HeartRateBpm><Value>135</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`,
);
writeFileSync(
  `${folder}/trail.gpx`,
  `<?xml version="1.0"?><gpx version="1.1" creator="Be Better fixture" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Park trail fixture</name><type>trail</type><trkseg><trkpt lat="41.88" lon="-87.62"><ele>180</ele><time>2026-10-01T15:00:00Z</time></trkpt><trkpt lat="41.89" lon="-87.62"><ele>195</ele><time>2026-10-01T15:05:00Z</time></trkpt><trkpt lat="41.90" lon="-87.62"><ele>200</ele><time>2026-10-01T15:10:00Z</time></trkpt></trkseg></trk></gpx>`,
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1150"><rect width="900" height="1150" rx="50" fill="#171d24"/><g fill="#f5f7fa" font-family="Arial,sans-serif"><text x="70" y="115" font-size="48" font-weight="bold">TREADMILL RUN</text><text x="70" y="195" font-size="32">October 5, 2026 · 8:00 AM CDT</text><text x="70" y="350" font-size="30" fill="#9faec0">DURATION</text><text x="70" y="455" font-size="100">00:50:00</text><text x="70" y="605" font-size="30" fill="#9faec0">DISTANCE</text><text x="70" y="710" font-size="100">6.20 miles</text><text x="70" y="850" font-size="30" fill="#9faec0">AVERAGE HEART RATE</text><text x="70" y="950" font-size="90">138 bpm</text><text x="70" y="1070" font-size="28" fill="#9faec0">Synthetic workout screen · verification fixture</text></g></svg>`;
writeFileSync(`${folder}/workout-screen.png`, new Resvg(svg).render().asPng());
const watch = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760"><rect width="600" height="760" rx="60" fill="#172520"/><g fill="#f5f7fa" font-family="Arial,sans-serif"><text x="45" y="90" font-size="34">RUN SUMMARY</text><text x="45" y="145" font-size="22">October 5, 2026 · 8:00 AM CDT</text><text x="45" y="260" font-size="70">50:00</text><text x="45" y="305" font-size="24">Duration</text><text x="45" y="430" font-size="70">5.00 mi</text><text x="45" y="475" font-size="24">Corrected distance</text><text x="45" y="590" font-size="58">138 bpm</text><text x="45" y="635" font-size="24">Average heart rate</text><text x="45" y="710" font-size="18">Synthetic second view · verification fixture</text></g></svg>`;
writeFileSync(`${folder}/watch-screen.png`, new Resvg(watch).render().asPng());
const pace = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="900"><rect width="800" height="900" rx="40" fill="#172520"/><g fill="#f5f7fa" font-family="Arial,sans-serif"><text x="45" y="90" font-size="40">TREADMILL RUN</text><text x="45" y="150" font-size="28">October 5, 2026 · 8:00 AM CDT</text><text x="45" y="270" font-size="70">50:00</text><text x="45" y="320" font-size="26">Duration</text><text x="45" y="430" font-size="70">6.20 miles</text><text x="45" y="480" font-size="26">Machine distance</text><text x="45" y="595" font-size="70">8:30 min/mile</text><text x="45" y="645" font-size="26">Average pace</text><text x="45" y="750" font-size="58">138 bpm</text><text x="45" y="795" font-size="26">Average heart rate</text><text x="45" y="865" font-size="20">Synthetic pace screen · verification fixture</text></g></svg>`;
writeFileSync(`${folder}/pace-screen.png`, new Resvg(pace).render().asPng());
writeFileSync(
  `${folder}/photo-match.tcx`,
  `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2026-10-05T13:08:00Z</Id><Lap StartTime="2026-10-05T13:08:00Z"><TotalTimeSeconds>3000</TotalTimeSeconds><DistanceMeters>8046.72</DistanceMeters><AverageHeartRateBpm><Value>130</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>149</Value></MaximumHeartRateBpm><Track><Trackpoint><Time>2026-10-05T13:08:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>125</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>2026-10-05T13:58:00Z</Time><DistanceMeters>8046.72</DistanceMeters><HeartRateBpm><Value>135</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`,
);
console.log("Created synthetic FIT, TCX, GPX, and three photo fixtures.");

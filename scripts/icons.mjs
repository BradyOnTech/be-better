import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync("apps/web/public/icon.svg", "utf8");
for (const [name, width] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(
    `apps/web/public/${name}`,
    new Resvg(source, { fitTo: { mode: "width", value: width } })
      .render()
      .asPng(),
  );
}

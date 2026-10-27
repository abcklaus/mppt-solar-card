// Baut dist/mppt-solar-card.js: setzt Version und das Produktbild (base64) ein.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const image = readFileSync("images/mppt-controller.webp").toString("base64");
const src = readFileSync("src/mppt-solar-card.js", "utf8")
  .replace("__VERSION__", pkg.version)
  .replace("__IMAGE__", `data:image/webp;base64,${image}`);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/mppt-solar-card.js", src);
console.log(`dist/mppt-solar-card.js (${(src.length / 1024).toFixed(1)} KB)`);

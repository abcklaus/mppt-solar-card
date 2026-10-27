// Baut dist/mppt-solar-card.js und setzt die Version aus package.json ein.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const src = readFileSync("src/mppt-solar-card.js", "utf8").replace("__VERSION__", pkg.version);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/mppt-solar-card.js", src);
console.log(`dist/mppt-solar-card.js (${(src.length / 1024).toFixed(1)} KB)`);

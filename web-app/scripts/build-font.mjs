/**
 * Regenera src/lib/fonts/roboto.ts: baja Roboto, la subsetea y la emite como VFS de jsPDF.
 *
 * Solo hace falta correrlo si cambia el conjunto de caracteres del informe. La salida está
 * commiteada, así que un `npm ci` no depende de la red ni de fontTools.
 *
 *   node scripts/build-font.mjs
 *
 * Requiere Python con fontTools:  pip install fonttools
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FUENTES = {
  robotoRegularBase64: "https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted/Roboto-Regular.ttf",
  robotoBoldBase64: "https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted/Roboto-Bold.ttf",
};

// Latin-1 + Latin Extended-A + la puntuación tipográfica y los símbolos que usa el informe.
// Subsetear baja cada variante de ~515 KB a ~20 KB: en un celular de campo eso importa.
const UNICODES = [
  "U+0020-00FF", "U+0100-017F",
  "U+2013", "U+2014", "U+2018", "U+2019", "U+201C", "U+201D", "U+2022", "U+00B7",
  "U+20AC", "U+00B0", "U+00B1", "U+2264", "U+2265", "U+00D7", "U+2192", "U+2713", "U+2717",
  "U+00BF", "U+00A1",
].join(",");

const tmp = mkdtempSync(join(tmpdir(), "roboto-"));
const partes = [];

for (const [nombre, url] of Object.entries(FUENTES)) {
  const crudo = join(tmp, `${nombre}.ttf`);
  const sub = join(tmp, `${nombre}-sub.ttf`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo bajar ${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.readUInt32BE(0) !== 0x00010000 && bytes.subarray(0, 4).toString() !== "OTTO") {
    throw new Error(`${url} no devolvió un TTF (¿una página de error?)`);
  }
  writeFileSync(crudo, bytes);

  execFileSync("python", [
    "-m", "fontTools.subset", crudo,
    `--unicodes=${UNICODES}`, `--output-file=${sub}`,
    "--no-hinting", "--desubroutinize", "--layout-features=",
  ], { stdio: "inherit" });

  const b64 = readFileSync(sub).toString("base64");
  const trozos = (b64.match(/.{1,110}/g) ?? []).map((t) => `'${t}'`).join(" +\n  ");
  partes.push(`export const ${nombre} =\n  ${trozos};`);
  console.log(`${nombre}: ${(readFileSync(sub).length / 1024).toFixed(1)} KB`);
}

const salida = `// Roboto subseteada a Latin-1 + Latin Extended-A + puntuacion tipografica.
// GENERADO por scripts/build-font.mjs -- no editar a mano.
// Roboto (c) Google, licencia Apache 2.0 -- ver LICENSE.txt en esta carpeta.
//
// Las fuentes internas de jsPDF son Latin-1 y rompen los acentos del castellano
// (skill spa-sharepoint-power-automate, seccion 5). Por eso va embebida.

${partes.join("\n\n")}
`;

writeFileSync(new URL("../src/lib/fonts/roboto.ts", import.meta.url), salida, "utf8");
console.log("Escrito src/lib/fonts/roboto.ts");

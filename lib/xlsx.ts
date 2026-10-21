// Génère un fichier Excel (.xlsx) sans bibliothèque externe.
// Un classeur = un ensemble de feuilles ; chaque feuille a une ligne d'en-tête figée.
// Le format est celui d'Office Open XML : une archive ZIP de fichiers XML.

export type Feuille = {
  nom: string;
  entetes: string[];
  lignes: unknown[][];
};

const encoder = new TextEncoder();

// ---- CRC-32 (exigé par le format ZIP) ----
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE_CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- ZIP sans compression (méthode 0), valide pour Excel ----
function zip(fichiers: { nom: string; contenu: Uint8Array }[]): Uint8Array {
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let decalage = 0;
  const DATE_1980 = 0x0021; // 1er janvier 1980
  const DRAPEAU_UTF8 = 0x0800;

  for (const f of fichiers) {
    const nom = encoder.encode(f.nom);
    const crc = crc32(f.contenu);
    const taille = f.contenu.length;

    const entete = new DataView(new ArrayBuffer(30));
    entete.setUint32(0, 0x04034b50, true);
    entete.setUint16(4, 20, true);
    entete.setUint16(6, DRAPEAU_UTF8, true);
    entete.setUint16(8, 0, true);
    entete.setUint16(10, 0, true);
    entete.setUint16(12, DATE_1980, true);
    entete.setUint32(14, crc, true);
    entete.setUint32(18, taille, true);
    entete.setUint32(22, taille, true);
    entete.setUint16(26, nom.length, true);
    entete.setUint16(28, 0, true);
    locaux.push(new Uint8Array(entete.buffer), nom, f.contenu);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, DRAPEAU_UTF8, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, DATE_1980, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, taille, true);
    central.setUint32(24, taille, true);
    central.setUint16(28, nom.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, decalage, true);
    centraux.push(new Uint8Array(central.buffer), nom);

    decalage += 30 + nom.length + taille;
  }

  const tailleCentral = centraux.reduce((s, b) => s + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(4, 0, true);
  fin.setUint16(6, 0, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, decalage, true);
  fin.setUint16(20, 0, true);

  const morceaux = [...locaux, ...centraux, new Uint8Array(fin.buffer)];
  const total = morceaux.reduce((s, b) => s + b.length, 0);
  const sortie = new Uint8Array(total);
  let pos = 0;
  for (const b of morceaux) {
    sortie.set(b, pos);
    pos += b.length;
  }
  return sortie;
}

// ---- XML ----
const echappe = (texte: string) =>
  texte
    // caractères interdits en XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colonne(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellule(valeur: unknown, ref: string, style: number): string {
  if (valeur === null || valeur === undefined || valeur === "") return "";
  const s = style ? ` s="${style}"` : "";
  if (typeof valeur === "number" && Number.isFinite(valeur)) return `<c r="${ref}"${s}><v>${valeur}</v></c>`;
  if (typeof valeur === "boolean") return `<c r="${ref}" t="b"${s}><v>${valeur ? 1 : 0}</v></c>`;
  const texte = echappe(String(valeur));
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${texte}</t></is></c>`;
}

function feuilleXml(f: Feuille): string {
  const largeurs = f.entetes.map((e, i) => {
    const max = Math.max(String(e).length, ...f.lignes.map((l) => String(l[i] ?? "").length));
    return Math.min(Math.max(max + 2, 10), 60);
  });
  const cols = largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const entete = `<row r="1">${f.entetes.map((e, i) => cellule(e, `${colonne(i)}1`, 1)).join("")}</row>`;
  const corps = f.lignes
    .map((l, r) => `<row r="${r + 2}">${f.entetes.map((_, i) => cellule(l[i], `${colonne(i)}${r + 2}`, 0)).join("")}</row>`)
    .join("");
  const dimension = `A1:${colonne(Math.max(f.entetes.length - 1, 0))}${Math.max(f.lignes.length + 1, 1)}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${entete}${corps}</sheetData>` +
    `</worksheet>`
  );
}

// Les noms de feuille : 31 caractères au plus, sans []:*?/\ et uniques.
function nomsFeuilles(feuilles: Feuille[]): string[] {
  const vus = new Set<string>();
  return feuilles.map((f, i) => {
    let nom = f.nom.replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || `Feuille ${i + 1}`;
    let base = nom;
    let n = 2;
    while (vus.has(nom.toLowerCase())) nom = `${base.slice(0, 28)} ${n++}`;
    vus.add(nom.toLowerCase());
    return nom;
  });
}

export function genererXlsx(feuilles: Feuille[]): Uint8Array {
  const noms = nomsFeuilles(feuilles.length ? feuilles : [{ nom: "Vide", entetes: [], lignes: [] }]);
  const liste = feuilles.length ? feuilles : [{ nom: "Vide", entetes: [], lignes: [] }];

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    liste.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `</Types>`;

  const racine =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const classeur =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${noms.map((n, i) => `<sheet name="${echappe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    `</workbook>`;

  const relations =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    liste.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${liste.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  // Styles : 0 = normal, 1 = en-tête en gras sur fond gris
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFE8ECEB"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const fichiers: { nom: string; contenu: Uint8Array }[] = [
    { nom: "[Content_Types].xml", contenu: encoder.encode(contentTypes) },
    { nom: "_rels/.rels", contenu: encoder.encode(racine) },
    { nom: "xl/workbook.xml", contenu: encoder.encode(classeur) },
    { nom: "xl/_rels/workbook.xml.rels", contenu: encoder.encode(relations) },
    { nom: "xl/styles.xml", contenu: encoder.encode(styles) },
    ...liste.map((f, i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: encoder.encode(feuilleXml(f)) })),
  ];
  return zip(fichiers);
}

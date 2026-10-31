// Téléphones clients, avec indicatif pays.
// Forme enregistrée : « +CC NUMERO », ex. « +225 0700000000 » ou « +33 612345678 ».
export const INDICATIF_DEFAUT = "225";

export const INDICATIFS: { code: string; pays: string }[] = [
  { code: "225", pays: "Côte d'Ivoire" },
  { code: "233", pays: "Ghana" },
  { code: "221", pays: "Sénégal" },
  { code: "223", pays: "Mali" },
  { code: "226", pays: "Burkina Faso" },
  { code: "224", pays: "Guinée" },
  { code: "228", pays: "Togo" },
  { code: "229", pays: "Bénin" },
  { code: "234", pays: "Nigeria" },
  { code: "237", pays: "Cameroun" },
  { code: "212", pays: "Maroc" },
  { code: "33", pays: "France" },
  { code: "32", pays: "Belgique" },
  { code: "41", pays: "Suisse" },
  { code: "44", pays: "Royaume-Uni" },
  { code: "49", pays: "Allemagne" },
  { code: "90", pays: "Turquie" },
  { code: "86", pays: "Chine" },
  { code: "971", pays: "Émirats arabes unis" },
  { code: "1", pays: "États-Unis / Canada" },
];

export const MESSAGE_TELEPHONE = "Numéro incomplet pour cet indicatif. Vérifiez les chiffres (Côte d'Ivoire : 10 chiffres).";

// Sépare l'indicatif du numéro. Si le numéro commence par + ou 00, son indicatif l'emporte sur celui du formulaire.
export function decouperTelephone(brut: string, indicatifChoisi: string = INDICATIF_DEFAUT): { code: string; national: string } | null {
  const texte = brut.trim();
  let code = indicatifChoisi;
  let chiffres = texte.replace(/\D/g, "");
  if (texte.startsWith("+") || texte.startsWith("00")) {
    const corps = texte.startsWith("+") ? chiffres : chiffres.slice(2);
    const trouve = [...INDICATIFS].sort((a, b) => b.code.length - a.code.length).find((i) => corps.startsWith(i.code));
    if (!trouve) return null;
    code = trouve.code;
    chiffres = corps.slice(trouve.code.length);
  }
  // Le 0 de tête (« 06… » en France) n'est pas repris après l'indicatif.
  if (code !== "225" && chiffres.startsWith("0")) chiffres = chiffres.slice(1);
  const valide = code === "225" ? chiffres.length === 10 : chiffres.length >= 6 && chiffres.length <= 12;
  return valide ? { code, national: chiffres } : null;
}

// Vrai si le champ ne contient aucun numéro (vide, ou seulement un indicatif).
export function telephoneVide(brut: string): boolean {
  const chiffres = brut.replace(/\D/g, "");
  return chiffres === "" || INDICATIFS.some((i) => chiffres === i.code);
}

export function normaliserTelephone(brut: string, indicatifChoisi: string = INDICATIF_DEFAUT): string | null {
  const r = decouperTelephone(brut, indicatifChoisi);
  return r ? `+${r.code} ${r.national}` : null;
}

// Formes sous lesquelles un même numéro peut déjà être enregistré (anciens formats compris).
export function variantesTelephone(enregistre: string): string[] {
  const forme = enregistre.trim();
  const sansIndicatif = forme.replace(/^\+\d+\s*/, "");
  return [forme, sansIndicatif].filter((v, i, t) => v && t.indexOf(v) === i);
}

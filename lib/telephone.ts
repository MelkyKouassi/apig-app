// Numéro de téléphone ivoirien : 10 chiffres, précédés de l'indicatif +225.
// Enregistré sous la forme « +225 0700000000 ».
// Accepte les espaces, tirets et points, ainsi que 00225 ou 225 (fréquents dans un répertoire).
export const INDICATIF = "+225 ";

export const MESSAGE_TELEPHONE = "Le numéro doit comporter 10 chiffres après +225 (ex. +225 07 00 00 00 00).";

// Chiffres du numéro, sans l'indicatif.
function dixChiffres(brut: string): string | null {
  let chiffres = brut.replace(/\D/g, "");
  if (chiffres.startsWith("00225")) chiffres = chiffres.slice(5);
  else if (chiffres.startsWith("225") && chiffres.length === 13) chiffres = chiffres.slice(3);
  return chiffres.length === 10 ? chiffres : null;
}

// Vrai si le champ ne contient aucun numéro (vide, ou seulement l'indicatif).
export function telephoneVide(brut: string): boolean {
  const chiffres = brut.replace(/\D/g, "");
  return chiffres === "" || chiffres === "225" || chiffres === "00225";
}

// Forme enregistrée : « +225 0700000000 ». Renvoie null si le numéro est incomplet.
export function normaliserTelephone(brut: string): string | null {
  const dix = dixChiffres(brut);
  return dix ? `+225 ${dix}` : null;
}

// Formes sous lesquelles un même numéro peut déjà être enregistré (ancien format compris).
export function variantesTelephone(enregistre: string): string[] {
  const dix = enregistre.replace(/\D/g, "").slice(-10);
  return [`+225 ${dix}`, dix];
}

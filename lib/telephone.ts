// Numéro de téléphone ivoirien : 10 chiffres (ex. 0700000000).
// Accepte les espaces, tirets et points, ainsi que l'indicatif +225 ou 00225 (fréquent dans un répertoire).
// Renvoie null si le numéro ne peut pas être ramené à 10 chiffres.
export function normaliserTelephone(brut: string): string | null {
  let chiffres = brut.replace(/\D/g, "");
  if (chiffres.startsWith("00225")) chiffres = chiffres.slice(5);
  else if (chiffres.startsWith("225") && chiffres.length === 13) chiffres = chiffres.slice(3);
  return chiffres.length === 10 ? chiffres : null;
}

export const MESSAGE_TELEPHONE = "Le numéro doit comporter 10 chiffres (ex. 07 00 00 00 00).";

// Répertoire du téléphone (API « Contact Picker »). Disponible surtout sur Android avec Chrome, en https.
// Ailleurs (iPhone, ordinateur), le bouton n'est pas affiché : la saisie reste manuelle.
type ContactsManager = { select: (proprietes: string[], options: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };

export function repertoireDisponible(): boolean {
  return typeof navigator !== "undefined" && "contacts" in navigator && typeof window !== "undefined" && "ContactsManager" in window;
}

// Ouvre le répertoire, laisse choisir un contact, et renvoie son nom et tous ses numéros (sans doublon).
// Renvoie null si l'utilisateur annule ou si l'accès est refusé.
export async function choisirContact(): Promise<{ nom: string; telephones: string[] } | null> {
  try {
    const contacts = (navigator as Navigator & { contacts: ContactsManager }).contacts;
    const liste = await contacts.select(["name", "tel"], { multiple: false });
    const contact = liste[0];
    if (!contact) return null;
    const telephones = [...new Set((contact.tel ?? []).map((t) => t.trim()).filter((t) => t !== ""))];
    return { nom: contact.name?.[0] ?? "", telephones };
  } catch {
    return null;
  }
}

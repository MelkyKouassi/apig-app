// Dates au format français : jour/mois/année (cahier, section 8).
// Les dates sont stockées en AAAA-MM-JJ ; on ne les affiche jamais telles quelles.

// "2026-10-21" → "21/10/2026". Renvoie `repli` si la date est absente ou illisible.
export function dateFr(iso: string | null | undefined, repli = "—"): string {
  if (!iso) return repli;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Date et heure d'un horodatage, à l'heure d'Abidjan : "21/10/2026 23:30".
export function dateHeureFr(horodatage: string | null | undefined, repli = "—"): string {
  if (!horodatage) return repli;
  const d = new Date(horodatage);
  if (Number.isNaN(d.getTime())) return repli;
  return d.toLocaleString("fr-FR", {
    timeZone: "Africa/Abidjan",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

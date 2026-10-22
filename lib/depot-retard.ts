// Dépôt-vente : date de la plus ancienne remise encore impayée (règle R13 étendue, décision du 22/10/2026).
// Les règlements remboursent les remises les plus anciennes d'abord.
export function plusAncienneRemiseImpayee(remises: { date: string; montant: number }[], recu: number): string | null {
  const triees = [...remises].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let cumul = 0;
  for (const r of triees) {
    cumul += r.montant;
    if (cumul > recu + 1) return r.date;
  }
  return null;
}

// Retard en jours : jours écoulés depuis la date − délai de paiement. null si pas de date.
export function retardJours(date: string | null, delai: number, aujourdhui: number): number | null {
  if (!date) return null;
  return Math.floor((aujourdhui - new Date(date + "T00:00:00Z").getTime()) / 86400000) - delai;
}

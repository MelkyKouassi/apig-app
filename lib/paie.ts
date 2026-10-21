// Calcul de paie et d'épargne (cahier, M9, règles R15 à R18). Calcul pur.

export type OptionsPaie = {
  taux_impot: number;          // 0,25
  reserve_legale_taux: number; // 0,10
  reserve_plafond_taux: number; // 0,20 du capital
  capital_social: number;      // 1 500 000
  reserve_deja_constituee: number;
  epargne_taux: number;        // 0,10
  part_distribuee: number;     // 0,50
  reintegrer_remunerations: boolean;
  deduire_dime: boolean;
  reporter_deficits: boolean;
};

export type MoisDonnees = {
  ca: number;
  depenses: number;
  remunerations: number;       // dépenses de catégorie rémunération et intéressement
  primes: number;              // primes des événements finis dans le mois
  dime: number;                // dîme du mois (somme par lieu)
  chargesFixes: number;        // montants réels ou habituels
  chargesNonFixes: number;     // montants réels
};

export type LignePaie = {
  mois: number;
  actif: boolean;
  resultatExploitation: number;
  resultatAvantImpot: number;
  impot: number;
  resultatNet: number;
  reserve: number;
  epargne: number;
  disponible: number;
  enveloppe: number;
};

export function calculerPaie(donnees: MoisDonnees[], o: OptionsPaie): LignePaie[] {
  // R15 : résultat d'exploitation. Un mois sans CA ni dépense n'est pas pris en compte.
  const base = donnees.map((m) => {
    const actif = m.ca !== 0 || m.depenses !== 0;
    const exploitation = actif
      ? m.ca - m.depenses + (o.reintegrer_remunerations ? m.remunerations : 0) - m.primes - (o.deduire_dime ? m.dime : 0)
      : 0;
    // R16 : résultat avant impôt, après charges fixes et non fixes.
    const avantImpot = actif ? exploitation - m.chargesFixes - m.chargesNonFixes : 0;
    return { actif, exploitation, avantImpot };
  });

  // R16 : impôt, réserve et épargne calculés sur le cumul depuis janvier, puis ventilés par mois.
  let cumulAvant = 0, cumulImpot = 0, cumulReserve = 0, cumulEpargne = 0;
  const plafondReserve = Math.max(0, o.reserve_plafond_taux * o.capital_social - o.reserve_deja_constituee);
  const lignes: LignePaie[] = base.map((b, i) => {
    cumulAvant += b.avantImpot;
    const impotCumul = o.taux_impot * Math.max(0, cumulAvant);
    const resultatNetCumul = cumulAvant - impotCumul;
    const reserveCumul = Math.min(o.reserve_legale_taux * Math.max(0, resultatNetCumul), plafondReserve);
    const epargneCumul = o.epargne_taux * Math.max(0, resultatNetCumul - reserveCumul);
    const impot = impotCumul - cumulImpot;
    const reserve = reserveCumul - cumulReserve;
    const epargne = epargneCumul - cumulEpargne;
    cumulImpot = impotCumul; cumulReserve = reserveCumul; cumulEpargne = epargneCumul;
    const resultatNet = b.avantImpot - impot;
    const disponible = resultatNet - reserve - epargne;
    return {
      mois: i + 1, actif: b.actif, resultatExploitation: b.exploitation, resultatAvantImpot: b.avantImpot,
      impot, resultatNet, reserve, epargne, disponible, enveloppe: 0,
    };
  });

  // R17 : enveloppe = 50 % du disponible. Avec report des mois déficitaires : 50 % du disponible cumulé,
  // moins les enveloppes déjà distribuées, jamais négatif.
  let cumulDisponible = 0, cumulEnveloppe = 0;
  for (const l of lignes) {
    if (!l.actif) continue;
    if (o.reporter_deficits) {
      cumulDisponible += l.disponible;
      l.enveloppe = Math.max(0, o.part_distribuee * cumulDisponible - cumulEnveloppe);
      cumulEnveloppe += l.enveloppe;
    } else {
      l.enveloppe = Math.max(0, o.part_distribuee * l.disponible);
    }
  }
  return lignes;
}

// R18 : part d'un collaborateur sur une enveloppe mensuelle.
export function partCollaborateur(enveloppe: number, parts: number, totalParts: number): number {
  return totalParts > 0 ? enveloppe * (parts / totalParts) : 0;
}

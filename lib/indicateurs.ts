// Calcul des indicateurs du tableau de bord (cahier, section 7 et règles R4, R5, R7).
// Période : dates incluses, au format AAAA-MM-JJ.

export type VenteI = { date_vente: string; montant: number | null; evenement_id: string };
export type DepenseI = { date_depense: string; montant: number | null; evenement_id: string };
export type EvenementI = { id: string; nom: string; est_point_de_vente: boolean; taux_dime: number };
export type PrimeI = { evenement_id: string; annee: number; mois: number | null; prime: number };

export type Resultats = {
  ca: number;
  depenses: number;
  benefice: number;
  primes: number;
  beneficeApresPrimes: number;
  dime: number;
  caEvenements: number;
  caPointDeVente: number;
  depensesEvenements: number;
  depensesPointDeVente: number;
  beneficeEvenements: number;
  beneficePointDeVente: number;
  dimeEvenements: number;
  dimePointDeVente: number;
  primesEvenements: number;
  primesPointDeVente: number;
};

export function calculerResultats(
  debut: string,
  fin: string,
  ventes: VenteI[],
  depenses: DepenseI[],
  evenements: EvenementI[],
  primes: PrimeI[],
): Resultats {
  const dansPeriode = (d: string) => d >= debut && d <= fin;
  const lieux = new Map(evenements.map((e) => [e.id, e]));

  // Par lieu : CA et dépenses sur la période.
  const parLieu = new Map<string, { ca: number; dep: number }>();
  const obtenir = (id: string) => {
    if (!parLieu.has(id)) parLieu.set(id, { ca: 0, dep: 0 });
    return parLieu.get(id)!;
  };
  for (const v of ventes) if (dansPeriode(v.date_vente)) obtenir(v.evenement_id).ca += Number(v.montant ?? 0);
  for (const d of depenses) if (dansPeriode(d.date_depense)) obtenir(d.evenement_id).dep += Number(d.montant ?? 0);

  // Primes rattachées au mois de fin (point de vente : année de chaque vente, approximée au 1er janvier).
  const primesPeriode = primes.filter((p) => {
    const date = p.mois ? `${p.annee}-${String(p.mois).padStart(2, "0")}-01` : `${p.annee}-01-01`;
    return dansPeriode(date);
  });

  const r: Resultats = {
    ca: 0, depenses: 0, benefice: 0, primes: 0, beneficeApresPrimes: 0, dime: 0,
    caEvenements: 0, caPointDeVente: 0, depensesEvenements: 0, depensesPointDeVente: 0,
    beneficeEvenements: 0, beneficePointDeVente: 0, dimeEvenements: 0, dimePointDeVente: 0,
    primesEvenements: 0, primesPointDeVente: 0,
  };

  for (const [id, t] of parLieu) {
    const lieu = lieux.get(id);
    const pdv = Boolean(lieu?.est_point_de_vente);
    const benefLieu = t.ca - t.dep;
    const dimeLieu = benefLieu * Number(lieu?.taux_dime ?? 0.1);
    r.ca += t.ca;
    r.depenses += t.dep;
    r.dime += dimeLieu;
    if (pdv) {
      r.caPointDeVente += t.ca;
      r.depensesPointDeVente += t.dep;
      r.beneficePointDeVente += benefLieu;
      r.dimePointDeVente += dimeLieu;
    } else {
      r.caEvenements += t.ca;
      r.depensesEvenements += t.dep;
      r.beneficeEvenements += benefLieu;
      r.dimeEvenements += dimeLieu;
    }
  }

  for (const p of primesPeriode) {
    const pdv = Boolean(lieux.get(p.evenement_id)?.est_point_de_vente);
    r.primes += Number(p.prime);
    if (pdv) r.primesPointDeVente += Number(p.prime);
    else r.primesEvenements += Number(p.prime);
  }

  r.benefice = r.ca - r.depenses;
  r.beneficeApresPrimes = r.benefice - r.primes;
  return r;
}

// Hors produits exclus (cahier, M11) : CA sans les ventes des produits exclus.
// Les dépenses restent intégralement prises en compte.
export type VenteProduitI = VenteI & { produit_id: string; quantite: number; prix_unitaire: number | null };

export function calculerHorsProduits(
  debut: string,
  fin: string,
  ventes: VenteProduitI[],
  depenses: DepenseI[],
  exclus: Set<string>,
) {
  const dansPeriode = (d: string) => d >= debut && d <= fin;
  let caTotal = 0;
  let caHors = 0;
  for (const v of ventes) {
    if (!dansPeriode(v.date_vente)) continue;
    const m = Number(v.montant ?? 0);
    caTotal += m;
    if (!exclus.has(v.produit_id)) caHors += m;
  }
  const dep = depenses
    .filter((d) => dansPeriode(d.date_depense))
    .reduce((s, d) => s + Number(d.montant ?? 0), 0);
  return { caTotal, caHors, depenses: dep, beneficeHors: caHors - dep };
}

// Analyse par produit sur une période : unités, CA, prix manquants et production.
// Production : comptée pour les événements dont la première vente tombe dans la période.
export type ProductionI = { evenement_id: string; produit_id: string; quantite_produite: number };

export function analyserProduits(
  debut: string,
  fin: string,
  ventes: VenteProduitI[],
  productions: ProductionI[],
  nomsProduits: Map<string, string>,
) {
  const dansPeriode = (d: string) => d >= debut && d <= fin;
  const premiereVente = new Map<string, string>();
  for (const v of ventes) {
    const p = premiereVente.get(v.evenement_id);
    if (!p || v.date_vente < p) premiereVente.set(v.evenement_id, v.date_vente);
  }
  const lignes = new Map<string, { nom: string; unites: number; ca: number; prixManquants: number; production: number }>();
  const obtenir = (id: string) => {
    if (!lignes.has(id)) lignes.set(id, { nom: nomsProduits.get(id) ?? "Produit", unites: 0, ca: 0, prixManquants: 0, production: 0 });
    return lignes.get(id)!;
  };
  for (const v of ventes) {
    if (!dansPeriode(v.date_vente)) continue;
    const l = obtenir(v.produit_id);
    l.unites += Number(v.quantite);
    l.ca += Number(v.montant ?? 0);
    if (!v.prix_unitaire || Number(v.prix_unitaire) <= 0) l.prixManquants += 1;
  }
  for (const p of productions) {
    const d = premiereVente.get(p.evenement_id);
    if (d && dansPeriode(d)) obtenir(p.produit_id).production += Number(p.quantite_produite);
  }
  return [...lignes.entries()]
    .map(([id, l]) => ({ id, ...l }))
    .sort((a, b) => a.unites - b.unites);
}

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

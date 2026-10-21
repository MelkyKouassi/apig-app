import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculerResultats, type DepenseI, type EvenementI, type PrimeI, type VenteI } from "@/lib/indicateurs";

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const evolution = (a: number, b: number) => {
  if (b === 0) return "—";
  const pct = ((a - b) / Math.abs(b)) * 100;
  return `${pct >= 0 ? "+" : ""}${Math.round(pct)} %`;
};

// Valeurs de référence du classeur v14 corrigé pour 2026 (cahier, section 9).
const REFERENCE_2026 = {
  ca: 3560000,
  depenses: 771200,
  benefice: 2788800,
  primes: 13100,
  dime: 278880,
  beneficeApresPrimes: 2775700,
};

type Params = { debutA?: string; finA?: string; debutB?: string; finB?: string };

export default function PageTableauDeBord(props: PageProps<"/tableau-de-bord">) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuTableauDeBord searchParams={props.searchParams as Promise<Params>} />
    </Suspense>
  );
}

async function ContenuTableauDeBord({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");

  const debutA = sp.debutA ?? "2026-01-01";
  const finA = sp.finA ?? "2026-12-31";
  const debutB = sp.debutB ?? "2025-01-01";
  const finB = sp.finB ?? "2025-12-31";

  const [{ data: ventes }, { data: depenses }, { data: evenements }, { data: primes }, { data: depots }, { data: reglementsDepot }, { data: creditsClients }, { data: reglementsCredit }, { data: stock }] = await Promise.all([
    supabase.from("ventes").select("date_vente, montant, evenement_id").eq("statut", "actif"),
    supabase.from("depenses").select("date_depense, montant, evenement_id").eq("statut", "actif"),
    supabase.from("evenements").select("id, nom, est_point_de_vente, taux_dime"),
    supabase.from("v_primes").select("evenement_id, annee, mois, prime"),
    supabase.from("v_depots_lignes").select("montant_du"),
    supabase.from("reglements").select("montant").eq("origine", "depot").eq("statut", "actif"),
    supabase.from("ventes").select("montant").eq("mode_paiement", "credit").eq("statut", "actif"),
    supabase.from("reglements").select("montant").eq("origine", "credit").eq("statut", "actif"),
    supabase.from("v_stock").select("stock_restant"),
  ]);

  const evts = (evenements ?? []) as EvenementI[];
  const ventesI = (ventes ?? []) as VenteI[];
  const depensesI = (depenses ?? []) as DepenseI[];
  const primesI = (primes ?? []) as PrimeI[];

  const A = calculerResultats(debutA, finA, ventesI, depensesI, evts, primesI);
  const B = calculerResultats(debutB, finB, ventesI, depensesI, evts, primesI);

  // Encaissements et créances : état à aujourd'hui (non filtré par période).
  const somme = (lignes: { montant: number | null }[] | null) =>
    (lignes ?? []).reduce((s, l) => s + Number(l.montant ?? 0), 0);
  const creditClientsDu = somme(creditsClients);
  const creditClientsRecu = somme(reglementsCredit);
  const creditClientsReste = creditClientsDu - creditClientsRecu;
  const depotDu = ((depots ?? []) as { montant_du: number | null }[]).reduce((s, l) => s + Number(l.montant_du ?? 0), 0);
  const depotRecu = somme(reglementsDepot);
  const depotReste = depotDu - depotRecu;
  const creancesTotales = creditClientsReste + depotReste;
  const stockRestant = ((stock ?? []) as { stock_restant: number }[]).reduce((s, l) => s + Number(l.stock_restant), 0);

  const estReference = debutA === "2026-01-01" && finA === "2026-12-31";
  const ecarts = estReference
    ? [
        ["CA", A.ca, REFERENCE_2026.ca],
        ["Dépenses", A.depenses, REFERENCE_2026.depenses],
        ["Bénéfice net", A.benefice, REFERENCE_2026.benefice],
        ["Primes", A.primes, REFERENCE_2026.primes],
        ["Dîme", A.dime, REFERENCE_2026.dime],
        ["Bénéfice après primes", A.beneficeApresPrimes, REFERENCE_2026.beneficeApresPrimes],
      ] as const
    : null;

  const indicateurs: [string, number, number][] = [
    ["CA", A.ca, B.ca],
    ["Dépenses", A.depenses, B.depenses],
    ["Bénéfice net", A.benefice, B.benefice],
    ["Primes", A.primes, B.primes],
    ["Bénéfice après primes", A.beneficeApresPrimes, B.beneficeApresPrimes],
    ["Dîme", A.dime, B.dime],
  ];

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Tableau de bord</h1>

      <form method="get" className="formulaire">
        <fieldset>
          <legend>Période A</legend>
          <input name="debutA" type="date" defaultValue={debutA} required />
          <input name="finA" type="date" defaultValue={finA} required />
        </fieldset>
        <fieldset>
          <legend>Période B (comparaison)</legend>
          <input name="debutB" type="date" defaultValue={debutB} required />
          <input name="finB" type="date" defaultValue={finB} required />
        </fieldset>
        <button type="submit" className="secondaire">Afficher</button>
      </form>

      <section className="carte-vente">
        <p className="entete"><strong>Indicateurs</strong></p>
        {indicateurs.map(([libelle, a, b]) => (
          <p key={libelle} className="note">
            {libelle} : <strong>{francs(a)}</strong> · période B {francs(b)} · évolution {evolution(a, b)}
          </p>
        ))}
        <p className="note">Créances à recouvrer : <strong>{francs(creancesTotales)}</strong> · Stock restant des événements : {Math.round(stockRestant * 10) / 10} (état à aujourd&apos;hui)</p>
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Résultats par origine (période A)</strong></p>
        <p className="note">Événements : CA {francs(A.caEvenements)} · dépenses {francs(A.depensesEvenements)} · bénéfice {francs(A.beneficeEvenements)} · dîme {francs(A.dimeEvenements)} · primes {francs(A.primesEvenements)}</p>
        <p className="note">Point de vente : CA {francs(A.caPointDeVente)} · dépenses {francs(A.depensesPointDeVente)} · bénéfice {francs(A.beneficePointDeVente)} · dîme {francs(A.dimePointDeVente)} · primes {francs(A.primesPointDeVente)}</p>
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Encaissements et créances (à aujourd&apos;hui)</strong></p>
        <p className="note">Ventes à crédit clients : dû {francs(creditClientsDu)} · reçu {francs(creditClientsRecu)} · reste {francs(creditClientsReste)}</p>
        <p className="note">Dépôt-vente : dû {francs(depotDu)} · reçu {francs(depotRecu)} · reste {francs(depotReste)}</p>
      </section>

      {ecarts && (
        <section className="carte-vente">
          <p className="entete"><strong>Contrôle : 2026 contre le classeur v14 corrigé</strong></p>
          {ecarts.map(([libelle, app, ref]) => {
            const ecart = Math.round(app - ref);
            return (
              <p key={libelle} className={ecart === 0 ? "note" : "erreur"}>
                {libelle} : application {francs(app)} · classeur {francs(ref)} · écart {ecart} F
              </p>
            );
          })}
        </section>
      )}
    </main>
  );
}

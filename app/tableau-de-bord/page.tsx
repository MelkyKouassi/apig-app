import { BandeauControles } from "@/components/BandeauControles";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  analyserProduits,
  calculerHorsProduits,
  calculerIndicateurs,
  calculerResultats,
  type Portee,
  type VenteComplete,
  type DepenseI,
  type EvenementI,
  type PrimeI,
  type ProductionI,
  type VenteProduitI,
} from "@/lib/indicateurs";
import { Sommaire } from "@/components/Sommaire";

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
  creances: 1258278,
};

type Params = { debutA?: string; finA?: string; debutB?: string; finB?: string; exclus?: string | string[]; portee?: string; lieu?: string };
const PORTEES: { valeur: Portee; libelle: string }[] = [
  { valeur: "total", libelle: "Total" },
  { valeur: "evenements", libelle: "Événements" },
  { valeur: "pdv", libelle: "Point de vente" },
  { valeur: "lieu", libelle: "Un lieu" },
];

type LigneComparaison = {
  libelle: string;
  valeur: (i: import("@/lib/indicateurs").IndicateursPeriode) => number;
  format: (n: number) => string;
  ratio?: boolean;
};
const pourcentage = (n: number) => `${(Math.round(n * 1000) / 10).toLocaleString("fr-FR")} %`;
const entier = (n: number) => Math.round(n).toLocaleString("fr-FR");
const LIGNES_COMPARAISON: LigneComparaison[] = [
  { libelle: "Chiffre d'affaires (F CFA)", valeur: (i) => i.ca, format: francs },
  { libelle: "Dépenses datées (F CFA)", valeur: (i) => i.depenses, format: francs },
  { libelle: "Bénéfice net (CA − dépenses)", valeur: (i) => i.benefice, format: francs },
  { libelle: "Marge nette (bénéfice ÷ CA)", valeur: (i) => i.margeNette, format: pourcentage, ratio: true },
  { libelle: "Primes commerciales (F CFA)", valeur: (i) => i.primes, format: francs },
  { libelle: "Bénéfice net après primes", valeur: (i) => i.beneficeApresPrimes, format: francs },
  { libelle: "Dîme (F CFA)", valeur: (i) => i.dime, format: francs },
  { libelle: "Volume des ventes (unités vendues)", valeur: (i) => i.volume, format: entier },
  { libelle: "Nombre de ventes (lignes du journal)", valeur: (i) => i.nombreVentes, format: entier },
  { libelle: "Nombre de produits différents vendus", valeur: (i) => i.nombreProduits, format: entier },
  { libelle: "Valeur moyenne par vente (F CFA)", valeur: (i) => i.valeurMoyenneVente, format: francs },
  { libelle: "Prix moyen par unité vendue (F CFA)", valeur: (i) => i.prixMoyenUnite, format: francs },
  { libelle: "Lieux de vente actifs", valeur: (i) => i.lieuxActifs, format: entier },
  { libelle: "CA moyen par lieu actif (F CFA)", valeur: (i) => i.caMoyenLieu, format: francs },
  { libelle: "Ventes à crédit (F CFA)", valeur: (i) => i.ventesCredit, format: francs },
  { libelle: "Part des ventes à crédit dans le CA", valeur: (i) => i.partCredit, format: pourcentage, ratio: true },
];

export default function PageTableauDeBord(props: PageProps<"/tableau-de-bord">) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuTableauDeBord searchParams={props.searchParams as Promise<Params>} />
    </Suspense>
  );
}

// Reste à payer par tiers : un reste inférieur ou égal à 1 F est soldé (R12) et ne réduit pas les créances.
function resteParTiers(dus: Map<string, number>, recus: Map<string, number>) {
  const restes = new Map<string, number>();
  for (const [id, du] of dus) {
    const reste = du - (recus.get(id) ?? 0);
    if (reste > 1) restes.set(id, reste);
  }
  return restes;
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
  const exclusBruts = Array.isArray(sp.exclus) ? sp.exclus : sp.exclus ? [sp.exclus] : [];
  const exclus = new Set(exclusBruts);
  const portee: Portee = PORTEES.some((p) => p.valeur === sp.portee) ? (sp.portee as Portee) : "total";
  const lieuChoisi = sp.lieu ?? "";

  const [
    { data: ventes }, { data: depenses }, { data: evenements }, { data: primes },
    { data: depots }, { data: reglementsDepot }, { data: creditsClients }, { data: reglementsCredit },
    { data: stock }, { data: productions }, { data: produits }, { data: tiers },
  ] = await Promise.all([
    supabase.from("ventes").select("date_vente, montant, evenement_id, produit_id, quantite, prix_unitaire, tiers_id, mode_paiement").eq("statut", "actif"),
    supabase.from("depenses").select("date_depense, montant, evenement_id").eq("statut", "actif"),
    supabase.from("evenements").select("id, nom, est_point_de_vente, taux_dime"),
    supabase.from("v_primes").select("evenement_id, annee, mois, prime"),
    supabase.from("v_depots_lignes").select("tiers_id, montant_du"),
    supabase.from("reglements").select("tiers_id, montant").eq("origine", "depot").eq("statut", "actif"),
    supabase.from("ventes").select("tiers_id, montant").eq("mode_paiement", "credit").eq("statut", "actif"),
    supabase.from("reglements").select("tiers_id, montant").eq("origine", "credit").eq("statut", "actif"),
    supabase.from("v_stock").select("stock_restant"),
    supabase.from("productions").select("evenement_id, produit_id, quantite_produite"),
    supabase.from("produits").select("id, nom").order("nom"),
    supabase.from("tiers").select("id, nom"),
  ]);

  const evts = (evenements ?? []) as EvenementI[];
  const ventesI = (ventes ?? []) as (VenteComplete & { tiers_id: string | null })[];
  const depensesI = (depenses ?? []) as DepenseI[];
  const primesI = (primes ?? []) as PrimeI[];
  const nomsProduits = new Map((produits ?? []).map((p) => [p.id, p.nom]));
  const nomsTiers = new Map((tiers ?? []).map((t) => [t.id, t.nom]));

  const A = calculerResultats(debutA, finA, ventesI, depensesI, evts, primesI);
  const B = calculerResultats(debutB, finB, ventesI, depensesI, evts, primesI);
  const hors = calculerHorsProduits(debutA, finA, ventesI, depensesI, exclus);
  const comparA = calculerIndicateurs(debutA, finA, portee, ventesI, depensesI, evts, primesI, lieuChoisi);
  const comparB = calculerIndicateurs(debutB, finB, portee, ventesI, depensesI, evts, primesI, lieuChoisi);
  const nomLieuChoisi = evts.find((e) => e.id === lieuChoisi)?.nom;
  const produitsA = analyserProduits(debutA, finA, ventesI, (productions ?? []) as ProductionI[], nomsProduits);

  // Créances : état à aujourd'hui, par tiers (restes ≤ 1 F ignorés).
  const sommeParTiers = (lignes: { tiers_id: string | null; montant?: number | null; montant_du?: number | null }[] | null, champ: "montant" | "montant_du") => {
    const m = new Map<string, number>();
    for (const l of lignes ?? []) {
      if (!l.tiers_id) continue;
      m.set(l.tiers_id, (m.get(l.tiers_id) ?? 0) + Number(l[champ] ?? 0));
    }
    return m;
  };
  const restesClients = resteParTiers(
    sommeParTiers(creditsClients as { tiers_id: string | null; montant: number | null }[] | null, "montant"),
    sommeParTiers(reglementsCredit as { tiers_id: string | null; montant: number | null }[] | null, "montant"),
  );
  const restesDepots = resteParTiers(
    sommeParTiers(depots as { tiers_id: string | null; montant_du: number | null }[] | null, "montant_du"),
    sommeParTiers(reglementsDepot as { tiers_id: string | null; montant: number | null }[] | null, "montant"),
  );
  const totalClients = [...restesClients.values()].reduce((s, v) => s + v, 0);
  const totalDepots = [...restesDepots.values()].reduce((s, v) => s + v, 0);
  const creancesTotales = totalClients + totalDepots;
  const stockRestant = ((stock ?? []) as { stock_restant: number }[]).reduce((s, l) => s + Number(l.stock_restant), 0);

  // Top 5 des créanciers à relancer : plus grand reste en premier.
  const top5 = [
    ...[...restesClients].map(([id, reste]) => ({ nom: nomsTiers.get(id) ?? "Client", type: "Client à crédit", reste })),
    ...[...restesDepots].map(([id, reste]) => ({ nom: nomsTiers.get(id) ?? "Destinataire", type: "Dépôt-vente", reste })),
  ].sort((a, b) => b.reste - a.reste).slice(0, 5);

  const estReference = debutA === "2026-01-01" && finA === "2026-12-31";
  const ecarts = estReference
    ? [
        ["CA", A.ca, REFERENCE_2026.ca],
        ["Dépenses", A.depenses, REFERENCE_2026.depenses],
        ["Bénéfice net", A.benefice, REFERENCE_2026.benefice],
        ["Primes", A.primes, REFERENCE_2026.primes],
        ["Dîme", A.dime, REFERENCE_2026.dime],
        ["Bénéfice après primes", A.beneficeApresPrimes, REFERENCE_2026.beneficeApresPrimes],
        ["Créances totales", creancesTotales, REFERENCE_2026.creances],
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

  const produitsChoisis = (produits ?? []).map((p) => ({ id: p.id, nom: p.nom }));

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Tableau de bord</h1>
      <Sommaire items={[
        { id: "indicateurs", libelle: "Indicateurs" },
        { id: "comparaison", libelle: "Comparaison" },
        { id: "origine", libelle: "Par origine" },
        { id: "hors-produits", libelle: "Hors produits" },
        { id: "produits", libelle: "Produits" },
        { id: "encaissements", libelle: "Créances" },
        { id: "controle", libelle: "Contrôle 2026" },
      ]} />
      <BandeauControles />

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
        <fieldset>
          <legend>Comparaison dynamique</legend>
          <select name="portee" defaultValue={portee}>
            {PORTEES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
          </select>
          <select name="lieu" defaultValue={lieuChoisi}>
            <option value="">— Lieu (si « Un lieu ») —</option>
            {evts.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </fieldset>
        <fieldset>
          <legend>Produits exclus du CA hors exclusions</legend>
          {produitsChoisis.map((p) => (
            <label key={p.id} className="case">
              <input type="checkbox" name="exclus" value={p.id} defaultChecked={exclus.has(p.id)} /> {p.nom}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="secondaire">Afficher</button>
      </form>

      <section id="indicateurs" className="carte-vente">
        <p className="entete"><strong>Indicateurs</strong></p>
        {indicateurs.map(([libelle, a, b]) => (
          <p key={libelle} className="note">
            {libelle} : <strong>{francs(a)}</strong> · période B {francs(b)} · évolution {evolution(a, b)}
          </p>
        ))}
        <p className="note">Créances à recouvrer : <strong>{francs(creancesTotales)}</strong> · Stock restant des événements : {Math.round(stockRestant * 10) / 10} (état à aujourd&apos;hui)</p>
      </section>

      <section id="comparaison" className="carte-vente">
        <p className="entete"><strong>Comparaison dynamique : {portee === "lieu" ? nomLieuChoisi ?? "lieu non choisi" : PORTEES.find((p) => p.valeur === portee)?.libelle}</strong></p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead>
              <tr><th>Indicateur</th><th className="nombre">Période A</th><th className="nombre">Période B</th><th className="nombre">Évolution</th></tr>
            </thead>
            <tbody>
              {LIGNES_COMPARAISON.map((l) => {
                const a = l.valeur(comparA.indicateurs);
                const b = l.valeur(comparB.indicateurs);
                return (
                  <tr key={l.libelle}>
                    <td>{l.libelle}</td>
                    <td className="nombre">{l.format(a)}</td>
                    <td className="nombre">{l.format(b)}</td>
                    <td className={`nombre ${a - b < 0 ? "negatif" : a - b > 0 ? "positif" : ""}`}>{l.ratio ? `${Math.round((a - b) * 1000) / 10} pts` : evolution(a, b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {portee === "total" && comparA.lieux.length > 0 && (
          <>
            <p className="entete"><strong>Détail par lieu (période A)</strong></p>
            <div style={{ overflowX: "auto" }}>
              <table className="tableau">
                <thead>
                  <tr><th>Lieu</th><th className="nombre">CA</th><th className="nombre">Dépenses</th><th className="nombre">Bénéfice</th><th className="nombre">Dîme</th><th className="nombre">Unités</th><th className="nombre">Ventes</th></tr>
                </thead>
                <tbody>
                  {comparA.lieux.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nom}</td>
                      <td className="nombre">{francs(l.ca)}</td>
                      <td className="nombre">{francs(l.depenses)}</td>
                      <td className={`nombre ${l.benefice < 0 ? "negatif" : ""}`}>{francs(l.benefice)}</td>
                      <td className="nombre">{francs(l.dime)}</td>
                      <td className="nombre">{l.volume}</td>
                      <td className="nombre">{l.nombreVentes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section id="origine" className="carte-vente">
        <p className="entete"><strong>Résultats par origine (période A)</strong></p>
        <p className="note">Événements : CA {francs(A.caEvenements)} · dépenses {francs(A.depensesEvenements)} · bénéfice {francs(A.beneficeEvenements)} · dîme {francs(A.dimeEvenements)} · primes {francs(A.primesEvenements)}</p>
        <p className="note">Point de vente : CA {francs(A.caPointDeVente)} · dépenses {francs(A.depensesPointDeVente)} · bénéfice {francs(A.beneficePointDeVente)} · dîme {francs(A.dimePointDeVente)} · primes {francs(A.primesPointDeVente)}</p>
      </section>

      <section id="hors-produits" className="carte-vente">
        <p className="entete"><strong>CA et bénéfice hors produits exclus (période A)</strong></p>
        <p className="note">
          {exclus.size === 0
            ? "Aucun produit exclu : les deux colonnes sont identiques."
            : `${exclus.size} produit(s) exclu(s) : ${[...exclus].map((id) => nomsProduits.get(id) ?? "produit").join(", ")}. Les dépenses restent intégralement prises en compte.`}
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead><tr><th>Indicateur</th><th className="nombre">Tous les produits</th><th className="nombre">Hors exclus</th><th className="nombre">Écart</th></tr></thead>
            <tbody>
              <tr><td>CA</td><td className="nombre">{francs(hors.tous.ca)}</td><td className="nombre">{francs(hors.hors.ca)}</td><td className="nombre">{francs(hors.hors.ca - hors.tous.ca)}</td></tr>
              <tr><td>Nombre de ventes (lignes)</td><td className="nombre">{hors.tous.ventes}</td><td className="nombre">{hors.hors.ventes}</td><td className="nombre">{hors.hors.ventes - hors.tous.ventes}</td></tr>
              <tr><td>Unités vendues</td><td className="nombre">{hors.tous.unites}</td><td className="nombre">{hors.hors.unites}</td><td className="nombre">{hors.hors.unites - hors.tous.unites}</td></tr>
              <tr><td>Dépenses</td><td className="nombre">{francs(hors.tous.depenses)}</td><td className="nombre">{francs(hors.hors.depenses)}</td><td className="nombre">0 F</td></tr>
              <tr><td>Bénéfice (CA − dépenses)</td><td className="nombre">{francs(hors.tous.benefice)}</td><td className="nombre">{francs(hors.hors.benefice)}</td><td className="nombre">{francs(hors.hors.benefice - hors.tous.benefice)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="produits" className="carte-vente">
        <p className="entete"><strong>Analyse des produits (période A)</strong></p>
        {produitsA.length === 0 && <p className="note">Aucune vente sur la période.</p>}
        {produitsA.map((p) => (
          <p key={p.id} className="note">
            {p.nom} : vendues {p.unites} · CA {francs(p.ca)} · production {p.production}
            {p.prixManquants > 0 && <span className="erreur"> · {p.prixManquants} vente(s) sans prix</span>}
          </p>
        ))}
        {produitsA.length > 0 && (
          <>
            <p className="entete"><strong>Top 5 des produits vendus</strong></p>
            {[...produitsA].reverse().slice(0, 5).map((p, i) => (
              <p key={p.id} className="note">{i + 1}. {p.nom} ({p.unites} unités)</p>
            ))}
          </>
        )}
      </section>

      <section id="encaissements" className="carte-vente">
        <p className="entete"><strong>Encaissements et créances (à aujourd&apos;hui)</strong></p>
        <p className="note">Clients à crédit : reste {francs(totalClients)} · Dépôt-vente : reste {francs(totalDepots)} · Total {francs(creancesTotales)}</p>
        <p className="entete"><strong>Top 5 des créanciers à relancer</strong></p>
        {top5.length === 0 && <p className="note">Aucun reste à recouvrer.</p>}
        {top5.map((c, i) => (
          <p key={i} className="note">{i + 1}. {c.nom} ({c.type}) : {francs(c.reste)}</p>
        ))}
      </section>

      {ecarts && (
        <section id="controle" className="carte-vente">
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

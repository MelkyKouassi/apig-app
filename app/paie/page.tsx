import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculerPaie, partCollaborateur, type MoisDonnees, type OptionsPaie } from "@/lib/paie";

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const NOMS_MOIS = ["Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

export default function PagePaie() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuPaie />
    </Suspense>
  );
}

async function ContenuPaie() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");

  const [{ data: p }, { data: ventes }, { data: depenses }, { data: evts }, { data: primes }, { data: charges }, { data: chargesReelles }, { data: collabs }, { data: versements }] = await Promise.all([
    supabase.from("parametres").select("*").limit(1).maybeSingle(),
    supabase.from("ventes").select("date_vente, montant, evenement_id").eq("statut", "actif"),
    supabase.from("depenses").select("date_depense, montant, categorie, evenement_id").eq("statut", "actif"),
    supabase.from("evenements").select("id, est_point_de_vente, taux_dime, date_fin"),
    supabase.from("v_primes").select("annee, mois, prime"),
    supabase.from("charges").select("id, nature, montant_habituel").eq("actif", true),
    supabase.from("charges_mensuelles").select("charge_id, annee, mois, montant_reel"),
    supabase.from("collaborateurs").select("id, nom, parts"),
    supabase.from("versements").select("collaborateur_id, annee, mois, montant"),
  ]);

  const annee = Number(p?.annee_reference ?? 2026);
  const options: OptionsPaie = {
    taux_impot: Number(p?.taux_impot ?? 0.25),
    reserve_legale_taux: Number(p?.reserve_legale_taux ?? 0.1),
    reserve_plafond_taux: Number(p?.reserve_plafond_taux ?? 0.2),
    capital_social: Number(p?.capital_social ?? 1500000),
    reserve_deja_constituee: Number(p?.reserve_deja_constituee ?? 0),
    epargne_taux: Number(p?.epargne_taux ?? 0.1),
    part_distribuee: Number(p?.part_distribuee ?? 0.5),
    reintegrer_remunerations: Boolean(p?.reintegrer_remunerations),
    deduire_dime: Boolean(p?.deduire_dime),
    reporter_deficits: Boolean(p?.reporter_deficits),
  };

  const lieux = new Map((evts ?? []).map((e) => [e.id, e]));
  const donnees: MoisDonnees[] = Array.from({ length: 12 }, (_, i) => ({ ca: 0, depenses: 0, remunerations: 0, primes: 0, dime: 0, chargesFixes: 0, chargesNonFixes: 0 }));
  const benefLieuMois = new Map<string, number>(); // clé lieu|mois (points de vente)
  const totalEvenement = new Map<string, { ca: number; dep: number; mois: number | null }>(); // événements : total et mois de fin

  for (const v of ventes ?? []) {
    if (!v.date_vente || Number(v.date_vente.slice(0, 4)) !== annee) continue;
    const m = Number(v.date_vente.slice(5, 7)) - 1;
    donnees[m].ca += Number(v.montant ?? 0);
    const k = `${v.evenement_id}|${m}`;
    benefLieuMois.set(k, (benefLieuMois.get(k) ?? 0) + Number(v.montant ?? 0));
    const t = totalEvenement.get(v.evenement_id ?? "") ?? { ca: 0, dep: 0, mois: null };
    t.ca += Number(v.montant ?? 0);
    totalEvenement.set(v.evenement_id ?? "", t);
  }
  for (const d of depenses ?? []) {
    if (!d.date_depense || Number(d.date_depense.slice(0, 4)) !== annee) continue;
    const m = Number(d.date_depense.slice(5, 7)) - 1;
    donnees[m].depenses += Number(d.montant ?? 0);
    if (d.categorie === "remuneration_interessement") donnees[m].remunerations += Number(d.montant ?? 0);
    const k = `${d.evenement_id}|${m}`;
    benefLieuMois.set(k, (benefLieuMois.get(k) ?? 0) - Number(d.montant ?? 0));
    const t = totalEvenement.get(d.evenement_id ?? "") ?? { ca: 0, dep: 0, mois: null };
    t.dep += Number(d.montant ?? 0);
    totalEvenement.set(d.evenement_id ?? "", t);
  }
  // Dîme (règle du classeur) :
  // - point de vente : (CA − dépenses) de chaque mois × taux ;
  // - événement : dîme totale de l'événement, comptée au mois de sa fin.
  for (const [k, benef] of benefLieuMois) {
    const [id, m] = k.split("|");
    if (!lieux.get(id)?.est_point_de_vente) continue;
    donnees[Number(m)].dime += benef * Number(lieux.get(id)?.taux_dime ?? 0.1);
  }
  for (const [id, t] of totalEvenement) {
    const lieu = lieux.get(id);
    if (!lieu || lieu.est_point_de_vente) continue;
    const fin = lieu.date_fin ?? "";
    const mois = fin.startsWith(String(annee)) ? Number(fin.slice(5, 7)) - 1 : null;
    if (mois === null) continue;
    donnees[mois].dime += (t.ca - t.dep) * Number(lieu.taux_dime ?? 0.1);
  }
  // Primes rattachées au mois de fin de l'événement (les primes du point de vente, annuelles, ne sont pas rattachées à un mois).
  for (const pr of primes ?? []) {
    if (pr.annee === annee && pr.mois) donnees[pr.mois - 1].primes += Number(pr.prime);
  }
  // Charges : montant réel du mois si saisi, sinon montant habituel (fixes uniquement).
  const reelles = new Map((chargesReelles ?? []).map((r) => [`${r.charge_id}|${r.annee}|${r.mois}`, Number(r.montant_reel)]));
  for (const c of charges ?? []) {
    for (let m = 1; m <= 12; m++) {
      const reel = reelles.get(`${c.id}|${annee}|${m}`);
      const montant = reel ?? (c.nature === "fixe" ? Number(c.montant_habituel ?? 0) : 0);
      if (c.nature === "fixe") donnees[m - 1].chargesFixes += montant;
      else donnees[m - 1].chargesNonFixes += montant;
    }
  }

  const lignes = calculerPaie(donnees, options);
  const totalParts = (collabs ?? []).reduce((s, c) => s + Number(c.parts), 0);

  // Montant dû par collaborateur (cumul des parts) et versements.
  const dus = new Map<string, number>();
  for (const l of lignes) {
    for (const c of collabs ?? []) {
      dus.set(c.id, (dus.get(c.id) ?? 0) + partCollaborateur(l.enveloppe, Number(c.parts), totalParts));
    }
  }
  const verses = new Map<string, number>();
  for (const v of versements ?? []) {
    if (v.annee === annee) verses.set(v.collaborateur_id, (verses.get(v.collaborateur_id) ?? 0) + Number(v.montant));
  }

  const actifs = lignes.filter((l) => l.actif);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Paie et épargne {annee}</h1>
      <p className="note">Calcul selon les règles R15 à R18. Les versements et les charges réelles mensuelles sont à importer depuis le classeur.</p>

      <section className="carte-vente">
        <p className="entete"><strong>Mois</strong></p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead>
              <tr><th>Mois</th><th className="nombre">Résultat d&apos;exploitation</th><th className="nombre">Avant impôt</th><th className="nombre">Impôt</th><th className="nombre">Réserve</th><th className="nombre">Épargne</th><th className="nombre">Disponible</th><th className="nombre">Enveloppe</th></tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.mois}>
                  <td>{NOMS_MOIS[l.mois - 1]}</td>
                  <td className="nombre">{l.actif ? francs(l.resultatExploitation) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.resultatAvantImpot) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.impot) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.reserve) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.epargne) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.disponible) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.enveloppe) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="total">Enveloppe distribuable : {francs(actifs.reduce((s, l) => s + l.enveloppe, 0))}</p>
      </section>

      <section className="carte-vente">
        <p className="entete"><strong>Par collaborateur</strong></p>
        {(collabs ?? []).map((c) => {
          const du = dus.get(c.id) ?? 0;
          const verse = verses.get(c.id) ?? 0;
          return (
            <p key={c.id} className="note">
              {c.nom} ({c.parts} part{Number(c.parts) > 1 ? "s" : ""}) : dû {francs(du)} · versé {francs(verse)} · <strong>reste à verser {francs(du - verse)}</strong>
            </p>
          );
        })}
      </section>
    </main>
  );
}

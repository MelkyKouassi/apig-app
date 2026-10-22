import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chargerPaie } from "@/lib/paie-donnees";
import { FormulaireVersement } from "./FormulaireVersement";
import { FormulaireDecisionVersement } from "./FormulairesVersement";
import { FormulaireAnnulerRetenue, FormulaireRetenue, FormulaireValidation } from "./FormulairesRetenues";
import { dateFr, dateHeureFr } from "@/lib/dates";
import { Sommaire } from "@/components/Sommaire";

type Params = { mois?: string };

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const NOMS_MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const NOMS_MOIS_COURT = ["Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

export default function PagePaie(props: PageProps<"/paie">) {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuPaie searchParams={props.searchParams as Promise<Params>} />
    </Suspense>
  );
}

async function ContenuPaie({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");
  const estGerant = profil.role === "gerant";

  const paie = await chargerPaie(supabase);
  const { annee, lignes, collaborateurs, duParMois, retenuesParMois, netParMois, retenues, versements, versementsAttente } = paie;

  // Bulletins validés : un enregistrement par collaborateur et par mois.
  const { data: bulletinsValides } = await supabase.from("bulletins").select("collaborateur_id, annee, mois, valide_le");

  // Mois de la fiche : celui demandé, sinon le dernier mois avec une enveloppe.
  const dernierMois = Math.max(1, ...lignes.filter((l) => l.enveloppe > 0).map((l) => l.mois));
  const moisFiche = Math.min(12, Math.max(1, Number(sp.mois ?? dernierMois)));
  const enveloppeMois = lignes[moisFiche - 1]?.enveloppe ?? 0;

  const totalEnveloppe = lignes.reduce((s, l) => s + l.enveloppe, 0);
  const actifs = lignes.filter((l) => l.actif);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Paie et épargne {annee}</h1>
        <Sommaire items={[
          { id: "calcul", libelle: "Calcul mensuel" },
          { id: "fiche", libelle: "Fiche du mois" },
          { id: "reste", libelle: "Reste à verser" },
          { id: "versement", libelle: "Versement" },
          { id: "attente", libelle: "En attente" },
          { id: "retenues", libelle: "Retenues" },
          { id: "journal", libelle: "Journal" },
        ]} />
      <p className="total">Enveloppe distribuable : {francs(totalEnveloppe)}</p>
      <p className="note">Calcul selon les règles R15 à R18, comme le classeur.</p>

      <section id="calcul" className="carte-vente">
        <p className="entete"><strong>Calcul mensuel</strong></p>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead>
              <tr><th>Mois</th><th className="nombre">Résultat d&apos;exploitation</th><th className="nombre">Avant impôt</th><th className="nombre">Impôt</th><th className="nombre">Réserve</th><th className="nombre">Épargne</th><th className="nombre">Disponible</th><th className="nombre">Enveloppe</th></tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.mois}>
                  <td>{NOMS_MOIS_COURT[l.mois - 1]}</td>
                  <td className={`nombre ${l.resultatExploitation < 0 ? "negatif" : ""}`}>{l.actif ? francs(l.resultatExploitation) : "—"}</td>
                  <td className={`nombre ${l.resultatAvantImpot < 0 ? "negatif" : ""}`}>{l.actif ? francs(l.resultatAvantImpot) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.impot) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.reserve) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.epargne) : "—"}</td>
                  <td className={`nombre ${l.disponible < 0 ? "negatif" : ""}`}>{l.actif ? francs(l.disponible) : "—"}</td>
                  <td className="nombre">{l.actif ? francs(l.enveloppe) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Mois actifs : {actifs.length}. Les mois sans chiffre d&apos;affaires ni dépense ne sont pas pris en compte.</p>
      </section>

      <section id="fiche" className="carte-vente">
        <p className="entete"><strong>Fiche de paie du mois</strong></p>
        <form method="get" className="formulaire">
          <select name="mois" defaultValue={String(moisFiche)}>
            {NOMS_NON_VIDES(lignes).map((m) => <option key={m} value={m}>{NOMS_MOIS[m - 1]}</option>)}
          </select>
          <button type="submit" className="secondaire">Afficher</button>
        </form>
        <p className="note">Enveloppe du mois : <strong>{francs(enveloppeMois)}</strong></p>
        {(() => {
          const valide = (bulletinsValides ?? []).find((b) => b.annee === annee && b.mois === moisFiche);
          return valide ? (
            <p className="succes">Paie validée le {dateFr(valide.valide_le.slice(0, 10))}.</p>
          ) : (
            <p className="erreur">Paie non validée : les montants ci-dessous sont provisoires.</p>
          );
        })()}
        {estGerant && <FormulaireValidation mois={moisFiche} />}
        <p className="entete"><strong>Bulletins du mois</strong></p>
        <div className="formulaire">
          <Link href={`/paie/bulletins?mois=${moisFiche}`} className="lien">
            Imprimer tous les bulletins du mois
          </Link>
          {collaborateurs.map((c) => (
            <Link key={c.id} href={`/paie/bulletin/${c.id}?mois=${moisFiche}`} className="secondaire lien">
              Bulletin de {c.nom}
            </Link>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tableau">
            <thead>
              <tr><th>Collaborateur</th><th className="nombre">Parts</th><th className="nombre">Montant dû</th><th className="nombre">Retenues</th><th className="nombre">Net à payer</th><th className="nombre">Versé pour ce mois</th><th className="nombre">Reste à verser</th></tr>
            </thead>
            <tbody>
              {collaborateurs.map((c) => {
                const du = duParMois.get(c.id)?.[moisFiche - 1] ?? 0;
                const retenu = retenuesParMois.get(c.id)?.[moisFiche - 1] ?? 0;
                const net = netParMois.get(c.id)?.[moisFiche - 1] ?? 0;
                const verse = versements.filter((v) => v.collaborateur_id === c.id && v.mois === moisFiche).reduce((s, v) => s + v.montant, 0);
                return (
                  <tr key={c.id}>
                    <td>{c.nom}</td>
                    <td className="nombre">{c.parts}</td>
                    <td className="nombre">{francs(du)}</td>
                    <td className="nombre">{retenu > 0 ? `− ${francs(retenu)}` : "—"}</td>
                    <td className="nombre">{francs(net)}</td>
                    <td className="nombre">{francs(verse)}</td>
                    <td className={`nombre ${net - verse < 0 ? "negatif" : ""}`}>{francs(net - verse)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section id="reste" className="carte-vente">
        <p className="entete"><strong>Reste à verser (cumul de l&apos;année)</strong></p>
        {collaborateurs.map((c) => {
          const net = (netParMois.get(c.id) ?? []).reduce((s, v) => s + v, 0);
          const verse = versements.filter((v) => v.collaborateur_id === c.id).reduce((s, v) => s + v.montant, 0);
          return (
            <p key={c.id} className="note">
              {c.nom} : net dû {francs(net)} · versé {francs(verse)} · <strong>reste {francs(net - verse)}</strong>
            </p>
          );
        })}
      </section>

      <section id="versement" className="carte-vente">
        <p className="entete"><strong>Enregistrer un versement</strong></p>
        {!estGerant && <p className="note">Un versement que vous saisissez reste en attente jusqu&apos;à l&apos;accord du gérant.</p>}
        <FormulaireVersement collaborateurs={collaborateurs.map((c) => ({ id: c.id, nom: c.nom }))} moisParDefaut={moisFiche} />
      </section>

      <section id="attente" className="carte-vente">
        <p className="entete"><strong>Versements en attente d&apos;accord</strong></p>
        {versementsAttente.length === 0 && <p className="note">Aucun versement en attente.</p>}
        {versementsAttente.map((v) => {
          const nom = collaborateurs.find((c) => c.id === v.collaborateur_id)?.nom ?? "Collaborateur";
          return (
            <div key={v.id} className="note">
              <p>{dateFr(v.date_versement)} · {nom} · mois concerné {NOMS_MOIS[v.mois - 1]} · <strong>{francs(v.montant)}</strong></p>
              {estGerant && <FormulaireDecisionVersement id={v.id} />}
            </div>
          );
        })}
      </section>

      <section id="retenues" className="carte-vente">
        <p className="entete"><strong>Retenues facultatives</strong></p>
        <p className="note">Elles réduisent le net à payer du bulletin du mois concerné.</p>
        {estGerant && <FormulaireRetenue collaborateurs={collaborateurs.map((c) => ({ id: c.id, nom: c.nom }))} moisParDefaut={moisFiche} />}
        {retenues.filter((r) => r.mois === moisFiche).length === 0 && <p className="note">Aucune retenue pour ce mois.</p>}
        {retenues.filter((r) => r.mois === moisFiche).map((r) => {
          const nom = collaborateurs.find((c) => c.id === r.collaborateur_id)?.nom ?? "Collaborateur";
          return (
            <div key={r.id} className="note">
              <p>
                {nom} · {r.libelle} · {francs(r.montant)} {r.statut === "annule" ? <span className="erreur">(annulée)</span> : ""}
              </p>
              {estGerant && r.statut === "actif" && <FormulaireAnnulerRetenue id={r.id} />}
            </div>
          );
        })}
      </section>

      <section id="journal" className="carte-vente">
        <p className="entete"><strong>Journal des versements</strong></p>
        {versements.length === 0 && <p className="note">Aucun versement enregistré.</p>}
        {versements.map((v) => {
          const nom = collaborateurs.find((c) => c.id === v.collaborateur_id)?.nom ?? "Collaborateur";
          return (
            <p key={v.id} className="note">
              {dateFr(v.date_versement)} · {nom} · mois concerné {NOMS_MOIS[v.mois - 1]} · {francs(v.montant)}
            </p>
          );
        })}
      </section>
    </main>
  );
}

// Mois proposés dans la fiche : tous les mois jusqu'au dernier mois actif.
function NOMS_NON_VIDES(lignes: { mois: number; actif: boolean }[]) {
  const dernier = Math.max(1, ...lignes.filter((l) => l.actif).map((l) => l.mois));
  return Array.from({ length: dernier }, (_, i) => i + 1);
}

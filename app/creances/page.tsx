import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireReglement } from "./FormulaireReglement";
import { FormulaireReglementDepot } from "@/app/depot-vente/FormulaireReglementDepot";
import { dateFr, dateHeureFr } from "@/lib/dates";
import { Sommaire } from "@/components/Sommaire";
import { plusAncienneRemiseImpayee, retardJours } from "@/lib/depot-retard";

type Client = { id: string; nom: string; telephone: string | null; type: string | null };

const francs = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;

// R13 : retard = jours depuis la plus ancienne vente à crédit − délai convenu.
function alerte(retard: number): { libelle: string; classe: string } {
  if (retard <= 0) return { libelle: "Pas encore échu", classe: "ok" };
  if (retard < 30) return { libelle: "À relancer", classe: "attention" };
  if (retard < 60) return { libelle: "Relance ferme", classe: "ferme" };
  return { libelle: "Urgent", classe: "urgent" };
}

export default function PageCreances() {
  return (
    <Suspense fallback={<p className="page-centree">Chargement...</p>}>
      <ContenuCreances />
    </Suspense>
  );
}

async function ContenuCreances() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") redirect("/");
  const estGerant = profil?.role === "gerant";

  const [{ data: parametres }, { data: ventes }, { data: reglements }, { data: depots }, { data: reglementsDepot }, { data: tiers }, { data: produits }] = await Promise.all([
    supabase.from("parametres").select("delai_credit_jours, delai_paiement_jours").limit(1).maybeSingle(),
    supabase.from("ventes").select("tiers_id, montant, date_vente, produit_id, quantite").eq("mode_paiement", "credit").eq("statut", "actif"),
    supabase.from("reglements").select("tiers_id, montant, date_reglement").eq("origine", "credit").eq("statut", "actif"),
    supabase.from("v_depots_lignes").select("tiers_id, montant_du, date_remise"),
    supabase.from("reglements").select("tiers_id, montant, date_reglement").eq("origine", "depot").eq("statut", "actif"),
    supabase.from("tiers").select("id, nom, telephone, type"),
    supabase.from("produits").select("id, nom"),
  ]);

  const delai = parametres?.delai_credit_jours ?? 30;
  const aujourdhui = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const nomsClients = new Map(((tiers ?? []) as Client[]).map((c) => [c.id, c]));
  const nomsProduits = new Map((produits ?? []).map((p) => [p.id as string, p.nom as string]));

  // ---- Clients à crédit (R12, R13) ----
  type Cumul = { du: number; recu: number; plusAncienne: string | null; dernierReglement: string | null; produits: Map<string, number> };
  const nouveauCumul = (): Cumul => ({ du: 0, recu: 0, plusAncienne: null, dernierReglement: null, produits: new Map() });
  const parClient = new Map<string, Cumul>();
  const cumulClient = (id: string) => {
    if (!parClient.has(id)) parClient.set(id, nouveauCumul());
    return parClient.get(id)!;
  };
  for (const v of (ventes ?? []) as { tiers_id: string; montant: number | null; date_vente: string; produit_id: string; quantite: number }[]) {
    const c = cumulClient(v.tiers_id);
    c.du += Number(v.montant ?? 0);
    if (!c.plusAncienne || v.date_vente < c.plusAncienne) c.plusAncienne = v.date_vente;
    const nomProduit = nomsProduits.get(v.produit_id) ?? "Produit";
    c.produits.set(nomProduit, (c.produits.get(nomProduit) ?? 0) + Number(v.quantite ?? 0));
  }
  for (const r of (reglements ?? []) as { tiers_id: string; montant: number | null; date_reglement: string }[]) {
    const c = cumulClient(r.tiers_id);
    c.recu += Number(r.montant ?? 0);
    if (!c.dernierReglement || r.date_reglement > c.dernierReglement) c.dernierReglement = r.date_reglement;
  }
  const lignesClients = [...parClient.entries()]
    .map(([id, c]) => {
      const reste = c.du - c.recu;
      const retard = c.plusAncienne
        ? Math.floor((aujourdhui - new Date(c.plusAncienne + "T00:00:00Z").getTime()) / 86400000) - delai
        : -999;
      return { id, c, reste, retard, pct: c.du > 0 ? Math.min(100, (c.recu / c.du) * 100) : 0 };
    })
    .filter((l) => l.reste > 1)
    .sort((a, b) => b.retard - a.retard);
  const totalClients = lignesClients.reduce((s, l) => s + l.reste, 0);

  // ---- Dépôt-vente : reste par destinataire (R12) ----
  const parDepot = new Map<string, Cumul>();
  const cumulDepot = (id: string) => {
    if (!parDepot.has(id)) parDepot.set(id, nouveauCumul());
    return parDepot.get(id)!;
  };
  for (const d of (depots ?? []) as { tiers_id: string | null; montant_du: number | null; date_remise: string }[]) {
    if (!d.tiers_id) continue;
    const c = cumulDepot(d.tiers_id);
    c.du += Number(d.montant_du ?? 0);
    if (!c.plusAncienne || d.date_remise < c.plusAncienne) c.plusAncienne = d.date_remise;
  }
  for (const r of (reglementsDepot ?? []) as { tiers_id: string; montant: number | null; date_reglement: string }[]) {
    const c = cumulDepot(r.tiers_id);
    c.recu += Number(r.montant ?? 0);
    if (!c.dernierReglement || r.date_reglement > c.dernierReglement) c.dernierReglement = r.date_reglement;
  }
  // Remises par destinataire, pour trouver la plus ancienne remise encore impayée (R13 dépôt-vente).
  const remisesDepot = new Map<string, { date: string; montant: number }[]>();
  for (const d of (depots ?? []) as { tiers_id: string | null; montant_du: number | null; date_remise: string }[]) {
    if (!d.tiers_id) continue;
    const liste = remisesDepot.get(d.tiers_id) ?? [];
    liste.push({ date: d.date_remise, montant: Number(d.montant_du ?? 0) });
    remisesDepot.set(d.tiers_id, liste);
  }
  const delaiDepot = parametres?.delai_paiement_jours ?? 30;
  const lignesDepots = [...parDepot.entries()]
    .map(([id, c]) => {
      const reste = c.du - c.recu;
      const impayee = plusAncienneRemiseImpayee(remisesDepot.get(id) ?? [], c.recu);
      const retard = retardJours(impayee, delaiDepot, aujourdhui);
      return { id, c, reste, impayee, retard, pct: c.du > 0 ? Math.min(100, (c.recu / c.du) * 100) : 0 };
    })
    .filter((l) => l.reste > 1)
    .sort((a, b) => b.reste - a.reste);
  const totalDepots = lignesDepots.reduce((s, l) => s + l.reste, 0);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Créances</h1>
      <Sommaire items={[
        { id: "clients", libelle: "Clients à crédit" },
        { id: "depot-vente", libelle: "Dépôt-vente" },
      ]} />
      <p className="total">Reste à recouvrer : {francs(totalClients + totalDepots)} ({lignesClients.length + lignesDepots.length} créancier(s))</p>
      <p className="note">Clients à crédit : {francs(totalClients)} · Dépôt-vente : {francs(totalDepots)}</p>

      <nav className="sommaire" aria-label="Sections">
        <a href="#clients">Clients à crédit</a><a href="#depot-vente">Dépôt-vente</a>
      </nav>

      <h2 id="clients">Clients à crédit</h2>
      {lignesClients.length === 0 && <p className="note">Aucun client ne doit encore de l&apos;argent.</p>}
      {lignesClients.map((l) => {
        const client = nomsClients.get(l.id);
        const a = alerte(l.retard);
        return (
          <section key={l.id} className="carte-vente">
            <p className="entete">
              <strong>{client?.nom ?? "Client"}</strong>
              <span className={`badge ${a.classe}`}>{a.libelle}</span>
            </p>
            {client?.telephone && (
              <p className="note"><a href={`tel:${client.telephone}`} className="lien-tel">{client.telephone}</a></p>
            )}
            <p>Reste à payer : <strong>{francs(l.reste)}</strong> sur {francs(l.c.du)} ({Math.round(l.pct)} % réglé)</p>
            <p className="note">
              Plus ancienne vente à crédit : {dateFr(l.c.plusAncienne)} · Dernier règlement : {dateFr(l.c.dernierReglement, "aucun")}
              {l.retard > -999 && ` · Retard : ${Math.max(0, l.retard)} j`}
            </p>
            <p className="note">
              Produits à crédit : {[...l.c.produits.entries()].map(([nom, q]) => `${nom} (${q})`).join(", ") || "—"}
            </p>
            <FormulaireReglement tiersId={l.id} reste={l.reste} />
          </section>
        );
      })}

      <h2 id="depot-vente">Dépôt-vente</h2>
      {lignesDepots.length === 0 && <p className="note">Aucun destinataire de dépôt-vente ne doit encore de l&apos;argent.</p>}
      {lignesDepots.map((l) => {
        const destinataire = nomsClients.get(l.id);
        const a = alerte(l.retard ?? -999);
        return (
          <section key={l.id} className="carte-vente">
            <p className="entete">
              <strong>{destinataire?.nom ?? "Destinataire"}</strong>
              <span className="badge attention">{destinataire?.type ?? "Dépôt"}</span>
              <span className={`badge ${a.classe}`}>{a.libelle}</span>
            </p>
            {destinataire?.telephone && (
              <p className="note"><a href={`tel:${destinataire.telephone}`} className="lien-tel">{destinataire.telephone}</a></p>
            )}
            <p>Reste à payer : <strong>{francs(l.reste)}</strong> sur {francs(l.c.du)} ({Math.round(l.pct)} % réglé)</p>
            <p className="note">
              Plus ancienne remise impayée : {dateFr(l.impayee, "—")} · Dernier règlement : {dateFr(l.c.dernierReglement, "aucun")}
              {l.retard !== null && ` · Retard : ${Math.max(0, l.retard)} j`}
            </p>
            {estGerant && <FormulaireReglementDepot tiersId={l.id} reste={l.reste} />}
          </section>
        );
      })}
    </main>
  );
}

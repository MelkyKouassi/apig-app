import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireReglement } from "./FormulaireReglement";

type VenteCredit = { tiers_id: string; montant: number | null; date_vente: string };
type ReglementCredit = { tiers_id: string; montant: number | null; date_reglement: string };
type Client = { id: string; nom: string; telephone: string | null };

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

  const [{ data: parametres }, { data: ventes }, { data: reglements }, { data: clients }] = await Promise.all([
    supabase.from("parametres").select("delai_credit_jours").limit(1).maybeSingle(),
    supabase.from("ventes").select("tiers_id, montant, date_vente").eq("mode_paiement", "credit").eq("statut", "actif"),
    supabase.from("reglements").select("tiers_id, montant, date_reglement").eq("origine", "credit").eq("statut", "actif"),
    supabase.from("tiers").select("id, nom, telephone"),
  ]);

  const delai = parametres?.delai_credit_jours ?? 30;
  const aujourdhuiStr = new Date().toISOString().slice(0, 10);
  const aujourdhui = new Date(aujourdhuiStr + "T00:00:00Z").getTime();

  const parClient = new Map<string, { du: number; recu: number; plusAncienne: string | null; dernierReglement: string | null }>();
  const obtenir = (id: string) => {
    if (!parClient.has(id)) parClient.set(id, { du: 0, recu: 0, plusAncienne: null, dernierReglement: null });
    return parClient.get(id)!;
  };

  for (const v of (ventes ?? []) as VenteCredit[]) {
    const c = obtenir(v.tiers_id);
    c.du += Number(v.montant ?? 0);
    if (!c.plusAncienne || v.date_vente < c.plusAncienne) c.plusAncienne = v.date_vente;
  }
  for (const r of (reglements ?? []) as ReglementCredit[]) {
    const c = obtenir(r.tiers_id);
    c.recu += Number(r.montant ?? 0);
    if (!c.dernierReglement || r.date_reglement > c.dernierReglement) c.dernierReglement = r.date_reglement;
  }

  const nomsClients = new Map(((clients ?? []) as Client[]).map((c) => [c.id, c]));

  const lignes = [...parClient.entries()]
    .map(([id, c]) => {
      const reste = c.du - c.recu;
      const retard = c.plusAncienne
        ? Math.floor((aujourdhui - new Date(c.plusAncienne + "T00:00:00Z").getTime()) / 86400000) - delai
        : -999;
      return {
        id,
        client: nomsClients.get(id),
        du: c.du,
        recu: c.recu,
        reste,
        pct: c.du > 0 ? Math.min(100, (c.recu / c.du) * 100) : 0,
        plusAncienne: c.plusAncienne,
        dernierReglement: c.dernierReglement,
        retard,
      };
    })
    .filter((l) => l.reste > 1)
    .sort((a, b) => b.retard - a.retard);

  const totalReste = lignes.reduce((s, l) => s + l.reste, 0);

  return (
    <main className="page-centree">
      <Link href="/" className="retour">← Accueil</Link>
      <h1>Créances</h1>
      <p className="total">Reste à recouvrer : {francs(totalReste)} ({lignes.length} client(s))</p>
      {lignes.length === 0 && <p className="note">Aucun client ne doit encore de l&apos;argent.</p>}

      {lignes.map((l) => {
        const a = alerte(l.retard);
        return (
          <section key={l.id} className="carte-vente">
            <p className="entete">
              <strong>{l.client?.nom ?? "Client"}</strong>
              <span className={`badge ${a.classe}`}>{a.libelle}</span>
            </p>
            {l.client?.telephone && (
              <p className="note"><a href={`tel:${l.client.telephone}`} className="lien-tel">{l.client.telephone}</a></p>
            )}
            <p>Reste à payer : <strong>{francs(l.reste)}</strong> sur {francs(l.du)} ({Math.round(l.pct)} % réglé)</p>
            <p className="note">
              Plus ancienne vente à crédit : {l.plusAncienne} · Dernier règlement : {l.dernierReglement ?? "aucun"}
              {l.retard > -999 && ` · Retard : ${Math.max(0, l.retard)} j`}
            </p>
            <FormulaireReglement tiersId={l.id} reste={l.reste} />
          </section>
        );
      })}
    </main>
  );
}

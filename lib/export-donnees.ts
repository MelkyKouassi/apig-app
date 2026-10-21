import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerPaie } from "@/lib/paie-donnees";
import { calculerIndicateurs, calculerResultats, type DepenseI, type EvenementI, type PrimeI, type VenteComplete } from "@/lib/indicateurs";
import type { Feuille } from "@/lib/xlsx";
import { dateFr } from "@/lib/dates";

// Jeux d'export et profils autorisés (cahier des charges, section 3 : la paie est réservée au gérant).
export const ROLES_PAR_JEU = {
  ventes: ["gerant", "comptable"],
  depenses: ["gerant", "comptable"],
  depots: ["gerant", "comptable"],
  stock: ["gerant", "comptable"],
  primes: ["gerant", "comptable"],
  evenements: ["gerant", "comptable"],
  creances: ["gerant", "comptable"],
  tableau: ["gerant", "comptable"],
  paie: ["gerant"],
  sauvegarde: ["gerant"],
} as const;

export type Jeu = keyof typeof ROLES_PAR_JEU;
export const JEUX = Object.keys(ROLES_PAR_JEU) as Jeu[];

type Ligne = Record<string, unknown>;
type Colonnes = [string, string][];

const LOT = 1000;
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const oui = (v: unknown) => (v ? "Oui" : "Non");

// R13 : libellé d'alerte selon le retard en jours.
function libelleAlerte(retard: number): string {
  if (retard <= 0) return "Pas encore échu";
  if (retard < 30) return "À relancer";
  if (retard < 60) return "Relance ferme";
  return "Urgent";
}

// Lit toute une table ou vue, par lots de 1 000 (limite par requête).
async function toutes(supabase: SupabaseClient, table: string, ordres: string[] = ["id"]): Promise<Ligne[]> {
  const resultat: Ligne[] = [];
  for (let debut = 0; ; debut += LOT) {
    let requete = supabase.from(table).select("*");
    for (const o of ordres) requete = requete.order(o);
    const { data, error } = await requete.range(debut, debut + LOT - 1);
    if (error) throw new Error(`${table} : ${error.message}`);
    resultat.push(...((data ?? []) as Ligne[]));
    if (!data || data.length < LOT) break;
  }
  return resultat;
}

const dictionnaire = (lignes: Ligne[], cle = "id", valeur = "nom") =>
  new Map(lignes.map((l) => [String(l[cle]), l[valeur] as string]));

// Feuille à colonnes choisies, avec en-têtes lisibles.
function avecColonnes(nom: string, lignes: Ligne[], cols: Colonnes): Feuille {
  return {
    nom,
    entetes: cols.map(([, h]) => h),
    lignes: lignes.map((l) => cols.map(([k]) => lisible(l[k]))),
  };
}

// Une date AAAA-MM-JJ devient JJ/MM/AAAA ; les autres valeurs ne changent pas.
const lisible = (v: unknown): unknown => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dateFr(v) : v === undefined ? null : v);

// Feuille générique : toutes les colonnes, sans identifiants techniques, en-têtes lisibles.
function generique(nom: string, lignes: Ligne[], garder?: string[]): Feuille {
  const cles = lignes.length ? Object.keys(lignes[0]).filter((k) => (garder ? garder.includes(k) : !/(^id$|_id$)/.test(k))) : [];
  const entete = (k: string) => {
    const texte = k.replace(/_/g, " ");
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  };
  return {
    nom,
    entetes: cles.map(entete),
    lignes: lignes.map((l) => cles.map((k) => lisible(l[k]))),
  };
}

export async function construireExport(jeu: Jeu, supabase: SupabaseClient): Promise<{ nom: string; feuilles: Feuille[] }> {
  const date = new Date().toISOString().slice(0, 10);

  if (jeu === "ventes") {
    const [ventes, produits, commerciaux, tiers] = await Promise.all([
      toutes(supabase, "v_ventes", ["date_vente", "id"]),
      toutes(supabase, "produits"),
      toutes(supabase, "commerciaux"),
      toutes(supabase, "tiers"),
    ]);
    const p = dictionnaire(produits), c = dictionnaire(commerciaux), t = dictionnaire(tiers);
    const lignes = ventes.map((v) => ({
      ...v,
      produit: p.get(String(v.produit_id)) ?? null,
      commercial: c.get(String(v.commercial_id)) ?? null,
      client: t.get(String(v.tiers_id)) ?? null,
    }));
    return {
      nom: `apig-ventes-${date}`,
      feuilles: [avecColonnes("Ventes", lignes, [
        ["date_vente", "Date"], ["lieu", "Lieu"], ["origine", "Origine"], ["produit", "Produit"],
        ["quantite", "Quantité"], ["prix_unitaire", "Prix unitaire"], ["remise_pct", "Remise %"],
        ["remise_fcfa", "Remise F CFA"], ["montant", "Montant"], ["commercial", "Commercial"],
        ["mode_paiement", "Mode de paiement"], ["client", "Client"], ["statut", "Statut"],
        ["motif_annulation", "Motif d'annulation"],
      ])],
    };
  }

  if (jeu === "depenses") {
    const [depenses, evenements] = await Promise.all([toutes(supabase, "depenses", ["date_depense", "id"]), toutes(supabase, "evenements")]);
    const e = dictionnaire(evenements);
    const lignes = depenses.map((d) => ({ ...d, lieu: e.get(String(d.evenement_id)) ?? null }));
    return {
      nom: `apig-depenses-${date}`,
      feuilles: [avecColonnes("Dépenses", lignes, [
        ["date_depense", "Date"], ["lieu", "Lieu"], ["motif", "Motif"], ["categorie", "Catégorie"],
        ["quantite", "Quantité"], ["prix_unitaire", "Prix unitaire"], ["montant", "Montant"],
        ["statut", "Statut"], ["motif_annulation", "Motif d'annulation"],
      ])],
    };
  }

  if (jeu === "depots") {
    const lignes = await toutes(supabase, "v_depots_lignes", ["date_remise", "id"]);
    return {
      nom: `apig-depot-vente-${date}`,
      feuilles: [avecColonnes("Dépôt-vente", lignes, [
        ["date_remise", "Date de remise"], ["tiers_nom", "Destinataire"], ["tiers_type", "Type"],
        ["produit_nom", "Produit"], ["quantite_confiee", "Confiée"], ["quantite_donnee", "Donnée"],
        ["quantite_vendue", "Vendue"], ["quantite_restituee", "Restituée"], ["quantite_a_payer", "À payer"],
        ["coefficient", "Coefficient"], ["prix_cession", "Prix de cession"], ["montant_du", "Montant dû"],
      ])],
    };
  }

  if (jeu === "stock") {
    const lignes = await toutes(supabase, "v_stock", ["evenement_id", "produit_id"]);
    return { nom: `apig-stock-${date}`, feuilles: [generique("Stock et production", lignes)] };
  }

  if (jeu === "primes") {
    const lignes = await toutes(supabase, "v_primes", ["annee", "evenement_id", "commercial_id"]);
    return { nom: `apig-primes-${date}`, feuilles: [generique("Primes", lignes)] };
  }

  if (jeu === "evenements") {
    const lignes = await toutes(supabase, "v_evenement_resume", ["id"]);
    return { nom: `apig-evenements-${date}`, feuilles: [generique("Événements", lignes)] };
  }

  if (jeu === "creances") {
    const [parametres, ventesCredit, reglementsCredit, depots, reglementsDepot, tiers] = await Promise.all([
      supabase.from("parametres").select("delai_credit_jours").limit(1).maybeSingle(),
      supabase.from("ventes").select("tiers_id, montant, date_vente").eq("mode_paiement", "credit").eq("statut", "actif"),
      supabase.from("reglements").select("tiers_id, montant, date_reglement").eq("origine", "credit").eq("statut", "actif"),
      supabase.from("v_depots_lignes").select("tiers_id, montant_du"),
      supabase.from("reglements").select("tiers_id, montant").eq("origine", "depot").eq("statut", "actif"),
      supabase.from("tiers").select("id, nom, telephone, type"),
    ]);
    const delai = Number(parametres.data?.delai_credit_jours ?? 30);
    const aujourdhui = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
    const nomsTiers = new Map((tiers.data ?? []).map((t) => [t.id as string, t as Ligne]));

    // Clients à crédit : même calcul que la page Créances (R12, R13).
    const clients = new Map<string, { du: number; recu: number; plusAncienne: string | null; dernier: string | null }>();
    const obtenir = (id: string) => {
      if (!clients.has(id)) clients.set(id, { du: 0, recu: 0, plusAncienne: null, dernier: null });
      return clients.get(id)!;
    };
    for (const v of (ventesCredit.data ?? []) as { tiers_id: string; montant: number | null; date_vente: string }[]) {
      const c = obtenir(v.tiers_id);
      c.du += Number(v.montant ?? 0);
      if (!c.plusAncienne || v.date_vente < c.plusAncienne) c.plusAncienne = v.date_vente;
    }
    for (const r of (reglementsCredit.data ?? []) as { tiers_id: string; montant: number | null; date_reglement: string }[]) {
      const c = obtenir(r.tiers_id);
      c.recu += Number(r.montant ?? 0);
      if (!c.dernier || r.date_reglement > c.dernier) c.dernier = r.date_reglement;
    }
    const lignesClients = [...clients.entries()]
      .map(([id, c]) => {
        const reste = c.du - c.recu;
        const retard = c.plusAncienne ? Math.floor((aujourdhui - new Date(c.plusAncienne + "T00:00:00Z").getTime()) / 86400000) - delai : null;
        return { id, reste, c, retard };
      })
      .filter((l) => l.reste > 1)
      .sort((a, b) => (b.retard ?? -999) - (a.retard ?? -999));
    const feuilleClients: Feuille = {
      nom: "Clients à crédit",
      entetes: ["Client", "Téléphone", "Total dû", "Total reçu", "Reste à payer", "% réglé", "Plus ancienne vente à crédit", "Dernier règlement", "Retard (jours)", "Action suggérée"],
      lignes: lignesClients.map((l) => [
        nomsTiers.get(l.id)?.nom ?? "Client",
        nomsTiers.get(l.id)?.telephone ?? null,
        Math.round(l.c.du),
        Math.round(l.c.recu),
        Math.round(l.reste),
        l.c.du > 0 ? Math.round(Math.min(100, (l.c.recu / l.c.du) * 100)) : 0,
        l.c.plusAncienne,
        l.c.dernier,
        l.retard === null ? null : Math.max(0, l.retard),
        libelleAlerte(l.retard ?? -999),
      ]),
    };

    // Dépôt-vente : reste par destinataire (R12).
    const dusDepot = new Map<string, number>();
    for (const d of (depots.data ?? []) as { tiers_id: string | null; montant_du: number | null }[]) {
      if (d.tiers_id) dusDepot.set(d.tiers_id, (dusDepot.get(d.tiers_id) ?? 0) + Number(d.montant_du ?? 0));
    }
    const recusDepot = new Map<string, number>();
    for (const r of (reglementsDepot.data ?? []) as { tiers_id: string | null; montant: number | null }[]) {
      if (r.tiers_id) recusDepot.set(r.tiers_id, (recusDepot.get(r.tiers_id) ?? 0) + Number(r.montant ?? 0));
    }
    const lignesDepots = [...dusDepot.entries()]
      .map(([id, du]) => ({ id, reste: du - (recusDepot.get(id) ?? 0) }))
      .filter((l) => l.reste > 1)
      .sort((a, b) => b.reste - a.reste);
    const feuilleDepots: Feuille = {
      nom: "Dépôt-vente",
      entetes: ["Destinataire", "Type", "Reste à payer"],
      lignes: lignesDepots.map((l) => [nomsTiers.get(l.id)?.nom ?? "Destinataire", nomsTiers.get(l.id)?.type ?? null, Math.round(l.reste)]),
    };

    const totalClients = lignesClients.reduce((s, l) => s + l.reste, 0);
    const totalDepots = lignesDepots.reduce((s, l) => s + l.reste, 0);
    return {
      nom: `apig-creances-${date}`,
      feuilles: [
        feuilleClients,
        feuilleDepots,
        {
          nom: "Synthèse",
          entetes: ["Élément", "Montant (F CFA)"],
          lignes: [
            ["Clients à crédit", Math.round(totalClients)],
            ["Dépôt-vente", Math.round(totalDepots)],
            ["Total des créances", Math.round(totalClients + totalDepots)],
          ],
        },
      ],
    };
  }

  if (jeu === "tableau") {
    const [ventes, depenses, evenements, primes, stock] = await Promise.all([
      supabase.from("ventes").select("date_vente, montant, evenement_id, produit_id, quantite, prix_unitaire, tiers_id, mode_paiement").eq("statut", "actif"),
      supabase.from("depenses").select("date_depense, montant, evenement_id").eq("statut", "actif"),
      supabase.from("evenements").select("id, nom, est_point_de_vente, taux_dime"),
      supabase.from("v_primes").select("evenement_id, annee, mois, prime"),
      supabase.from("v_stock").select("stock_restant"),
    ]);
    const ventesI = (ventes.data ?? []) as (VenteComplete & { tiers_id: string | null })[];
    const depensesI = (depenses.data ?? []) as DepenseI[];
    const evts = (evenements.data ?? []) as EvenementI[];
    const primesI = (primes.data ?? []) as PrimeI[];

    const periodes = [
      { titre: "Période A (2026)", debut: "2026-01-01", fin: "2026-12-31" },
      { titre: "Période B (2025)", debut: "2025-01-01", fin: "2025-12-31" },
    ];
    const resultats = periodes.map((p) => calculerResultats(p.debut, p.fin, ventesI, depensesI, evts, primesI));
    const comparaisons = periodes.map((p) => calculerIndicateurs(p.debut, p.fin, "total", ventesI, depensesI, evts, primesI, "").indicateurs);
    const pourcent = (n: number) => Math.round(n * 1000) / 10;

    const lignes: unknown[][] = [
      ["Chiffre d'affaires (F CFA)", ...resultats.map((r) => Math.round(r.ca))],
      ["Dépenses datées (F CFA)", ...resultats.map((r) => Math.round(r.depenses))],
      ["Bénéfice net (CA − dépenses)", ...resultats.map((r) => Math.round(r.benefice))],
      ["Primes commerciales (F CFA)", ...resultats.map((r) => Math.round(r.primes))],
      ["Bénéfice net après primes", ...resultats.map((r) => Math.round(r.beneficeApresPrimes))],
      ["Dîme (F CFA)", ...resultats.map((r) => Math.round(r.dime))],
      ["Marge nette (%)", ...comparaisons.map((c) => pourcent(c.margeNette))],
      ["Volume des ventes (unités vendues)", ...comparaisons.map((c) => Math.round(c.volume))],
      ["Nombre de ventes (lignes du journal)", ...comparaisons.map((c) => Math.round(c.nombreVentes))],
      ["Nombre de produits différents vendus", ...comparaisons.map((c) => Math.round(c.nombreProduits))],
      ["Valeur moyenne par vente (F CFA)", ...comparaisons.map((c) => Math.round(c.valeurMoyenneVente))],
      ["Prix moyen par unité vendue (F CFA)", ...comparaisons.map((c) => Math.round(c.prixMoyenUnite))],
      ["Lieux de vente actifs", ...comparaisons.map((c) => Math.round(c.lieuxActifs))],
      ["CA moyen par lieu actif (F CFA)", ...comparaisons.map((c) => Math.round(c.caMoyenLieu))],
      ["Ventes à crédit (F CFA)", ...comparaisons.map((c) => Math.round(c.ventesCredit))],
      ["Part des ventes à crédit dans le CA (%)", ...comparaisons.map((c) => pourcent(c.partCredit))],
    ];
    const stockRestant = ((stock.data ?? []) as { stock_restant: number }[]).reduce((s, l) => s + Number(l.stock_restant), 0);
    lignes.push(["Stock restant des événements (unités, à ce jour)", Math.round(stockRestant * 10) / 10, null]);

    return {
      nom: `apig-tableau-de-bord-${date}`,
      feuilles: [
        {
          nom: "Tableau de bord",
          entetes: ["Indicateur", ...periodes.map((p) => p.titre)],
          lignes: lignes.map((l) => [l[0], l[1], l[2] ?? null]),
        },
      ],
    };
  }

  if (jeu === "paie") {
    const paie = await chargerPaie(supabase);
    const collaborateurs = new Map(paie.collaborateurs.map((c) => [c.id, c.nom]));
    const mensuel = paie.lignes.map((l) => ({ ...l, mois_nom: MOIS[l.mois - 1], actif_txt: oui(l.actif) }));
    const dus: Ligne[] = paie.collaborateurs.map((c) => {
      const montants = paie.duParMois.get(c.id) ?? Array(12).fill(0);
      const ligne: Ligne = { nom: c.nom, parts: c.parts };
      MOIS.forEach((m, i) => (ligne[m] = Math.round(montants[i])));
      ligne.total = Math.round(montants.reduce((s, v) => s + v, 0));
      return ligne;
    });
    const versements = paie.versements.map((v) => ({
      ...v,
      collaborateur: collaborateurs.get(v.collaborateur_id) ?? null,
      mois_nom: MOIS[v.mois - 1],
    }));
    return {
      nom: `apig-paie-${paie.annee}-${date}`,
      feuilles: [
        avecColonnes("Paie mensuelle", mensuel, [
          ["mois_nom", "Mois"], ["actif_txt", "Mois actif"], ["resultatExploitation", "Résultat d'exploitation"],
          ["resultatAvantImpot", "Résultat avant impôt"], ["impot", "Impôt"], ["resultatNet", "Résultat net"],
          ["reserve", "Réserve légale"], ["epargne", "Épargne"], ["disponible", "Disponible"], ["enveloppe", "Enveloppe"],
        ]),
        {
          nom: "Dû par collaborateur",
          entetes: ["Nom", "Parts", ...MOIS, "Total"],
          lignes: dus.map((d) => ["nom", "parts", ...MOIS, "total"].map((k) => d[k] ?? null)),
        },
        avecColonnes("Versements", versements, [
          ["date_versement", "Date"], ["collaborateur", "Collaborateur"], ["mois_nom", "Mois concerné"], ["montant", "Montant"],
        ]),
      ],
    };
  }

  // Sauvegarde complète : chaque table brute, sans filtre, pour pouvoir tout reconstituer.
  const tables = [
    "entreprise", "parametres", "produits", "prix", "prix_evenement", "evenements", "baremes_prime",
    "productions", "primes_manuelles", "commerciaux", "tiers", "ventes", "depenses", "depots",
    "restitutions", "reglements", "collaborateurs", "versements", "charges", "charges_mensuelles", "audit_log",
  ];
  const contenus = await Promise.all(tables.map((t) => toutes(supabase, t)));
  return {
    nom: `apig-sauvegarde-${date}`,
    feuilles: tables.map((t, i) => {
      const lignes = contenus[i];
      const cles = lignes.length ? Object.keys(lignes[0]) : [];
      return { nom: t, entetes: cles, lignes: lignes.map((l) => cles.map((k) => (l[k] === undefined ? null : l[k]))) };
    }),
  };
}

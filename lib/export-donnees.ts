import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerPaie } from "@/lib/paie-donnees";
import type { Feuille } from "@/lib/xlsx";

// Jeux d'export et profils autorisés (cahier des charges, section 3 : la paie est réservée au gérant).
export const ROLES_PAR_JEU = {
  ventes: ["gerant", "comptable"],
  depenses: ["gerant", "comptable"],
  depots: ["gerant", "comptable"],
  stock: ["gerant", "comptable"],
  primes: ["gerant", "comptable"],
  evenements: ["gerant", "comptable"],
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
    lignes: lignes.map((l) => cols.map(([k]) => (l[k] === undefined ? null : l[k]))),
  };
}

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
    lignes: lignes.map((l) => cles.map((k) => (l[k] === undefined ? null : l[k]))),
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

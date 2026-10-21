import { dateFr } from "@/lib/dates";
// Contrôles de cohérence (cahier, M12). Calcul pur à partir des données chargées.

export type Gravite = "bloquant" | "surveiller";
export type LigneControle = { texte: string; href?: string };
export type Controle = { id: string; gravite: Gravite; libelle: string; lignes: LigneControle[] };

export type DonneesControles = {
  aujourdhui: string; // AAAA-MM-JJ
  delai: number;
  tiersNoms: Map<string, string>;
  evenementsNoms: Map<string, string>;
  evenementsAvecProduction: Set<string>;
  pointsDeVente: Set<string>;
  ventes: { id: string; date_vente: string | null; montant: number | null; prix_unitaire: number | null; evenement_id: string | null; produit_id: string | null; remise_pct: number | null; remise_fcfa: number | null; mode_paiement: string; tiers_id: string | null; quantite: number }[];
  depenses: { date_depense: string | null }[];
  reglements: { tiers_id: string | null; origine: string; montant: number; date_reglement: string | null }[];
  depots: { id: string; tiers_id: string; tiers_nom: string; produit_nom: string; date_remise: string; quantite_confiee: number | null; quantite_donnee: number; quantite_vendue: number; quantite_restituee: number; coefficient: number | null; prix_cession: number | null; montant_du: number | null; quantite_a_payer: number }[];
  stock: { evenement_id: string; evenement_nom: string; produit_nom: string; stock_restant: number }[];
  prix: { produit_id: string; date_effet: string }[];
};

const ouvrir = (dateMin: string | null, aujourdhui: string) => dateMin !== null && dateMin > aujourdhui;

export function calculerControles(d: DonneesControles): Controle[] {
  const controles: Controle[] = [];
  const ajouter = (c: Controle) => { if (c.lignes.length > 0) controles.push(c); };
  const nomTiers = (id: string | null) => (id ? d.tiersNoms.get(id) ?? "Tiers" : "—");
  const nomEvt = (id: string | null) => (id ? d.evenementsNoms.get(id) ?? "Événement" : "—");

  // ---- Bloquant : ce qui fausse les chiffres ----
  ajouter({
    id: "ventes-sans-prix", gravite: "bloquant", libelle: "Ventes sans prix (montant compté 0 F)",
    lignes: d.ventes.filter((v) => !v.prix_unitaire || Number(v.prix_unitaire) <= 0)
      .map((v) => ({ texte: `${dateFr(v.date_vente, "sans date")} · ${nomEvt(v.evenement_id)} · quantité ${v.quantite}`, href: "/ventes" })),
  });
  ajouter({
    id: "ventes-sans-produit", gravite: "bloquant", libelle: "Ventes : lignes sans produit",
    lignes: d.ventes.filter((v) => !v.produit_id).map((v) => ({ texte: `${dateFr(v.date_vente, "sans date")} · ${nomEvt(v.evenement_id)}`, href: "/ventes" })),
  });
  ajouter({
    id: "ventes-sans-date", gravite: "bloquant", libelle: "Ventes : lignes sans date",
    lignes: d.ventes.filter((v) => !v.date_vente).map((v) => ({ texte: `${nomEvt(v.evenement_id)} · quantité ${v.quantite}`, href: "/ventes" })),
  });
  ajouter({
    id: "ventes-sans-evenement", gravite: "bloquant", libelle: "Ventes : lignes sans événement ni point de vente",
    lignes: d.ventes.filter((v) => !v.evenement_id).map((v) => ({ texte: `${dateFr(v.date_vente, "sans date")}`, href: "/ventes" })),
  });
  ajouter({
    id: "stock-negatif", gravite: "bloquant", libelle: "Stock : stock restant négatif",
    lignes: d.stock.filter((s) => Number(s.stock_restant) < 0)
      .map((s) => ({ texte: `${s.evenement_nom} · ${s.produit_nom} : ${s.stock_restant}`, href: "/stock" })),
  });
  ajouter({
    id: "depot-depasse", gravite: "bloquant", libelle: "Dépôt-vente : vendu + restitué + donné supérieur à la quantité confiée",
    lignes: d.depots.filter((l) => l.quantite_vendue + l.quantite_restituee + l.quantite_donnee > Number(l.quantite_confiee ?? 0))
      .map((l) => ({ texte: `${l.tiers_nom} · ${l.produit_nom} (${dateFr(l.date_remise)})`, href: "/depot-vente" })),
  });
  ajouter({
    id: "depot-sans-quantite", gravite: "bloquant", libelle: "Dépôt-vente : lignes sans quantité confiée",
    lignes: d.depots.filter((l) => !(Number(l.quantite_confiee) > 0))
      .map((l) => ({ texte: `${l.tiers_nom} · ${l.produit_nom} (${dateFr(l.date_remise)})`, href: "/depot-vente" })),
  });
  ajouter({
    id: "depot-sans-coefficient", gravite: "bloquant", libelle: "Dépôt-vente : lignes sans coefficient de cession",
    lignes: d.depots.filter((l) => l.coefficient === null)
      .map((l) => ({ texte: `${l.tiers_nom} · ${l.produit_nom}`, href: "/depot-vente" })),
  });
  ajouter({
    id: "depot-montant-incoherent", gravite: "bloquant", libelle: "Dépôt-vente : montant dû incohérent avec la quantité et le prix de cession",
    lignes: d.depots.filter((l) => {
      if (l.prix_cession === null || l.montant_du === null) return false;
      const attendu = Math.max(0, Number(l.quantite_confiee ?? 0) - l.quantite_donnee - l.quantite_restituee) * Number(l.prix_cession);
      return Math.abs(attendu - Number(l.montant_du)) > 1;
    }).map((l) => ({ texte: `${l.tiers_nom} · ${l.produit_nom} (${dateFr(l.date_remise)})`, href: "/depot-vente" })),
  });

  // Règlements supérieurs au dû, par destinataire et par client.
  const soldeParTiers = (dus: Map<string, number>, reglements: { tiers_id: string | null; montant: number }[]) => {
    const recus = new Map<string, number>();
    for (const r of reglements) if (r.tiers_id) recus.set(r.tiers_id, (recus.get(r.tiers_id) ?? 0) + Number(r.montant));
    const restes = new Map<string, number>();
    for (const [id, du] of dus) restes.set(id, du - (recus.get(id) ?? 0));
    return restes;
  };
  const dusDepots = new Map<string, number>();
  for (const l of d.depots) dusDepots.set(l.tiers_id, (dusDepots.get(l.tiers_id) ?? 0) + Number(l.montant_du ?? 0));
  const dusCredits = new Map<string, number>();
  for (const v of d.ventes) if (v.mode_paiement === "credit" && v.tiers_id) dusCredits.set(v.tiers_id, (dusCredits.get(v.tiers_id) ?? 0) + Number(v.montant ?? 0));

  const restesDepots = soldeParTiers(dusDepots, d.reglements.filter((r) => r.origine === "depot"));
  const restesCredits = soldeParTiers(dusCredits, d.reglements.filter((r) => r.origine === "credit"));

  ajouter({
    id: "reglement-depot-trop", gravite: "bloquant", libelle: "Dépôt-vente : règlements supérieurs au dû",
    lignes: [...restesDepots].filter(([, r]) => r < -1).map(([id, r]) => ({ texte: `${nomTiers(id)} : trop perçu ${Math.round(-r)} F`, href: "/depot-vente" })),
  });
  ajouter({
    id: "reglement-credit-trop", gravite: "bloquant", libelle: "Crédits : règlements supérieurs au dû",
    lignes: [...restesCredits].filter(([, r]) => r < -1).map(([id, r]) => ({ texte: `${nomTiers(id)} : trop perçu ${Math.round(-r)} F`, href: "/creances" })),
  });

  // ---- À surveiller : ce qui demande une action sans fausser les totaux ----
  ajouter({
    id: "credit-sans-client", gravite: "surveiller", libelle: "Ventes à crédit sans nom de client",
    lignes: d.ventes.filter((v) => v.mode_paiement === "credit" && !v.tiers_id)
      .map((v) => ({ texte: `${dateFr(v.date_vente, "sans date")} · ${nomEvt(v.evenement_id)}`, href: "/ventes" })),
  });
  ajouter({
    id: "remise-double", gravite: "surveiller", libelle: "Ventes : remise en % et en F saisies ensemble",
    lignes: d.ventes.filter((v) => Number(v.remise_pct ?? 0) > 0 && Number(v.remise_fcfa ?? 0) > 0)
      .map((v) => ({ texte: `${dateFr(v.date_vente, "sans date")} · ${nomEvt(v.evenement_id)}`, href: "/ventes" })),
  });

  const datesFutures: LigneControle[] = [
    ...d.ventes.filter((v) => ouvrir(v.date_vente, d.aujourdhui)).map((v) => ({ texte: `Vente du ${dateFr(v.date_vente)}`, href: "/ventes" })),
    ...d.depenses.filter((x) => ouvrir(x.date_depense, d.aujourdhui)).map((x) => ({ texte: `Dépense du ${x.date_depense}`, href: "/ventes" })),
    ...d.depots.filter((l) => ouvrir(l.date_remise, d.aujourdhui)).map((l) => ({ texte: `Dépôt ${l.tiers_nom} du ${dateFr(l.date_remise)}`, href: "/depot-vente" })),
    ...d.reglements.filter((r) => ouvrir(r.date_reglement, d.aujourdhui)).map((r) => ({ texte: `Règlement du ${dateFr(r.date_reglement)}`, href: "/creances" })),
  ];
  ajouter({ id: "dates-futures", gravite: "surveiller", libelle: "Dates postérieures à aujourd'hui", lignes: datesFutures });

  // Doublons de lignes de dépôt (même destinataire, produit et date).
  const cles = new Map<string, number>();
  for (const l of d.depots) {
    const k = `${l.tiers_id}|${l.produit_nom}|${l.date_remise}`;
    cles.set(k, (cles.get(k) ?? 0) + 1);
  }
  ajouter({
    id: "depot-doublon", gravite: "surveiller", libelle: "Dépôt-vente : lignes en doublon (même destinataire, produit et date)",
    lignes: d.depots.filter((l) => (cles.get(`${l.tiers_id}|${l.produit_nom}|${l.date_remise}`) ?? 0) > 1)
      .map((l) => ({ texte: `${l.tiers_nom} · ${l.produit_nom} (${dateFr(l.date_remise)})`, href: "/depot-vente" })),
  });

  // Destinataires sans vente ni restitution.
  const activite = new Map<string, number>();
  for (const l of d.depots) activite.set(l.tiers_id, (activite.get(l.tiers_id) ?? 0) + l.quantite_vendue + l.quantite_restituee);
  ajouter({
    id: "destinataire-inactif", gravite: "surveiller", libelle: "Dépôt-vente : destinataires sans aucune vente ni restitution saisie",
    lignes: [...dusDepots.keys()].filter((id) => (activite.get(id) ?? 0) === 0)
      .map((id) => ({ texte: nomTiers(id), href: "/depot-vente" })),
  });

  // Doublons dans l'historique des prix.
  const prixCles = new Map<string, number>();
  for (const p of d.prix) prixCles.set(`${p.produit_id}|${p.date_effet}`, (prixCles.get(`${p.produit_id}|${p.date_effet}`) ?? 0) + 1);
  ajouter({
    id: "prix-doublon", gravite: "surveiller", libelle: "Historique des prix : doublons produit + date",
    lignes: [...prixCles].filter(([, n]) => n > 1).map(([k]) => ({ texte: `Produit ${k.split("|")[0].slice(0, 8)}… le ${k.split("|")[1]}`, href: "/ventes/nouvelle" })),
  });

  // Événements avec des ventes mais sans bloc de production.
  const evtAvecVentes = new Set(d.ventes.map((v) => v.evenement_id).filter((x): x is string => !!x));
  ajouter({
    id: "evenement-sans-production", gravite: "surveiller", libelle: "Événements sans bloc de production ni de stock",
    lignes: [...evtAvecVentes].filter((id) => !d.evenementsAvecProduction.has(id) && !d.pointsDeVente.has(id))
      .map((id) => ({ texte: nomEvt(id), href: "/stock" })),
  });

  // Restes à payer et retards.
  const reste = (restes: Map<string, number>, premiereDate: Map<string, string>, href: string, nature: string) => {
    const lignes: LigneControle[] = [];
    const retards: LigneControle[] = [];
    for (const [id, r] of restes) {
      if (r <= 1) continue;
      lignes.push({ texte: `${nomTiers(id)} : ${Math.round(r)} F`, href });
      const date = premiereDate.get(id);
      if (date) {
        const jours = Math.floor((Date.parse(d.aujourdhui) - Date.parse(date)) / 86400000) - d.delai;
        if (jours > 0) retards.push({ texte: `${nomTiers(id)} : retard ${jours} j`, href });
      }
    }
    return { lignes, retards, nature };
  };
  const premiereDepot = new Map<string, string>();
  for (const l of d.depots) {
    const p = premiereDepot.get(l.tiers_id);
    if (!p || l.date_remise < p) premiereDepot.set(l.tiers_id, l.date_remise);
  }
  const premiereCredit = new Map<string, string>();
  for (const v of d.ventes) {
    if (v.mode_paiement !== "credit" || !v.tiers_id || !v.date_vente) continue;
    const p = premiereCredit.get(v.tiers_id);
    if (!p || v.date_vente < p) premiereCredit.set(v.tiers_id, v.date_vente);
  }
  const rd = reste(restesDepots, premiereDepot, "/depot-vente", "dépôt");
  const rc = reste(restesCredits, premiereCredit, "/creances", "crédit");
  ajouter({ id: "depot-reste", gravite: "surveiller", libelle: "Dépôt-vente : destinataires avec un reste à payer", lignes: rd.lignes });
  ajouter({ id: "depot-retard", gravite: "surveiller", libelle: "Dépôt-vente : créanciers en retard de paiement", lignes: rd.retards });
  ajouter({ id: "credit-reste", gravite: "surveiller", libelle: "Crédits : clients avec un reste à payer", lignes: rc.lignes });
  ajouter({ id: "credit-retard", gravite: "surveiller", libelle: "Crédits : clients en retard de paiement", lignes: rc.retards });

  return controles;
}

export function resumeControles(controles: Controle[]) {
  return {
    bloquants: controles.filter((c) => c.gravite === "bloquant").reduce((s, c) => s + c.lignes.length, 0),
    surveiller: controles.filter((c) => c.gravite === "surveiller").reduce((s, c) => s + c.lignes.length, 0),
  };
}

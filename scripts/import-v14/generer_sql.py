"""
Génère le script SQL d'import du classeur APIG-PHARMA v14 (copie du 18/10/2026).
Usage : python3 generer_sql.py <classeur.xlsx> <sortie.sql>
Le script produit une seule transaction à coller dans le SQL Editor de Supabase
(base vide ou presque). Les lignes exclues sont listées en commentaire en tête.
"""
import sys, datetime, collections
import openpyxl

SRC, OUT = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
R = lambda s: list(wb[s].iter_rows(values_only=True))

def q(v):
    """Littéral SQL."""
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(float(v)) if isinstance(v, float) else str(v)
    if isinstance(v, datetime.datetime):
        return "'" + v.date().isoformat() + "'"
    return "'" + str(v).replace("'", "''").strip() + "'"

def num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None

out = []
exclus = []
w = out.append

# ---------- Entreprise, paramètres ----------
bu = R("Bulletins de paie")
ident = {str(r[0]).strip(): r[1] for r in bu if r and r[0]}
pa = R("Paie & épargne")
param = {str(r[0]).strip(): r[1] for r in pa if r and r[0] and len(r) > 1}
dv = R("Dépôt-vente")
coef_pharm = num(dv[2][1]) or 1.51
coef_pers = num(dv[2][3]) or 1.2

# ---------- Catalogue ----------
cat = R("Catalogue & prix")
produits = []
for r in cat[4:]:
    if not r[1] or str(r[1]).startswith("Coefficient") or str(r[1]).startswith("Ne laissez"):
        break
    produits.append({"nom": str(r[1]).strip(), "prix": num(r[2]) or 0, "coef": num(r[3]) or 1.51})
noms_produits = {p["nom"] for p in produits}
prix_hist = []
for r in cat[4:]:
    if r[6] and r[7] and r[8] is not None:
        prix_hist.append((str(r[6]).strip(), r[7], num(r[8])))
prix_evt = []
for r in cat[4:]:
    if r[10] and r[11] and r[12]:
        prix_evt.append((str(r[10]).strip(), str(r[11]).strip(), r[12], num(r[13])))

# ---------- Événements ----------
ev = R("Événements, stock & primes")
evenements = []
for r in ev[4:]:
    if r[1] in (None, "") or str(r[1]).strip() in ("Total",) or r[0] in (None, "Total"):
        if r[1] in (None, ""):
            continue
    nom = str(r[1]).strip()
    if nom in ("Total",):
        continue
    if nom in [e["nom"] for e in evenements]:
        continue
    evenements.append({"nom": nom, "nb": int(num(r[4]) or 0), "dime": num(r[5]) if num(r[5]) is not None else 0.10,
                       "pdv": nom == "POINT DE VENTE"})
    if len(evenements) >= 60:
        break
evenements = [e for e in evenements if e["nom"] not in ("", "None")]
noms_evt = {e["nom"] for e in evenements}

# Production : blocs nommés (colonne P = nom d'événement, Q = produit, S = quantité, T = dons, AC = stock compté)
prod = []
for i, r in enumerate(ev[4:], 5):
    e, p = r[15], r[16]
    if not e or not p or str(e).strip() in ("Total", "-"):
        continue
    e, p = str(e).strip(), str(p).strip()
    if e not in noms_evt:
        exclus.append(f"Événements ligne {i} : bloc « {e} » inconnu, non importé")
        continue
    if p in ("Total", "-") or p not in noms_produits:
        exclus.append(f"Événements ligne {i} : produit « {p} » non reconnu, non importé")
        continue
    prod.append((e, p, num(r[18]) or 0, num(r[19]) or 0, num(r[28])))

# Journal manuel des primes (colonnes AG à AJ, lignes 6 à 20)
primes_manuelles = []
for r in ev[5:21]:
    if r[32] in (None, "") or r[35] in (None, ""):
        continue
    primes_manuelles.append((r[32], str(r[33]).strip(), str(r[34]).strip(), num(r[35])))

# Barèmes : standard (colonnes BA-BB) et propres à un événement (colonnes BA-BF)
bareme_std = []
for r in ev[5:20]:
    if isinstance(r[49], (int, float)) and isinstance(r[50], (int, float)):
        bareme_std.append((r[49], r[50]))
bareme_evt = []
for r in ev[5:60]:
    if r[52] and isinstance(r[56], (int, float)) and isinstance(r[57], (int, float)):
        bareme_evt.append((str(r[52]).strip(), r[56], r[57]))

# ---------- Commerciaux ----------
commerciaux = []
for r in ev[5:20]:
    if r[47] and str(r[47]).strip() not in ("Nom",):
        commerciaux.append(str(r[47]).strip())
for r in ev[5:21]:
    if r[34]: commerciaux.append(str(r[34]).strip())
for r in R("Ventes")[4:700]:
    if r[8]: commerciaux.append(str(r[8]).strip())
commerciaux = sorted(set(commerciaux))

# ---------- Ventes ----------
ventes = []
for i, r in enumerate(R("Ventes")[4:700], 5):
    if r[0] is None:
        continue
    if not r[3]:
        exclus.append(f"Ventes ligne {i} : quantité vide (à confirmer dans le classeur), non importée")
        continue
    mode = "credit" if str(r[10] or "").strip().lower().startswith("cr") else "comptant"
    ventes.append((r[0], str(r[1]).strip(), str(r[2]).strip(), num(r[3]), num(r[4]),
                   num(r[5]), num(r[6]), str(r[8]).strip() if r[8] else None,
                   str(r[9]).strip() if r[9] else None, mode))

# ---------- Dépenses ----------
CAT = {
    "Achat matières premières / conditionnement": "matieres_premieres_conditionnement",
    "Transport": "transport",
    "Rémunération / Intéressement": "remuneration_interessement",
    "Communication / Impression": "communication_impression",
    "Fournitures": "fournitures",
    "Autre": "autre",
}
depenses = []
for i, r in enumerate(R("Dépenses")[4:400], 5):
    if r[0] is None:
        continue
    cat_ = CAT.get(str(r[3]).strip())
    if not cat_:
        exclus.append(f"Dépenses ligne {i} : catégorie « {r[3]} » inconnue, non importée")
        continue
    depenses.append((r[0], str(r[1]).strip(), str(r[2]).strip(), cat_, num(r[4]), num(r[5])))

# ---------- Dépôt-vente ----------
EXCLUS_DEPOT = set(range(12, 18))  # Madeleine SAWADOGO, lignes 12 à 17 (décision du 18/10/2026)
TYPES = {"Pharmacie": "pharmacie", "Personnel": "personnel"}
depots = []
tiers_depot = {}  # nom -> (type, téléphone)
for i, r in enumerate(dv[4:400], 5):
    if r[0] is None or r[1] in (None, ""):
        continue
    if i in EXCLUS_DEPOT:
        exclus.append(f"Dépôt-vente ligne {i} : {r[1]} (quantité confiée non vérifiée), non importée")
        continue
    typ = TYPES.get(str(r[2]).strip(), "personnel")
    tiers_depot.setdefault(str(r[1]).strip(), typ)
    vendu = num(dv[i - 1][44]) or 0
    depots.append((r[0], str(r[1]).strip(), str(r[3]).strip(), num(r[4]) or 0, num(r[5]) or 0, vendu, i))

# Règlements dépôt-vente (colonnes M à P, lignes 5 à 16)
reglements_depot = []
for r in dv[4:16]:
    if r[12] and r[13] and num(r[14]):
        reglements_depot.append((r[12], str(r[13]).strip(), num(r[14])))
        if r[15]:
            tiers_depot.setdefault(str(r[13]).strip(), "personnel")

# Téléphones des destinataires (colonne P)
telephones = {}
for r in dv[4:16]:
    if r[13] and r[15]:
        telephones[str(r[13]).strip()] = str(int(r[15])) if isinstance(r[15], (int, float)) else str(r[15]).strip()

# Restitutions (colonnes BI à BM, lignes 5 à 13)
restitutions = []
for r in dv[4:13]:
    if r[60] and r[61] and r[64]:
        restitutions.append((r[60], str(r[61]).strip(), str(r[62]).strip(), r[63], num(r[64])))

# ---------- Créances : règlements clients (colonnes AE à AH, lignes 10 et suivantes) ----------
cr = R("Créances & relances")
reglements_clients = []
tiers_clients = set()
for r in cr[9:]:
    if r[30] and r[31] and num(r[32]):
        reglements_clients.append((r[30], str(r[31]).strip(), num(r[32])))
for r in R("Ventes")[4:700]:
    if r[9] and str(r[9]).strip() and r[0]:
        tiers_clients.add(str(r[9]).strip())
for r in cr[9:]:
    if r[31]:
        tiers_clients.add(str(r[31]).strip())
        if r[33]:
            telephones.setdefault(str(r[31]).strip(), str(int(r[33])) if isinstance(r[33], (int, float)) else str(r[33]).strip())

# Contrôle : un même nom ne peut pas être à la fois client et destinataire de dépôt
conflits = set(tiers_depot) & tiers_clients
if conflits:
    raise SystemExit(f"Conflit de noms client / dépôt : {conflits}")

# ---------- Collaborateurs ----------
fiche = {str(r[0]).strip(): r for r in bu[29:45] if r and r[0] and r[1]}
collaborateurs = []
# Lit la liste « Collaborateur / Parts » jusqu'à la ligne TOTAL (ignore les lignes vides ou sans nombre de parts).
for r in pa[73:88]:
    if not r[0] or str(r[0]).strip().upper().startswith("TOTAL"):
        if r[0] and str(r[0]).strip().upper().startswith("TOTAL"):
            break
        continue
    if str(r[0]).strip() in ("Collaborateur",) or num(r[1]) is None:
        continue
    nom = str(r[0]).strip()
    f = fiche.get(nom)
    collaborateurs.append((nom, num(r[1]), f[1] if f else None, f[2] if f else None, f[4] if f else None))

# ---------- Charges ----------
# Lignes de charges : 21 à 29 (fixes) et 35 à 40 (non fixes). Les totaux (lignes 30 et 41) sont exclus.
LIGNES_CHARGES = [(i, "fixe") for i in range(21, 30)] + [(i, "non_fixe") for i in range(35, 41)]
charges = []
charges_mensuelles = []
for i, nature in LIGNES_CHARGES:
    r = pa[i - 1]
    if not r[0] or str(r[0]).strip().startswith(("Total", "Ne ", "Mois", "Charge")):
        continue
    charges.append((str(r[0]).strip(), nature, num(r[1]), i))
    for m in range(12):
        v = r[2 + m] if len(r) > 2 + m else None
        if isinstance(v, (int, float)):
            charges_mensuelles.append((i, m + 1, num(v)))

# ---------- Écriture du script ----------
w("-- =====================================================================")
w("-- Import du classeur APIG-PHARMA : " + SRC.split("/")[-1])
w("-- À coller UNE SEULE FOIS dans le SQL Editor de Supabase, base vide.")
w("-- Tout ou rien : une seule transaction.")
w("-- =====================================================================")
w("-- Lignes non importées (à traiter dans le classeur) :")
for e in exclus:
    w(f"--   - {e}")
w("")
w("begin;")
w("select set_config('app.import_mode', 'on', true);  -- garde les prix du classeur (R1)")
w("")
w("-- Entreprise et paramètres")
w("update entreprise set raison_sociale = " + q(ident.get("Raison sociale")) +
  ", adresse = " + q(ident.get("Adresse (quartier, ville…)") or ident.get("Adresse (quartier, ville)")) +
  ", telephone = " + q(ident.get("Téléphone / e-mail")) +
  ", rccm = " + q(ident.get("RCCM")) +
  ", signataire = " + q(ident.get("Signataire : nom (facultatif)") or ident.get("Signataire : nom (facult.)")) +
  ", signataire_qualite = " + q(ident.get("Signataire : qualité")) +
  " where id = true;")
w("update parametres set"
  f" annee_reference = {int(param.get('Année de référence (réglée dans le Tableau de bord)') or 2026)},"
  f" taux_impot = {num(param.get('Taux d’impôt sur les bénéfices (%)')) or 0.25},"
  f" reserve_legale_taux = {num(param.get('Réserve légale : part prélevée sur le résultat net (%)')) or 0.10},"
  f" reserve_plafond_taux = {num(param.get('Réserve légale : plafond (% du capital)')) or 0.20},"
  f" capital_social = {num(param.get('Capital social de la SARL (F CFA)')) or 1500000},"
  f" reserve_deja_constituee = 0,"
  f" epargne_taux = {num(param.get('Épargne / réserve facultative (%)')) or 0.10},"
  f" part_distribuee = {num(param.get('Part du disponible distribuée aux collaborateurs (%)')) or 0.50},"
  f" coef_pharmacie = {coef_pharm}, coef_personnel = {coef_pers},"
  f" deduire_dime = true, reporter_deficits = true, reintegrer_remunerations = true,"
  f" dime_defaut = 0.10, delai_paiement_jours = 30, delai_credit_jours = 30,"
  f" seuil_relance_ferme = 30, seuil_urgent = 60 where id = true;")
w("")
w("-- Commerciaux")
for c in commerciaux:
    w(f"insert into commerciaux (nom) values ({q(c)}) on conflict do nothing;")
w("")
w("-- Événements (le lieu POINT DE VENTE existe déjà)")
for e in evenements:
    if e["pdv"]:
        continue
    w(f"insert into evenements (nom, nb_beneficiaires, taux_dime) values ({q(e['nom'])}, {e['nb']}, {e['dime']});")
w("")
w("-- Catalogue, coefficients et prix")
for p in produits:
    w(f"insert into produits (nom, prix_base) values ({q(p['nom'])}, {p['prix']});")
    w(f"insert into produit_cession (produit_id, coefficient) select id, {p['coef']} from produits where nom = {q(p['nom'])};")
for nom, date, prix in prix_hist:
    w(f"insert into prix (produit_id, date_effet, prix_unitaire) select id, {q(date)}, {prix} from produits where nom = {q(nom)};")
for prod_, evt, date, prix in prix_evt:
    w(f"insert into prix_evenement (produit_id, evenement_id, date_effet, prix_unitaire) "
      f"select p.id, e.id, {q(date)}, {prix} from produits p, evenements e where p.nom = {q(prod_)} and e.nom = {q(evt)};")
w("")
w("-- Clients et destinataires de dépôt")
for nom in sorted(tiers_clients):
    w(f"insert into tiers (nom, telephone, type) values ({q(nom)}, {q(telephones.get(nom))}, 'client');")
for nom in sorted(tiers_depot):
    w(f"insert into tiers (nom, telephone, type) values ({q(nom)}, {q(telephones.get(nom))}, '{tiers_depot[nom]}');")
w("")
w("-- Ventes (prix et montant du classeur, dates et lieux repris tels quels)")
for (d, lieu, prod_, qte, pu, rp, rf, com, cli, mode) in ventes:
    w("insert into ventes (date_vente, evenement_id, produit_id, quantite, prix_unitaire, remise_pct, remise_fcfa, "
      "commercial_id, tiers_id, mode_paiement, statut) select "
      f"{q(d)}, e.id, p.id, {qte}, {pu if pu is not None else 'null'}, {rp if rp is not None else 'null'}, "
      f"{rf if rf is not None else 'null'}, "
      f"(select id from commerciaux where nom = {q(com)}), "
      f"(select id from tiers where nom = {q(cli)}), '{mode}', 'actif' "
      f"from evenements e, produits p where e.nom = {q(lieu)} and p.nom = {q(prod_)};")
w("")
w("-- Dépenses")
for (d, lieu, motif, cat_, qte, pu) in depenses:
    w("insert into depenses (date_depense, evenement_id, motif, categorie, quantite, prix_unitaire, statut) select "
      f"{q(d)}, e.id, {q(motif)}, '{cat_}', {qte}, {pu}, 'actif' from evenements e where e.nom = {q(lieu)};")
w("")
w("-- Production et stock par événement")
for (e, p, qp, dons, stock) in prod:
    w("insert into productions (evenement_id, produit_id, quantite_produite, dons, stock_physique_compte) select "
      f"ev.id, pr.id, {qp}, {dons}, {stock if stock is not None else 'null'} "
      f"from evenements ev, produits pr where ev.nom = {q(e)} and pr.nom = {q(p)};")
w("")
w("-- Barèmes de primes")
for seuil, taux in bareme_std:
    w(f"insert into baremes_prime (evenement_id, seuil_ca, taux) values (null, {seuil}, {taux});")
for evt, seuil, taux in bareme_evt:
    w(f"insert into baremes_prime (evenement_id, seuil_ca, taux) select id, {seuil}, {taux} from evenements where nom = {q(evt)};")
w("")
w("-- Journal manuel des primes")
for (d, evt, com, montant) in primes_manuelles:
    w("insert into primes_manuelles (date_saisie, evenement_id, commercial_id, montant_vendu) select "
      f"{q(d)}, e.id, c.id, {montant} from evenements e, commerciaux c where e.nom = {q(evt)} and c.nom = {q(com)};")
w("")
w("-- Dépôt-vente : remises, ventes par ligne et restitutions")
for (d, dest, prod_, confie, donne, vendu, ligne) in depots:
    w("insert into depots (date_remise, tiers_id, produit_id, quantite_confiee, quantite_donnee, quantite_vendue) select "
      f"{q(d)}, t.id, p.id, {confie}, {donne}, {vendu} from tiers t, produits p "
      f"where t.nom = {q(dest)} and p.nom = {q(prod_)};")
for (d, dest, prod_, dremise, qte) in restitutions:
    w("insert into restitutions (depot_id, date_restitution, quantite) select dp.id, "
      f"{q(d)}, {qte} from depots dp join tiers t on t.id = dp.tiers_id join produits p on p.id = dp.produit_id "
      f"where t.nom = {q(dest)} and p.nom = {q(prod_)} and dp.date_remise = {q(dremise)} limit 1;")
w("")
w("-- Règlements : destinataires de dépôt et clients à crédit")
for (d, dest, montant) in reglements_depot:
    w("insert into reglements (date_reglement, tiers_id, montant, origine) select "
      f"{q(d)}, t.id, {montant}, 'depot' from tiers t where t.nom = {q(dest)};")
for (d, cli, montant) in reglements_clients:
    w("insert into reglements (date_reglement, tiers_id, montant, origine) select "
      f"{q(d)}, t.id, {montant}, 'credit' from tiers t where t.nom = {q(cli)};")
w("")
w("-- Paie : collaborateurs, charges (les parts sont celles du classeur au 18/10/2026)")
for (nom, parts, matricule, fonction, mode) in collaborateurs:
    w("insert into collaborateurs (nom, parts, matricule, fonction, mode_paiement) values "
      f"({q(nom)}, {parts}, {q(matricule)}, {q(fonction)}, {q(mode)});")
for (libelle, nature, habituel, ordre) in charges:
    w("insert into charges (libelle, nature, montant_habituel, ordre) values "
      f"({q(libelle)}, '{nature}', {habituel if habituel is not None else 'null'}, {ordre});")
for (ligne, mois, montant) in charges_mensuelles:
    w("insert into charges_mensuelles (charge_id, annee, mois, montant_reel) select c.id, 2026, "
      f"{mois}, {montant} from charges c where c.libelle = (select libelle from charges where ordre = {ligne});")
w("")
w("commit;")

open(OUT, "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"ventes={len(ventes)} depenses={len(depenses)} depots={len(depots)} restitutions={len(restitutions)} "
      f"reglements_depot={len(reglements_depot)} reglements_clients={len(reglements_clients)} "
      f"production={len(prod)} primes={len(primes_manuelles)} collaborateurs={len(collaborateurs)} "
      f"charges={len(charges)} charges_mens={len(charges_mensuelles)} exclus={len(exclus)}")
for e in exclus:
    print("  exclu:", e)

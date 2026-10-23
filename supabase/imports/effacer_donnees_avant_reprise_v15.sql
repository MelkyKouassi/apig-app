-- =====================================================================
-- EFFACEMENT des données de gestion avant la reprise du classeur v15.
-- Conserve : comptes et rôles (profiles), commerciaux, entreprise, paramètres,
-- journal d'audit. Efface : ventes, dépenses, dépôts, règlements, paie, produits,
-- événements (sauf POINT DE VENTE), clients, bulletins et versements.
-- À lancer UNE SEULE FOIS, après une sauvegarde Excel (Exports → Sauvegarde).
-- =====================================================================
begin;

-- Liens compte ↔ collaborateur gardés pour être rétablis après la reprise
drop table if exists sauvegarde_liens_collaborateurs;
create table sauvegarde_liens_collaborateurs as
  select nom, user_id from collaborateurs where user_id is not null;

-- Les interdictions de suppression sont levées le temps de l'effacement (la trace reste dans le journal d'audit)
alter table ventes disable trigger ventes_nodelete_trg;
alter table depenses disable trigger depenses_nodelete_trg;
alter table reglements disable trigger reglements_nodelete_trg;
alter table bulletins disable trigger bulletins_nodelete_trg;
alter table retenues_bulletin disable trigger retenues_nodelete_trg;

delete from bulletins;
delete from retenues_bulletin;
delete from versements;
delete from charges_mensuelles;
delete from charges;
delete from primes_manuelles;
delete from baremes_prime;
delete from productions;
delete from evenement_commerciaux;
delete from prix_evenement;
delete from prix;
delete from produit_cession;
delete from restitutions;
delete from reglements;
delete from depots;
delete from ventes;
delete from depenses;
delete from tiers;
delete from produits;
delete from evenements where not est_point_de_vente;
delete from collaborateurs;

alter table ventes enable trigger ventes_nodelete_trg;
alter table depenses enable trigger depenses_nodelete_trg;
alter table reglements enable trigger reglements_nodelete_trg;
alter table bulletins enable trigger bulletins_nodelete_trg;
alter table retenues_bulletin enable trigger retenues_nodelete_trg;

commit;

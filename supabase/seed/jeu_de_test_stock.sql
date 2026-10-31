-- =====================================================================
-- JEU DE TEST — stock de départ, validations, mouvements, clients.
-- À exécuter UNIQUEMENT sur un projet de TEST Supabase, jamais sur la base réelle :
-- les ventes ne peuvent pas être supprimées dans l'application.
-- Tous les noms commencent par « TEST ». Les comptes de connexion sont à relier
-- ensuite dans Administration (Lien compte) après création des utilisateurs de test.
-- =====================================================================

-- 1) Lieux de test
insert into evenements (nom, est_point_de_vente, nb_beneficiaires, taux_dime, date_debut, date_fin)
values ('TEST Lieu A — Marché', false, 1, 0.10, current_date - 1, current_date + 1),
       ('TEST Lieu B — Foire', false, 1, 0.10, current_date - 1, current_date + 1);

-- 2) Commerciaux de test (sans compte pour l'instant)
insert into commerciaux (nom, actif) values
  ('TEST Commercial 1 — Aya', true),
  ('TEST Commercial 2 — Kofi', true),
  ('TEST Chef — Mariam', true);

-- 3) Produits de test et production
insert into produits (nom, prix_base, actif) values
  ('TEST Produit A', 1000, true),
  ('TEST Produit B', 2500, true);

insert into productions (evenement_id, produit_id, quantite_produite, dons)
select e.id, p.id, 100, 0
  from evenements e cross join produits p
 where e.nom like 'TEST Lieu%' and p.nom like 'TEST Produit%';

-- 4) Affectations : tous les commerciaux de test aux deux lieux ; Mariam est chef du Lieu A
insert into evenement_commerciaux (evenement_id, commercial_id, est_chef)
select e.id, c.id, (c.nom like 'TEST Chef%' and e.nom like 'TEST Lieu A%')
  from evenements e cross join commerciaux c
 where e.nom like 'TEST Lieu%' and c.nom like 'TEST %'
on conflict (evenement_id, commercial_id) do update set est_chef = excluded.est_chef;

-- 5) Stock de départ
--    Aya au Lieu A : 20 A, 10 B      Kofi au Lieu A : 15 A      Aya au Lieu B : rien encore
insert into stock_depart (evenement_id, commercial_id, produit_id, quantite)
select e.id, c.id, p.id, v.q
  from (values
    ('TEST Lieu A — Marché', 'TEST Commercial 1 — Aya', 'TEST Produit A', 20),
    ('TEST Lieu A — Marché', 'TEST Commercial 1 — Aya', 'TEST Produit B', 10),
    ('TEST Lieu A — Marché', 'TEST Commercial 2 — Kofi', 'TEST Produit A', 15)
  ) as v(lieu, com, prod, q)
  join evenements e on e.nom = v.lieu
  join commerciaux c on c.nom = v.com
  join produits p on p.nom = v.prod;

-- 6) Validations (insérées directement pour le test)
--    Aya / Lieu A : validé ET confirmé (peut vendre)
--    Kofi / Lieu A : validé, pas encore confirmé (ne peut pas vendre)
insert into validation_stock (evenement_id, commercial_id, valide_par, valide_le, confirme_le)
select e.id, c.id, null, now() - interval '2 hours',
       case when c.nom like '%Aya' then now() - interval '1 hour' end
  from evenements e join commerciaux c on c.nom in ('TEST Commercial 1 — Aya', 'TEST Commercial 2 — Kofi')
 where e.nom = 'TEST Lieu A — Marché';

-- 7 bis) Clients de test (avant les ventes à crédit), avec différents formats de téléphone
insert into tiers (nom, telephone, type) values
  ('TEST Client 1', '+225 0700000001', 'client'),
  ('TEST Client 2 (ancien format)', '0700000002', 'client'),
  ('TEST Client étranger', '+33 612345678', 'client'),
  ('TEST Client sans téléphone', null, 'client'),
  ('TEST Pharmacie', '+225 0700000003', 'pharmacie');

-- 7) Ventes de test (Aya, Lieu A) : 3 comptant + 1 à crédit
insert into ventes (date_vente, evenement_id, produit_id, quantite, commercial_id, mode_paiement, statut, tiers_id)
select current_date, e.id, p.id, v.q, c.id, v.mode::mode_paiement, 'actif'::statut_ligne,
       case when v.mode = 'credit' then t.id end
  from (values
    ('TEST Produit A', 2, 'comptant', null),
    ('TEST Produit B', 1, 'comptant', null),
    ('TEST Produit A', 3, 'comptant', null),
    ('TEST Produit A', 1, 'credit', 'TEST Client 1')
  ) as v(prod, q, mode, client)
  join evenements e on e.nom = 'TEST Lieu A — Marché'
  join commerciaux c on c.nom = 'TEST Commercial 1 — Aya'
  join produits p on p.nom = v.prod
  left join tiers t on t.nom = v.client;

-- 8) Mouvements (Aya, Lieu A) : restitution de 2 A (effet immédiat) ; complément de 5 B en attente
insert into mouvements_stock_lieu (evenement_id, commercial_id, produit_id, type, quantite, statut, valide_le)
select e.id, c.id, p.id, m.type, m.q, m.statut, case when m.statut = 'valide' then now() end
  from (values
    ('restitution', 'TEST Produit A', 2, 'valide'),
    ('complement', 'TEST Produit B', 5, 'en_attente')
  ) as m(type, prod, q, statut)
  join evenements e on e.nom = 'TEST Lieu A — Marché'
  join commerciaux c on c.nom = 'TEST Commercial 1 — Aya'
  join produits p on p.nom = m.prod;

-- Contrôle : ce que le jeu de test doit donner
select 'lieux' as quoi, count(*) from evenements where nom like 'TEST Lieu%'
union all select 'commerciaux', count(*) from commerciaux where nom like 'TEST %'
union all select 'stocks de départ', count(*) from stock_depart s join evenements e on e.id = s.evenement_id where e.nom like 'TEST Lieu%'
union all select 'validations', count(*) from validation_stock v join evenements e on e.id = v.evenement_id where e.nom like 'TEST Lieu%'
union all select 'ventes', count(*) from ventes v join evenements e on e.id = v.evenement_id where e.nom like 'TEST Lieu%'
union all select 'mouvements', count(*) from mouvements_stock_lieu m join evenements e on e.id = m.evenement_id where e.nom like 'TEST Lieu%'
union all select 'clients de test', count(*) from tiers where nom like 'TEST %';

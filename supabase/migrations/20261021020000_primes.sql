-- =====================================================================
-- Primes commerciales (M8, règle R7).
-- 1) Dates de début et de fin des événements.
-- 2) Vue des primes par commercial et par événement (ou par année, pour le point de vente).
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

alter table evenements add column if not exists date_debut date;
alter table evenements add column if not exists date_fin date;

-- Dates connues à ce jour (feuille « Événements, stock & primes » du classeur).
update evenements set date_debut = '2026-09-13', date_fin = '2026-09-19'
where lower(nom) = 'sortie detente niapidou';

-- Total vendu par commercial et par événement : ventes actives + anciennes saisies manuelles.
-- Le taux est celui du palier le plus élevé atteint, dans le barème de l'événement s'il existe,
-- sinon dans le barème standard. Prime = total × taux.
-- Rattachement : année et mois de la fin de l'événement ; pour le point de vente, année de chaque vente.
create or replace view v_primes with (security_invoker = true) as
with cumul as (
  select v.commercial_id, v.evenement_id, v.date_vente as date_ref, v.montant as montant
  from ventes v
  where v.statut = 'actif' and v.commercial_id is not null
  union all
  select pm.commercial_id, pm.evenement_id, pm.date_saisie, pm.montant_vendu
  from primes_manuelles pm
),
regroupe as (
  select c.commercial_id, c.evenement_id,
    case when e.est_point_de_vente then extract(year from c.date_ref)
         else extract(year from coalesce(e.date_fin, (select max(v.date_vente) from ventes v where v.evenement_id = e.id), current_date))
    end::int as annee,
    case when e.est_point_de_vente then null
         else extract(month from coalesce(e.date_fin, (select max(v.date_vente) from ventes v where v.evenement_id = e.id), current_date))::int
    end as mois,
    sum(c.montant) as total_vendu
  from cumul c
  join evenements e on e.id = c.evenement_id
  where c.date_ref is not null or not e.est_point_de_vente
  group by 1, 2, 3, 4
)
select
  r.commercial_id,
  cm.nom as commercial_nom,
  r.evenement_id,
  e.nom as evenement_nom,
  r.annee,
  r.mois,
  r.total_vendu,
  coalesce(
    (select b.taux from baremes_prime b
      where b.evenement_id = r.evenement_id and b.seuil_ca <= r.total_vendu
      order by b.seuil_ca desc limit 1),
    case when exists (select 1 from baremes_prime b2 where b2.evenement_id = r.evenement_id) then 0 end,
    (select b.taux from baremes_prime b
      where b.evenement_id is null and b.seuil_ca <= r.total_vendu
      order by b.seuil_ca desc limit 1),
    0) as taux,
  r.total_vendu * coalesce(
    (select b.taux from baremes_prime b
      where b.evenement_id = r.evenement_id and b.seuil_ca <= r.total_vendu
      order by b.seuil_ca desc limit 1),
    case when exists (select 1 from baremes_prime b2 where b2.evenement_id = r.evenement_id) then 0 end,
    (select b.taux from baremes_prime b
      where b.evenement_id is null and b.seuil_ca <= r.total_vendu
      order by b.seuil_ca desc limit 1),
    0) as prime
from regroupe r
join commerciaux cm on cm.id = r.commercial_id
join evenements e on e.id = r.evenement_id;

-- =====================================================================
-- Dépôt-vente : coefficients par type de destinataire (R9), prix de
-- détail à une date, et bilan par ligne de dépôt (R10, R11).
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

create table if not exists coefficients_cession (
  type_tiers  type_tiers primary key,
  coefficient numeric not null check (coefficient > 0),
  updated_at  timestamptz not null default now()
);

insert into coefficients_cession (type_tiers, coefficient)
values ('pharmacie', 1.51), ('personnel', 1.2)
on conflict (type_tiers) do nothing;

alter table coefficients_cession enable row level security;

drop policy if exists coeff_gerant on coefficients_cession;
create policy coeff_gerant on coefficients_cession for all
  using (is_role('gerant'::app_role)) with check (is_role('gerant'::app_role));

drop policy if exists coeff_lecture on coefficients_cession;
create policy coeff_lecture on coefficients_cession for select
  using (is_role('gerant'::app_role, 'comptable'::app_role));

-- Prix de détail à une date (sans événement) : tarif à la date, sinon prix de base.
create or replace function prix_detail_a_date(p_produit uuid, p_date date)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(
    (select pr.prix_unitaire from prix pr
      where pr.produit_id = p_produit and pr.date_effet <= p_date
      order by pr.date_effet desc limit 1),
    (select p.prix_base from produits p where p.id = p_produit),
    0)
$$;

-- Bilan par ligne de dépôt.
create or replace view v_depots_lignes with (security_invoker = true) as
select
  d.id,
  d.date_remise,
  d.tiers_id,
  t.nom  as tiers_nom,
  t.type as tiers_type,
  d.produit_id,
  p.nom  as produit_nom,
  d.quantite_confiee,
  d.quantite_donnee,
  d.quantite_vendue,
  coalesce((select sum(r.quantite) from restitutions r where r.depot_id = d.id), 0) as quantite_restituee,
  d.quantite_confiee - d.quantite_donnee
    - coalesce((select sum(r.quantite) from restitutions r where r.depot_id = d.id), 0) as quantite_a_payer,
  prix_detail_a_date(d.produit_id, d.date_remise) as prix_detail,
  c.coefficient,
  prix_detail_a_date(d.produit_id, d.date_remise) / nullif(c.coefficient, 0) as prix_cession,
  (d.quantite_confiee - d.quantite_donnee
    - coalesce((select sum(r.quantite) from restitutions r where r.depot_id = d.id), 0))
    * prix_detail_a_date(d.produit_id, d.date_remise) / nullif(c.coefficient, 0) as montant_du
from depots d
join tiers t on t.id = d.tiers_id
join produits p on p.id = d.produit_id
left join coefficients_cession c on c.type_tiers = t.type;

-- Contrôle : chaque dépôt doit avoir un coefficient pour son type.
-- select count(*) from v_depots_lignes where coefficient is null;  -- doit renvoyer 0

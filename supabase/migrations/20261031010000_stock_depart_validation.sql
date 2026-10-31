-- =====================================================================
-- Stock de départ par commercial, validé avant la vente (décision du 31/10/2026).
-- 1) Un commercial saisit le stock qu'il emporte pour un lieu (événement ou point de vente).
-- 2) Le chef d'équipe désigné du lieu, à défaut le gérant, valide ce stock.
-- 3) Le commercial confirme le stock. Tant que ces deux validations ne sont pas faites,
--    il ne peut pas enregistrer de vente pour ce lieu.
-- Toute modification du stock annule les validations.
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

-- 1) Chef d'équipe par lieu (un seul par événement, facultatif)
alter table evenement_commerciaux add column if not exists est_chef boolean not null default false;

-- 2) Stock de départ : quantités emportées, par lieu, commercial et produit
create table if not exists stock_depart (
  id            uuid primary key default gen_random_uuid(),
  evenement_id  uuid not null references evenements(id) on delete cascade,
  commercial_id uuid not null references commerciaux(id) on delete cascade,
  produit_id    uuid not null references produits(id) on delete cascade,
  quantite      numeric not null check (quantite >= 0),
  updated_at    timestamptz not null default now(),
  unique (evenement_id, commercial_id, produit_id)
);

-- 3) Validations : date de validation par le gérant ou le chef, et date de confirmation par le commercial
create table if not exists validation_stock (
  evenement_id        uuid not null references evenements(id) on delete cascade,
  commercial_id       uuid not null references commerciaux(id) on delete cascade,
  valide_par          uuid,
  valide_le           timestamptz,
  confirme_le         timestamptz,
  updated_at          timestamptz not null default now(),
  primary key (evenement_id, commercial_id)
);

-- Fonctions d'aide (security definer : elles évitent les boucles de droits)
create or replace function est_chef_du_lieu(p_evenement uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from evenement_commerciaux ec
                  where ec.evenement_id = p_evenement
                    and ec.est_chef
                    and ec.commercial_id = mon_commercial_id())
$$;

create or replace function peut_valider_stock(p_evenement uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_role('gerant') or est_chef_du_lieu(p_evenement)
$$;

-- Vrai si le commercial connecté a un stock validé ET confirmé pour ce lieu.
create or replace function stock_valide_pour_moi(p_evenement uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from validation_stock vs
                  where vs.evenement_id = p_evenement
                    and vs.commercial_id = mon_commercial_id()
                    and vs.valide_le is not null
                    and vs.confirme_le is not null)
$$;

-- Toute modification du stock de départ annule les validations du commercial pour ce lieu.
create or replace function annule_validation_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from validation_stock
   where evenement_id = coalesce(new.evenement_id, old.evenement_id)
     and commercial_id = coalesce(new.commercial_id, old.commercial_id);
  return null;
end $$;

drop trigger if exists stock_depart_annule_trg on stock_depart;
create trigger stock_depart_annule_trg after insert or update or delete on stock_depart
  for each row execute function annule_validation_stock();

-- Droits
alter table stock_depart enable row level security;
alter table validation_stock enable row level security;

drop policy if exists stock_depart_lecture on stock_depart;
create policy stock_depart_lecture on stock_depart for select to authenticated
  using (is_role('gerant', 'comptable') or commercial_id = mon_commercial_id() or est_chef_du_lieu(evenement_id));

drop policy if exists stock_depart_ecriture on stock_depart;
create policy stock_depart_ecriture on stock_depart for all to authenticated
  using (is_role('gerant') or commercial_id = mon_commercial_id())
  with check (is_role('gerant') or commercial_id = mon_commercial_id());

drop policy if exists validation_stock_lecture on validation_stock;
create policy validation_stock_lecture on validation_stock for select to authenticated
  using (is_role('gerant', 'comptable') or commercial_id = mon_commercial_id() or est_chef_du_lieu(evenement_id));

drop policy if exists validation_stock_ecriture on validation_stock;
create policy validation_stock_ecriture on validation_stock for all to authenticated
  using (peut_valider_stock(evenement_id) or commercial_id = mon_commercial_id())
  with check (peut_valider_stock(evenement_id) or commercial_id = mon_commercial_id());

grant select, insert, update, delete on stock_depart, validation_stock to authenticated;

drop trigger if exists stock_depart_audit_trg on stock_depart;
create trigger stock_depart_audit_trg after insert or update or delete on stock_depart
  for each row execute function audit_trigger();
drop trigger if exists validation_stock_audit_trg on validation_stock;
create trigger validation_stock_audit_trg after insert or update or delete on validation_stock
  for each row execute function audit_trigger();

-- 4) Vente bloquée tant que le stock du lieu n'est pas validé et confirmé par le commercial.
--    Le gérant n'est pas concerné.
drop policy if exists ventes_ajout on ventes;
create policy ventes_ajout on ventes for insert to authenticated
  with check (
    is_role('gerant')
    or (is_role('commercial')
        and commercial_id = mon_commercial_id()
        and exists (select 1 from evenements e where e.id = evenement_id)
        and stock_valide_pour_moi(evenement_id))
  );

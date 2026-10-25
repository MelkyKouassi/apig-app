-- Prix normal et prix promotionnel (décision du 25/10/2026).
-- Chaque produit (et chaque prix propre à un lieu) a un prix normal et un prix promotionnel.
-- Un réglage global (mode_prix), daté, choisit le prix appliqué. Sans prix promotionnel, le prix normal s'applique.

-- 1) Type de prix sur les tables de prix
alter table prix add column if not exists type_prix text not null default 'normal'
  check (type_prix in ('normal', 'promotionnel'));
alter table prix_evenement add column if not exists type_prix text not null default 'normal'
  check (type_prix in ('normal', 'promotionnel'));

-- Les anciennes contraintes d'unicité (produit, date) et (produit, lieu, date) n'ont plus de sens :
-- on les retire, puis on les remplace par des contraintes qui incluent le type.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'prix'::regclass and contype = 'u' loop
    execute format('alter table prix drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint
           where conrelid = 'prix_evenement'::regclass and contype = 'u' loop
    execute format('alter table prix_evenement drop constraint %I', c.conname);
  end loop;
end $$;

alter table prix add constraint prix_unique_type unique (produit_id, type_prix, date_effet);
alter table prix_evenement add constraint prix_evenement_unique_type unique (produit_id, evenement_id, type_prix, date_effet);

-- 2) Mode de prix appliqué, daté (un seul réglage global)
create table if not exists mode_prix (
  date_effet date primary key,
  mode       text not null check (mode in ('normal', 'promotionnel')),
  created_by uuid,
  created_at timestamptz not null default now()
);
insert into mode_prix (date_effet, mode) values ('1900-01-01', 'normal') on conflict do nothing;

alter table mode_prix enable row level security;
drop policy if exists mode_prix_lecture on mode_prix;
create policy mode_prix_lecture on mode_prix for select to authenticated
  using (is_role('gerant', 'comptable', 'commercial'));
drop policy if exists mode_prix_gerant on mode_prix;
create policy mode_prix_gerant on mode_prix for all to authenticated
  using (is_role('gerant')) with check (is_role('gerant'));
grant select, insert, update, delete on mode_prix to authenticated;

drop trigger if exists mode_prix_audit_trg on mode_prix;
create trigger mode_prix_audit_trg after insert or update or delete on mode_prix
  for each row execute function audit_trigger();

-- Mode en vigueur à une date
create or replace function fn_mode_prix_a(p_date date) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select mode from mode_prix where date_effet <= p_date order by date_effet desc limit 1),
    'normal')
$$;

-- 3) Règle R1 : prix de vente, avec le mode en vigueur à la date de la vente.
--    Ordre : prix du lieu, puis historique, puis prix de base (0 au point de vente).
--    À chaque étape, le prix promotionnel s'il existe, sinon le prix normal.
create or replace function fn_prix_vente(p_produit uuid, p_evenement uuid, p_date date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_type text := fn_mode_prix_a(p_date);
  v_prix numeric;
  v_pdv  boolean;
begin
  select pe.prix_unitaire into v_prix from prix_evenement pe
   where pe.produit_id = p_produit and pe.evenement_id = p_evenement
     and pe.date_effet <= p_date and pe.type_prix = v_type
   order by pe.date_effet desc limit 1;
  if found then return v_prix; end if;
  if v_type <> 'normal' then
    select pe.prix_unitaire into v_prix from prix_evenement pe
     where pe.produit_id = p_produit and pe.evenement_id = p_evenement
       and pe.date_effet <= p_date and pe.type_prix = 'normal'
     order by pe.date_effet desc limit 1;
    if found then return v_prix; end if;
  end if;

  select pr.prix_unitaire into v_prix from prix pr
   where pr.produit_id = p_produit and pr.date_effet <= p_date and pr.type_prix = v_type
   order by pr.date_effet desc limit 1;
  if found then return v_prix; end if;
  if v_type <> 'normal' then
    select pr.prix_unitaire into v_prix from prix pr
     where pr.produit_id = p_produit and pr.date_effet <= p_date and pr.type_prix = 'normal'
     order by pr.date_effet desc limit 1;
    if found then return v_prix; end if;
  end if;

  select est_point_de_vente into v_pdv from evenements where id = p_evenement;
  if coalesce(v_pdv, false) then return 0; end if;

  select prix_base into v_prix from produits where id = p_produit;
  return coalesce(v_prix, 0);
end $$;

-- 4) Prix de détail à une date (dépôt-vente), avec le même mode
create or replace function prix_detail_a_date(p_produit uuid, p_date date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_type text := fn_mode_prix_a(p_date);
  v_prix numeric;
begin
  select pr.prix_unitaire into v_prix from prix pr
   where pr.produit_id = p_produit and pr.date_effet <= p_date and pr.type_prix = v_type
   order by pr.date_effet desc limit 1;
  if found then return v_prix; end if;
  if v_type <> 'normal' then
    select pr.prix_unitaire into v_prix from prix pr
     where pr.produit_id = p_produit and pr.date_effet <= p_date and pr.type_prix = 'normal'
     order by pr.date_effet desc limit 1;
    if found then return v_prix; end if;
  end if;
  select p.prix_base into v_prix from produits p where p.id = p_produit;
  return coalesce(v_prix, 0);
end $$;

-- 5) Recalcul des ventes à partir d'une date (gérant seul). Le prix change, le montant suit.
--    Chaque modification est tracée dans le journal d'audit.
create or replace function recalculer_prix_ventes(p_depuis date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_nb integer;
begin
  if not is_role('gerant') then
    raise exception 'Réservé au gérant.';
  end if;
  -- Autorise l'écriture du prix recalculé (la règle « prix figé » reste en vigueur pour les autres modifications)
  perform set_config('app.import_mode', 'on', true);
  with a_changer as (
    select v.id, fn_prix_vente(v.produit_id, v.evenement_id, v.date_vente) as nouveau
      from ventes v
     where v.date_vente >= p_depuis and v.statut = 'actif'
  )
  update ventes v set prix_unitaire = a.nouveau
    from a_changer a
   where v.id = a.id and v.prix_unitaire is distinct from a.nouveau;
  get diagnostics v_nb = row_count;
  perform set_config('app.import_mode', 'off', true);
  return v_nb;
end $$;

grant execute on function recalculer_prix_ventes(date) to authenticated;

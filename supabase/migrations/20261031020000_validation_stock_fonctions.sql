-- =====================================================================
-- Validation du stock : les écritures passent par des fonctions qui vérifient qui agit.
-- 1) valider_stock : le gérant, ou le chef d'équipe du lieu, valide le stock d'un commercial.
--    Un chef ne peut pas valider son propre stock.
-- 2) confirmer_stock : le commercial confirme le stock qui a été validé.
-- 3) definir_chef : le gérant désigne le chef d'équipe d'un lieu (ou aucun).
-- Le commercial ne peut plus écrire directement dans validation_stock.
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

drop policy if exists validation_stock_ecriture on validation_stock;
revoke insert, update, delete on validation_stock from authenticated;

create or replace function valider_stock(p_evenement uuid, p_commercial uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not peut_valider_stock(p_evenement) then
    raise exception 'Seul le gérant ou le chef d''équipe de ce lieu peut valider le stock.';
  end if;
  if p_commercial = mon_commercial_id() and not is_role('gerant') then
    raise exception 'Un chef d''équipe ne peut pas valider son propre stock.';
  end if;
  if not exists (select 1 from stock_depart
                  where evenement_id = p_evenement and commercial_id = p_commercial) then
    raise exception 'Ce commercial n''a pas encore saisi son stock pour ce lieu.';
  end if;
  insert into validation_stock (evenement_id, commercial_id, valide_par, valide_le, confirme_le, updated_at)
  values (p_evenement, p_commercial, auth.uid(), now(), null, now())
  on conflict (evenement_id, commercial_id) do update
    set valide_par = excluded.valide_par,
        valide_le = excluded.valide_le,
        confirme_le = null,
        updated_at = now();
end $$;

create or replace function confirmer_stock(p_evenement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := mon_commercial_id();
begin
  if v_moi is null then
    raise exception 'Votre compte n''est pas relié à une fiche commercial.';
  end if;
  update validation_stock
     set confirme_le = now(), updated_at = now()
   where evenement_id = p_evenement
     and commercial_id = v_moi
     and valide_le is not null;
  if not found then
    raise exception 'Le stock doit d''abord être validé par le gérant ou le chef d''équipe.';
  end if;
end $$;

create or replace function definir_chef(p_evenement uuid, p_commercial uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('gerant') then
    raise exception 'Seul le gérant peut désigner le chef d''équipe.';
  end if;
  update evenement_commerciaux
     set est_chef = (commercial_id = p_commercial)
   where evenement_id = p_evenement;
end $$;

grant execute on function valider_stock(uuid, uuid) to authenticated;
grant execute on function confirmer_stock(uuid) to authenticated;
grant execute on function definir_chef(uuid, uuid) to authenticated;

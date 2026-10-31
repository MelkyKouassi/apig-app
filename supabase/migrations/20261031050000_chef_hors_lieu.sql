-- =====================================================================
-- Le gérant peut désigner comme chef d'équipe n'importe quel commercial actif.
-- Si ce commercial n'est pas encore affecté au lieu, il y est ajouté automatiquement.
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

create or replace function definir_chef(p_evenement uuid, p_commercial uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('gerant') then
    raise exception 'Seul le gérant peut désigner le chef d''équipe.';
  end if;
  if p_commercial is not null then
    if not exists (select 1 from commerciaux where id = p_commercial and actif) then
      raise exception 'Ce commercial n''est pas actif.';
    end if;
    insert into evenement_commerciaux (evenement_id, commercial_id, est_chef)
    values (p_evenement, p_commercial, true)
    on conflict (evenement_id, commercial_id) do update set est_chef = true;
  end if;
  update evenement_commerciaux
     set est_chef = (commercial_id = p_commercial)
   where evenement_id = p_evenement;
end $$;

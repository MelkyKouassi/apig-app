-- =====================================================================
-- Mouvements du stock d'un commercial en cours de journée (décision du 31/10/2026).
-- 1) Restitution : produits invendus rendus. Effet immédiat sur le stock du commercial.
--    Le gérant ou le chef la voit et peut la contrôler. La vente reste ouverte.
-- 2) Complément : produits ajoutés en cours de journée. Compté seulement après validation
--    par le gérant ou le chef (jamais par le commercial lui-même).
-- Le stock de départ n'est jamais modifié ici : la validation n'est donc pas remise à zéro.
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

create table if not exists mouvements_stock_lieu (
  id            uuid primary key default gen_random_uuid(),
  evenement_id  uuid not null references evenements(id) on delete cascade,
  commercial_id uuid not null references commerciaux(id) on delete cascade,
  produit_id    uuid not null references produits(id) on delete cascade,
  type          text not null check (type in ('restitution', 'complement')),
  quantite      numeric not null check (quantite > 0),
  statut        text not null check (statut in ('en_attente', 'valide')),
  declare_le    timestamptz not null default now(),
  valide_par    uuid,
  valide_le     timestamptz,
  updated_at    timestamptz not null default now()
);

alter table mouvements_stock_lieu enable row level security;

drop policy if exists mouvements_lecture on mouvements_stock_lieu;
create policy mouvements_lecture on mouvements_stock_lieu for select to authenticated
  using (is_role('gerant', 'comptable') or commercial_id = mon_commercial_id() or est_chef_du_lieu(evenement_id));

-- Écritures uniquement par les fonctions ci-dessous.
revoke insert, update, delete on mouvements_stock_lieu from authenticated;
grant select on mouvements_stock_lieu to authenticated;

drop trigger if exists mouvements_stock_lieu_audit_trg on mouvements_stock_lieu;
create trigger mouvements_stock_lieu_audit_trg after insert or update or delete on mouvements_stock_lieu
  for each row execute function audit_trigger();

-- Stock personnel restant : départ + compléments validés − restitutions − ventes actives.
create or replace function stock_personnel_restant(p_evenement uuid, p_commercial uuid, p_produit uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select quantite from stock_depart
                    where evenement_id = p_evenement and commercial_id = p_commercial and produit_id = p_produit), 0)
       + coalesce((select sum(quantite) from mouvements_stock_lieu
                    where evenement_id = p_evenement and commercial_id = p_commercial and produit_id = p_produit
                      and type = 'complement' and statut = 'valide'), 0)
       - coalesce((select sum(quantite) from mouvements_stock_lieu
                    where evenement_id = p_evenement and commercial_id = p_commercial and produit_id = p_produit
                      and type = 'restitution'), 0)
       - coalesce((select sum(quantite) from ventes
                    where evenement_id = p_evenement and commercial_id = p_commercial and produit_id = p_produit
                      and statut = 'actif'), 0)
$$;

create or replace function declarer_mouvement_stock(p_evenement uuid, p_produit uuid, p_type text, p_quantite numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := mon_commercial_id();
  v_restant numeric;
begin
  if v_moi is null then
    raise exception 'Votre compte n''est pas relié à une fiche commercial.';
  end if;
  if p_type not in ('restitution', 'complement') then
    raise exception 'Type de mouvement inconnu.';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'La quantité doit être supérieure à zéro.';
  end if;

  if p_type = 'restitution' then
    v_restant := stock_personnel_restant(p_evenement, v_moi, p_produit);
    if p_quantite > v_restant then
      raise exception 'Vous ne pouvez pas rendre plus que votre stock restant (%).', v_restant;
    end if;
    insert into mouvements_stock_lieu (evenement_id, commercial_id, produit_id, type, quantite, statut, valide_par, valide_le, updated_at)
    values (p_evenement, v_moi, p_produit, 'restitution', p_quantite, 'valide', null, now(), now());
  else
    if not exists (select 1 from validation_stock
                    where evenement_id = p_evenement and commercial_id = v_moi and valide_le is not null) then
      raise exception 'Saisissez et faites valider d''abord votre stock de départ pour ce lieu.';
    end if;
    insert into mouvements_stock_lieu (evenement_id, commercial_id, produit_id, type, quantite, statut, updated_at)
    values (p_evenement, v_moi, p_produit, 'complement', p_quantite, 'en_attente', now());
  end if;
end $$;

create or replace function valider_mouvement_stock(p_mouvement uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m mouvements_stock_lieu%rowtype;
begin
  select * into m from mouvements_stock_lieu where id = p_mouvement;
  if not found then
    raise exception 'Mouvement introuvable.';
  end if;
  if not peut_valider_stock(m.evenement_id) then
    raise exception 'Seul le gérant ou le chef d''équipe de ce lieu peut valider ce mouvement.';
  end if;
  if m.commercial_id = mon_commercial_id() and not is_role('gerant') then
    raise exception 'Un chef d''équipe ne peut pas valider son propre complément.';
  end if;
  if m.type <> 'complement' or m.statut <> 'en_attente' then
    raise exception 'Ce mouvement n''est pas en attente de validation.';
  end if;
  update mouvements_stock_lieu
     set statut = 'valide', valide_par = auth.uid(), valide_le = now(), updated_at = now()
   where id = p_mouvement;
end $$;

grant execute on function stock_personnel_restant(uuid, uuid, uuid) to authenticated;
grant execute on function declarer_mouvement_stock(uuid, uuid, text, numeric) to authenticated;
grant execute on function valider_mouvement_stock(uuid) to authenticated;

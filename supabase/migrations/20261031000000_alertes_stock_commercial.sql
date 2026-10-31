-- =====================================================================
-- Alertes de stock pour les commerciaux (décision du 31/10/2026).
-- 1) Chaque commercial règle son propre seuil d'alerte, produit par produit.
-- 2) Un commercial voit le stock restant des événements qui lui sont affectés
--    (quantités seulement : ni prix, ni marge, ni ventes des autres).
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

-- 1) Seuils d'alerte, un par commercial et par produit
create table if not exists seuils_alerte (
  id            uuid primary key default gen_random_uuid(),
  commercial_id uuid not null references commerciaux(id) on delete cascade,
  produit_id    uuid not null references produits(id) on delete cascade,
  seuil         numeric not null check (seuil >= 0),
  updated_at    timestamptz not null default now(),
  unique (commercial_id, produit_id)
);

alter table seuils_alerte enable row level security;

drop policy if exists seuils_lecture on seuils_alerte;
create policy seuils_lecture on seuils_alerte for select to authenticated
  using (is_role('gerant', 'comptable') or commercial_id = mon_commercial_id());

drop policy if exists seuils_ecriture on seuils_alerte;
create policy seuils_ecriture on seuils_alerte for all to authenticated
  using (is_role('gerant') or commercial_id = mon_commercial_id())
  with check (is_role('gerant') or commercial_id = mon_commercial_id());

grant select, insert, update, delete on seuils_alerte to authenticated;

drop trigger if exists seuils_alerte_audit_trg on seuils_alerte;
create trigger seuils_alerte_audit_trg after insert or update or delete on seuils_alerte
  for each row execute function audit_trigger();

-- 2) Stock restant par événement et produit, pour les événements visibles de l'utilisateur.
--    Fonction « security definer » : elle ne renvoie que des quantités, jamais de prix.
create or replace function mes_stocks_evenements()
returns table (evenement_id uuid, produit_id uuid, produit_nom text, stock_restant numeric)
language sql stable security definer set search_path = public as $$
  select pr.evenement_id,
         pr.produit_id,
         p.nom,
         pr.quantite_produite - pr.dons
           - coalesce((select sum(v.quantite) from ventes v
                        where v.evenement_id = pr.evenement_id
                          and v.produit_id = pr.produit_id
                          and v.statut = 'actif'), 0) as stock_restant
    from productions pr
    join produits p on p.id = pr.produit_id
    join evenements e on e.id = pr.evenement_id
   where is_role('gerant', 'comptable', 'commercial')
     and (is_role('gerant', 'comptable')
          or e.est_point_de_vente
          or exists (select 1 from evenement_commerciaux ec
                      where ec.evenement_id = e.id
                        and ec.commercial_id = mon_commercial_id()))
$$;

grant execute on function mes_stocks_evenements() to authenticated;

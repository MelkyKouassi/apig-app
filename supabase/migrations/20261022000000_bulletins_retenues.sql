-- =====================================================================
-- Bulletins validés et retenues facultatives (cahier, M9 et M10).
-- - bulletins : montants dus figés à la validation de la paie par le gérant.
-- - retenues_bulletin : retenues facultatives saisies par le gérant.
-- La collaboratrice ne lit que ses propres lignes.
-- =====================================================================

create table bulletins (
  id               uuid primary key default gen_random_uuid(),
  collaborateur_id uuid not null references collaborateurs(id) on delete restrict,
  annee            integer not null,
  mois             integer not null check (mois between 1 and 12),
  parts            numeric not null,
  total_parts      numeric not null,
  enveloppe        numeric not null,
  montant_du       numeric not null,
  valide_le        timestamptz not null default now(),
  valide_par       uuid,
  unique (collaborateur_id, annee, mois)
);

create table retenues_bulletin (
  id               uuid primary key default gen_random_uuid(),
  collaborateur_id uuid not null references collaborateurs(id) on delete restrict,
  annee            integer not null,
  mois             integer not null check (mois between 1 and 12),
  libelle          text not null,
  montant          numeric not null check (montant > 0),
  statut           text not null default 'actif' check (statut in ('actif', 'annule')),
  motif_annulation text,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

-- Droits de table : sans ces lignes, les nouvelles tables ne sont pas accessibles.
grant select, insert, update on bulletins, retenues_bulletin to authenticated;

alter table bulletins enable row level security;
alter table retenues_bulletin enable row level security;

create policy bulletins_lecture on bulletins for select to authenticated
  using (is_role('gerant', 'comptable') or collaborateur_id = mon_collaborateur_id());
create policy bulletins_gerant on bulletins for all to authenticated
  using (is_role('gerant')) with check (is_role('gerant'));

create policy retenues_lecture on retenues_bulletin for select to authenticated
  using (is_role('gerant', 'comptable') or collaborateur_id = mon_collaborateur_id());
create policy retenues_gerant on retenues_bulletin for all to authenticated
  using (is_role('gerant')) with check (is_role('gerant'));

-- Rien n'est effacé : annulation par statut.
create trigger bulletins_nodelete_trg before delete on bulletins for each row execute function forbid_delete();
create trigger retenues_nodelete_trg before delete on retenues_bulletin for each row execute function forbid_delete();

-- Journal d'audit
create trigger bulletins_audit_trg after insert or update or delete on bulletins for each row execute function audit_trigger();
create trigger retenues_audit_trg after insert or update or delete on retenues_bulletin for each row execute function audit_trigger();

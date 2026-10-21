-- =====================================================================
-- Compléments au schéma initial : fiche des collaborateurs (bulletins),
-- identité de l'entreprise et paramètres de crédit manquants.
-- À coller dans Supabase APRÈS 01_schema_base_de_donnees.sql.
-- =====================================================================

alter table collaborateurs
  add column if not exists matricule     text,
  add column if not exists fonction      text,
  add column if not exists date_entree   date,
  add column if not exists mode_paiement text,
  add column if not exists numero_cnps   text;

alter table entreprise
  add column if not exists ville                text,
  add column if not exists signataire_qualite   text,
  add column if not exists signataire           text;

alter table parametres
  add column if not exists delai_credit_jours integer not null default 30;

-- =====================================================================
-- Mes primes (commercial) : chaque commercial ne voit que ses propres primes.
-- À exécuter dans Supabase > SQL Editor (une seule fois).
-- =====================================================================

create or replace function fn_mes_primes()
returns table (
  evenement_nom text,
  annee int,
  mois int,
  total_vendu numeric,
  taux numeric,
  prime numeric
)
language sql stable security definer set search_path = public as $$
  select v.evenement_nom, v.annee, v.mois, v.total_vendu, v.taux, v.prime
  from v_primes v
  where v.commercial_id = mon_commercial_id()
  order by v.annee, v.mois nulls first, v.evenement_nom
$$;

revoke all on function fn_mes_primes() from public, anon;
grant execute on function fn_mes_primes() to authenticated;

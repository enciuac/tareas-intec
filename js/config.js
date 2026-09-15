// Config pública de Supabase. La anon key está pensada para ser pública:
// el acceso real a los datos lo controla Row Level Security (ver supabase/schema.sql),
// que exige un usuario autenticado (Supabase Auth) antes de leer o escribir nada.
const CONFIG = {
  SUPABASE_URL: 'https://etpoefyskfwswtzzoabq.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_dBEn3Sj1byAJ9TvHtA607Q_7QzO6IYZ',
};

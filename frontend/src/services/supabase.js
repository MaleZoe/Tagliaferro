// Crea el cliente público de Supabase Auth usando variables de entorno de Vite.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// La clave anon identifica la aplicación; la autorización real debe estar en Auth, API y RLS.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

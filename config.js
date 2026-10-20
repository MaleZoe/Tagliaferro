// config.js — va en la RAÍZ del proyecto (junto a index.html)
// Acá solo van datos PÚBLICOS. La clave secreta va en backend/.env

const SUPABASE_URL = 'https://iqdqcbfrzbluyynhjgh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pWlXggEcnQFyjVJNe0ZntA_fn7KISgc';
const API_URL = 'http://localhost:3000';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
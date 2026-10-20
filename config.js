// config.js — va en la RAÍZ del proyecto (junto a index.html)
// Acá solo van datos PÚBLICOS. La clave secreta va en backend/.env

const SUPABASE_URL = 'https://xmmeixzaqupiqtmwplcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtbWVpeHphcXVwaXF0bXdwbGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNzQ3MTgsImV4cCI6MjEwNzg1MDcxOH0.dMUujES_Q2KvTzNIsHip8I1p6EzLr2DSoG8_1E8EUYU';
const API_URL = 'http://localhost:3000';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

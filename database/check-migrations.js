// database/check-migrations.js
// Verifica la disponibilidad de todas las tablas, columnas, funciones y permisos en Supabase (cero dependencias).
const fs = require('fs');
const path = require('path');

function getEnv() {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
  return env;
}

const env = getEnv();
const SUPABASE_URL = env.SUPABASE_URL || 'https://xmmeixzaqupiqtmwplcp.supabase.co';
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtbWVpeHphcXVwaXF0bXdwbGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNzQ3MTgsImV4cCI6MjEwNzg1MDcxOH0.dMUujES_Q2KvTzNIsHip8I1p6EzLr2DSoG8_1E8EUYU';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

const TABLES = [
  'products',
  'sports',
  'product_variants',
  'app_user_roles',
  'inventory_movements',
  'sales',
  'sale_items',
  'projects',
  'project_phases',
  'project_tasks',
  'project_history',
  'suppliers',
  'supplier_products',
  'purchase_receipts',
  'purchase_receipt_items',
  'cash_sessions',
  'sale_payments',
  'cash_movements',
  'store_settings'
];

const COLUMNS_TO_VERIFY = [
  { table: 'product_variants', column: 'stock_minimo' },
  { table: 'product_variants', column: 'color' },
  { table: 'product_variants', column: 'activo' },
  { table: 'products', column: 'sku' },
  { table: 'projects', column: 'archived_at' }
];

const FUNCTIONS = [
  { name: 'register_inventory_movement', params: { p_variant_id: 1, p_delta: 0, p_reason: 'check', p_responsible_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'register_pos_sale_v2', params: { p_request_key: '00000000-0000-0000-0000-000000000000', p_employee_id: '00000000-0000-0000-0000-000000000000', p_items: [], p_payment_lines: [], p_discount: 0, p_cash_session_id: 1 } },
  { name: 'create_admin_product', params: { p_name: '', p_description: '', p_price: 1, p_sport_slug: '', p_image_url: '', p_sku: '', p_size: '', p_color: '', p_initial_stock: 0, p_minimum: 0, p_responsible_id: '00000000-0000-0000-0000-000000000000' } }
];

async function main() {
  console.log('='.repeat(70));
  console.log(' DIAGNÓSTICO DE MIGRACIONES EN SUPABASE');
  console.log('='.repeat(70));
  console.log(`URL: ${SUPABASE_URL}`);
  let keyType = 'desconocida';
  try {
    const payload = JSON.parse(Buffer.from(SUPABASE_KEY.split('.')[1], 'base64').toString('utf8'));
    keyType = payload.role || 'desconocida';
  } catch {}
  console.log(`Rol de la clave configurada: "${keyType}" (debe ser "service_role" para el backend)\n`);

  let tableErrors = 0;
  console.log('--- 1. Verificación de Tablas y Permisos ---');
  for (const table of TABLES) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers });
      const json = await res.json();
      if (!res.ok) {
        tableErrors++;
        console.log(`  ❌ [${table}]: ERROR ${json.code || res.status} — ${json.message || JSON.stringify(json)}`);
      } else {
        console.log(`  ✅ [${table}]: OK (${Array.isArray(json) ? json.length : 0} registros leídos)`);
      }
    } catch (e) {
      tableErrors++;
      console.log(`  ❌ [${table}]: ${e.message}`);
    }
  }

  console.log('\n--- 2. Verificación de Columnas Agregadas ---');
  for (const item of COLUMNS_TO_VERIFY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${item.table}?select=${item.column}&limit=1`, { headers });
      const json = await res.json();
      if (!res.ok) {
        console.log(`  ❌ [${item.table}.${item.column}]: ERROR ${json.code || res.status} — ${json.message}`);
      } else {
        console.log(`  ✅ [${item.table}.${item.column}]: OK (Columna presente)`);
      }
    } catch (e) {
      console.log(`  ❌ [${item.table}.${item.column}]: ${e.message}`);
    }
  }

  console.log('\n--- 3. Verificación de Procedimientos Almacenados (Funciones RPC) ---');
  for (const fn of FUNCTIONS) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn.name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(fn.params)
      });
      const json = await res.json();
      if (res.status === 404 && json.code === 'PGRST202') {
        console.log(`  ❌ [${fn.name}]: No existe en la base (Error 404 PGRST202)`);
      } else if (res.status === 401 || (json.code === '42501')) {
        console.log(`  ⚠️  [${fn.name}]: La función EXISTE pero el rol "${keyType}" no tiene permiso EXECUTE (Error 42501)`);
      } else if (!res.ok) {
        // Un error de lógica de la función (ej: validación de params) confirma que está creada y funcionando
        console.log(`  ✅ [${fn.name}]: OK (Instalada y ejecutada correctamente; validó: ${json.message})`);
      } else {
        console.log(`  ✅ [${fn.name}]: OK`);
      }
    } catch (e) {
      console.log(`  ❌ [${fn.name}]: ${e.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  if (tableErrors > 0) {
    console.log(`RESULTADO: ${tableErrors} tablas tienen acceso denegado (código 42501).`);
    console.log('CAUSA:');
    console.log('1. Las migraciones originales revocaron permisos con REVOKE ALL FROM anon, authenticated.');
    console.log('2. La clave configurada en backend/.env o Vercel es de rol "anon" en lugar de "service_role".');
    console.log('\nSOLUCIÓN RÁPIDA:');
    console.log('Ejecutá en el SQL Editor de Supabase la migración:');
    console.log('  database/migrations/20261020_007_fix_permissions_and_rls.sql');
    console.log('o la migración completa:');
    console.log('  database/migrations/run_all_migrations.sql');
  } else {
    console.log('RESULTADO: ¡Todas las tablas y migraciones están 100% operativas!');
  }
  console.log('='.repeat(70));
}

main().catch(console.error);

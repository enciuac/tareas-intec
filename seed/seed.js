// Importa las 308 tareas de Tareas_2026.xlsx (hojas Febrero..Septiembre) a Supabase.
// Uso:
//   cd seed && npm install
//   node seed.js "C:\ruta\Tareas 2026.xlsx"   (o define EXCEL_PATH en .env)
require('dotenv').config();
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://etpoefyskfwswtzzoabq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_dBEn3Sj1byAJ9TvHtA607Q_7QzO6IYZ';
const SEED_EMAIL = process.env.SEED_EMAIL;
const SEED_PASSWORD = process.env.SEED_PASSWORD;
const EXCEL_PATH = process.argv[2] || process.env.EXCEL_PATH;

if (!SEED_EMAIL || !SEED_PASSWORD) {
  console.error('Faltan SEED_EMAIL / SEED_PASSWORD. Copia seed/.env.example a seed/.env y complétalo.');
  process.exit(1);
}
if (!EXCEL_PATH) {
  console.error('Indica la ruta del Excel: node seed.js "C:\\ruta\\Tareas 2026.xlsx" (o EXCEL_PATH en .env)');
  process.exit(1);
}

// Nombre de hoja -> valor canónico de "mes" en la base de datos.
const MES_POR_HOJA = {
  Febrero: 'Febrero',
  Marzo: 'Marzo',
  Abril: 'Abril',
  Mayo: 'Mayo',
  JUNIO: 'Junio',
  JULIO: 'Julio',
  AGOSTO: 'Agosto',
  SEPTIEMBRE: 'Septiembre',
};

// El Excel usa variantes de capitalización / sinónimos para los mismos 5 estados.
const STATUS_MAP = {
  listo: 'Listo',
  'en curso': 'En curso',
  'en espera': 'En espera',
  'sin empezar': 'Sin empezar',
  parado: 'Parado',
  detenido: 'Parado',
};

function normalizeStatus(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return STATUS_MAP[key] || 'Sin empezar';
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (!s || s === '-') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseSheet(sheetName, worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
  const isSeptiembre = sheetName.toUpperCase() === 'SEPTIEMBRE';
  const mes = MES_POR_HOJA[sheetName] || sheetName;
  const tasks = [];

  // Fila 0: título de la hoja. Fila 1: cabeceras. Datos desde la fila 2.
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] === null || String(row[0]).trim() === '') continue;

    const nombre = String(row[0]).trim();
    const status = normalizeStatus(row[1]);
    const notasRaw = isSeptiembre ? row[3] : row[4];

    const task = {
      nombre,
      status,
      mes,
      notas: notasRaw ? String(notasRaw) : '',
      prioridad: 'Media',
      categoria: 'General',
      apuntada: null,
      terminada: null,
      horas: null,
    };

    if (isSeptiembre) {
      const horasRaw = row[2];
      const horas = typeof horasRaw === 'number' ? horasRaw : Number(String(horasRaw || '').replace(',', '.'));
      task.horas = Number.isFinite(horas) ? horas : null;
    } else {
      task.apuntada = toIsoDate(row[2]);
      task.terminada = toIsoDate(row[3]);
    }

    tasks.push(task);
  }
  return tasks;
}

async function main() {
  const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: true });

  let allTasks = [];
  for (const sheetName of workbook.SheetNames) {
    const tasks = parseSheet(sheetName, workbook.Sheets[sheetName]);
    console.log(`${sheetName}: ${tasks.length} tareas`);
    allTasks = allTasks.concat(tasks);
  }
  console.log(`Total a insertar: ${allTasks.length} tareas`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
  });
  if (authError) {
    console.error('No se pudo iniciar sesión en Supabase:', authError.message);
    console.error('Crea el usuario en Dashboard > Authentication > Users, o revisa seed/.env.');
    process.exit(1);
  }

  const BATCH_SIZE = 50;
  let inserted = 0;
  for (let i = 0; i < allTasks.length; i += BATCH_SIZE) {
    const batch = allTasks.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('tasks').insert(batch);
    if (error) {
      console.error(`Error insertando lote ${i}-${i + batch.length}:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`Insertadas ${inserted}/${allTasks.length}`);
  }

  console.log('Seed completado con éxito.');
  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error('Error inesperado en el seed:', err);
  process.exit(1);
});

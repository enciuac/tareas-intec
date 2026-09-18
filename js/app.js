/* Tareas Alin Intec — tablero Kanban sobre Supabase */

const sbClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const STATUSES = ['Sin empezar', 'En curso', 'En espera', 'Parado', 'Listo'];
const MONTHS = ['Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre'];
const ALL_MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMesOrFallback(fallback) {
  const real = ALL_MONTH_NAMES[new Date().getMonth()];
  return MONTHS.includes(real) ? real : fallback;
}
const CATEGORIES = ['Marketing', 'Diseño', 'Web', 'Mailing', 'Tienda', 'Admin', 'General'];
const MARCAS = ['Intec', 'Sumifluid', 'Jender', 'CST Iberica', 'Blizzcool', 'Blizztherm', 'General'];
const MARCA_LABELS = { 'CST Iberica': 'CST Ibérica', General: 'General / sin marca' };
const PRIORITIES = ['Alta', 'Media', 'Baja'];
const PRIORITY_ORDER = { Alta: 0, Media: 1, Baja: 2 };

const CATEGORY_VARS = {
  Marketing: '--cat-marketing', Diseño: '--cat-diseno', Web: '--cat-web', Mailing: '--cat-mailing',
  Tienda: '--cat-tienda', Admin: '--cat-admin', General: '--cat-general',
};
const MARCA_VARS = {
  Intec: '--cat-marketing', Sumifluid: '--cat-diseno', Jender: '--cat-web', 'CST Iberica': '--cat-mailing',
  Blizzcool: '--cat-tienda', Blizztherm: '--cat-admin', General: '--cat-general',
};
const PRIORITY_VARS = { Alta: '--status-critical', Media: '--status-warning', Baja: '--status-good' };
const STATUS_VARS = {
  'Sin empezar': '--col-sinempezar', 'En curso': '--col-encurso', 'En espera': '--col-enespera',
  Parado: '--col-parado', Listo: '--col-listo',
};

const state = {
  session: null,
  tasks: [],
  view: localStorage.getItem('view') || 'board',
  filterMes: currentMesOrFallback('Todos'),
  filterMarca: 'Todas',
  filterCategoria: 'Todas',
  filterPrioridad: 'Todas',
  filterQuery: '',
  sortBy: 'creacion',
  editingTaskId: null,
  channel: null,
  reloadTimer: null,
  charts: {},
};

const els = {
  loginScreen: document.getElementById('login-screen'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  loginSubmit: document.getElementById('login-submit'),
  app: document.getElementById('app'),
  avatar: document.getElementById('user-avatar'),
  statsSummary: document.getElementById('stats-summary'),
  filterMes: document.getElementById('filter-mes'),
  filterMarca: document.getElementById('filter-marca'),
  filterCategoria: document.getElementById('filter-categoria'),
  filterPrioridad: document.getElementById('filter-prioridad'),
  sortBy: document.getElementById('sort-by'),
  filterSearch: document.getElementById('filter-search'),
  lists: {},
  counts: {},
  tableBody: document.getElementById('table-body'),
  tableEmpty: document.getElementById('table-empty'),
  statsTiles: document.getElementById('stats-tiles'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalTitle: document.getElementById('modal-title'),
  taskForm: document.getElementById('task-form'),
  deleteTaskBtn: document.getElementById('delete-task-btn'),
  subtasksHint: document.getElementById('subtasks-hint'),
  subtasksProgress: document.getElementById('subtasks-progress'),
  subtasksProgressLabel: document.getElementById('subtasks-progress-label'),
  subtasksProgressFill: document.getElementById('subtasks-progress-fill'),
  subtasksList: document.getElementById('subtasks-list'),
  subtaskAddForm: document.getElementById('subtask-add-form'),
  subtaskInput: document.getElementById('subtask-input'),
  historyList: document.getElementById('history-list'),
  toastContainer: document.getElementById('toast-container'),
  themeToggle: document.getElementById('theme-toggle'),
  exportPdfBtn: document.getElementById('export-pdf-btn'),
};

STATUSES.forEach((s) => {
  els.lists[s] = document.querySelector(`.card-list[data-list="${s}"]`);
  els.counts[s] = document.querySelector(`.column-count[data-count="${s}"]`);
});

/* ============================= utilidades ============================= */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function categoryColor(cat) {
  return cssVar(CATEGORY_VARS[cat] || '--cat-general');
}

function priorityColor(prio) {
  return cssVar(PRIORITY_VARS[prio] || '--status-warning');
}

function statusColor(status) {
  return cssVar(STATUS_VARS[status] || '--col-sinempezar');
}

function marcaLabel(marca) {
  return MARCA_LABELS[marca] || marca || 'General';
}

function marcaColor(marca) {
  return cssVar(MARCA_VARS[marca] || '--cat-general');
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  els.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ============================== tema ================================== */

function effectiveTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit) return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeIcon() {
  els.themeToggle.textContent = effectiveTheme() === 'dark' ? '☀️' : '🌙';
}

function applyTheme(pref) {
  if (pref === 'light' || pref === 'dark') {
    document.documentElement.setAttribute('data-theme', pref);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateThemeIcon();
}

els.themeToggle.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
  if (state.view === 'stats') renderStats();
});

applyTheme(localStorage.getItem('theme'));

/* ============================== auth =================================== */

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  els.loginSubmit.disabled = true;
  els.loginSubmit.textContent = 'Entrando…';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const { error } = await sbClient.auth.signInWithPassword({ email, password });
  els.loginSubmit.disabled = false;
  els.loginSubmit.textContent = 'Entrar';
  if (error) {
    els.loginError.textContent = 'Credenciales incorrectas o error de conexión.';
    els.loginError.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => sbClient.auth.signOut());

async function handleAuthedState() {
  const email = (state.session && state.session.user && state.session.user.email) || '';
  els.avatar.textContent = email ? email.charAt(0).toUpperCase() : '?';
  els.avatar.title = email;

  els.loginScreen.hidden = true;
  els.app.hidden = false;
  await loadTasks();
  render();
  subscribeRealtime();
}

function handleUnauthedState() {
  els.app.hidden = true;
  els.loginScreen.hidden = false;
  els.loginForm.reset();
  if (state.channel) {
    sbClient.removeChannel(state.channel);
    state.channel = null;
  }
  state.tasks = [];
  closeModal();
}

sbClient.auth.onAuthStateChange((_event, session) => {
  const wasLoaded = !!state.session && !!state.channel;
  const sameUser = state.session && session && state.session.user.id === session.user.id;
  state.session = session;
  if (session) {
    if (!(wasLoaded && sameUser)) handleAuthedState();
  } else {
    handleUnauthedState();
  }
});

/* ============================== datos =================================== */

async function loadTasks() {
  const { data, error } = await sbClient
    .from('tasks')
    .select('*, subtasks(*)')
    .order('pos', { foreignTable: 'subtasks' })
    .order('created_at', { ascending: true });
  if (error) {
    showToast('Error al cargar tareas: ' + error.message, 'error');
    return;
  }
  state.tasks = data || [];
}

function subscribeRealtime() {
  if (state.channel) sbClient.removeChannel(state.channel);
  state.channel = sbClient
    .channel('board-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, scheduleReload)
    .subscribe();
}

function scheduleReload() {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(async () => {
    await loadTasks();
    render();
    if (state.editingTaskId) {
      const task = state.tasks.find((t) => t.id === state.editingTaskId);
      renderSubtasksTab(task);
    }
  }, 250);
}

/* ============================ vistas (switcher) ========================== */

document.querySelectorAll('.view-tab').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

function setView(view) {
  state.view = view;
  localStorage.setItem('view', view);
  document.querySelectorAll('.view-tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('view-board').classList.toggle('active', view === 'board');
  document.getElementById('view-table').classList.toggle('active', view === 'table');
  document.getElementById('view-stats').classList.toggle('active', view === 'stats');
  if (view === 'stats') renderStats();
}

setView(state.view);

/* ============================== filtros =================================== */

function getFilteredTasks() {
  const mes = state.filterMes;
  const marca = state.filterMarca;
  const categoria = state.filterCategoria;
  const prioridad = state.filterPrioridad;
  const q = state.filterQuery.trim().toLowerCase();
  return state.tasks.filter((t) => {
    if (mes !== 'Todos' && t.mes !== mes) return false;
    if (marca !== 'Todas' && t.marca !== marca) return false;
    if (categoria !== 'Todas' && t.categoria !== categoria) return false;
    if (prioridad !== 'Todas' && t.prioridad !== prioridad) return false;
    if (q) {
      const hay = `${t.nombre} ${t.notas || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortTasks(list) {
  const arr = [...list];
  if (state.sortBy === 'apuntada') {
    arr.sort((a, b) => (a.apuntada || '￿').localeCompare(b.apuntada || '￿'));
  } else if (state.sortBy === 'prioridad') {
    arr.sort((a, b) => PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad]);
  } else if (state.sortBy === 'nombre') {
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  } else {
    arr.reverse(); // creación: más recientes primero (se cargan por created_at asc)
  }
  return arr;
}

els.filterMes.value = state.filterMes;

els.filterMes.addEventListener('change', (e) => { state.filterMes = e.target.value; render(); });
els.filterMarca.addEventListener('change', (e) => { state.filterMarca = e.target.value; render(); });
els.filterCategoria.addEventListener('change', (e) => { state.filterCategoria = e.target.value; render(); });
els.filterPrioridad.addEventListener('change', (e) => { state.filterPrioridad = e.target.value; render(); });
els.sortBy.addEventListener('change', (e) => { state.sortBy = e.target.value; render(); });
els.filterSearch.addEventListener('input', (e) => { state.filterQuery = e.target.value; render(); });

/* ============================== render (general) =========================== */

function render() {
  const filtered = sortTasks(getFilteredTasks());
  renderBoard(filtered);
  renderTable(filtered);
  updateStatsSummary();
  if (state.view === 'stats') renderStats(filtered);
}

function updateStatsSummary() {
  const total = state.tasks.length;
  const listo = state.tasks.filter((t) => t.status === 'Listo').length;
  const pct = total ? Math.round((listo / total) * 100) : 0;
  els.statsSummary.textContent = `${total} tareas · ${listo} completadas (${pct}%)`;
}

/* ============================== vista tablero ============================ */

function buildCard(task) {
  const div = document.createElement('div');
  div.className = 'task-card';
  div.dataset.id = task.id;
  div.style.setProperty('--prio-color', priorityColor(task.prioridad));

  const title = document.createElement('div');
  title.className = 'task-card-title';
  title.textContent = task.nombre;
  div.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'task-card-meta';
  meta.innerHTML = `
    <span class="badge badge-strong"><span class="badge-dot" style="--dot-color:${marcaColor(task.marca)}"></span>${escapeHtml(marcaLabel(task.marca))}</span>
    <span class="badge">${escapeHtml(task.mes)}</span>
    <span class="badge"><span class="badge-dot" style="--dot-color:${categoryColor(task.categoria)}"></span>${escapeHtml(task.categoria)}</span>
    <span class="badge"><span class="badge-dot" style="--dot-color:${priorityColor(task.prioridad)}"></span>${escapeHtml(task.prioridad)}</span>
  `;
  div.appendChild(meta);

  const subtasks = task.subtasks || [];
  if (subtasks.length) {
    const done = subtasks.filter((s) => s.done).length;
    const pct = Math.round((done / subtasks.length) * 100);
    const wrap = document.createElement('div');
    wrap.className = 'task-card-progress';
    wrap.innerHTML = `
      <span>${done}/${subtasks.length}</span>
      <span class="progress-bar"><span class="progress-bar-fill" style="width:${pct}%"></span></span>
    `;
    div.appendChild(wrap);
  }

  div.addEventListener('click', () => openTaskModal(task.id));
  return div;
}

function renderBoard(filtered) {
  STATUSES.forEach((status) => {
    const list = els.lists[status];
    list.innerHTML = '';
    filtered.filter((t) => t.status === status).forEach((t) => list.appendChild(buildCard(t)));
    els.counts[status].textContent = list.children.length;
  });
}

function updateColumnCountsFromDom() {
  STATUSES.forEach((status) => {
    els.counts[status].textContent = els.lists[status].children.length;
  });
}

/* ============================== vista tabla ============================== */

function buildTableRow(task) {
  const tr = document.createElement('tr');
  tr.addEventListener('click', () => openTaskModal(task.id));

  const subtasks = task.subtasks || [];
  const progreso = subtasks.length ? `${subtasks.filter((s) => s.done).length}/${subtasks.length}` : '—';

  tr.innerHTML = `
    <td>${escapeHtml(task.nombre)}</td>
    <td><span class="badge"><span class="badge-dot" style="--dot-color:${marcaColor(task.marca)}"></span>${escapeHtml(marcaLabel(task.marca))}</span></td>
    <td>${escapeHtml(task.mes)}</td>
    <td><span class="badge"><span class="badge-dot" style="--dot-color:${statusColor(task.status)}"></span>${escapeHtml(task.status)}</span></td>
    <td><span class="badge"><span class="badge-dot" style="--dot-color:${priorityColor(task.prioridad)}"></span>${escapeHtml(task.prioridad)}</span></td>
    <td><span class="badge"><span class="badge-dot" style="--dot-color:${categoryColor(task.categoria)}"></span>${escapeHtml(task.categoria)}</span></td>
    <td>${task.apuntada || '—'}</td>
    <td>${task.terminada || '—'}</td>
    <td>${progreso}</td>
  `;
  return tr;
}

function renderTable(filtered) {
  els.tableBody.innerHTML = '';
  filtered.forEach((t) => els.tableBody.appendChild(buildTableRow(t)));
  els.tableEmpty.hidden = filtered.length !== 0;
}

/* ============================ vista estadísticas =========================== */

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_ABBR[Number(m) - 1]} ${y}`;
}

function buildTendenciaData(tasks) {
  const counts = {};
  tasks.filter((t) => t.status === 'Listo' && t.terminada).forEach((t) => {
    const ym = t.terminada.slice(0, 7);
    counts[ym] = (counts[ym] || 0) + 1;
  });
  const keys = Object.keys(counts).sort();
  let running = 0;
  const labels = [];
  const data = [];
  keys.forEach((k) => {
    running += counts[k];
    labels.push(monthLabel(k));
    data.push(running);
  });
  return { labels, data, counts, keys };
}

function renderChartTable(id, headers, rows) {
  const el = document.getElementById(id);
  if (!rows.length) {
    el.innerHTML = `<tbody><tr><td>Sin datos todavía.</td></tr></tbody>`;
    return;
  }
  el.innerHTML = `
    <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
  `;
}

function buildChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (state.charts[canvasId]) state.charts[canvasId].destroy();
  state.charts[canvasId] = new Chart(canvas, config);
}

function updateStatTiles(tasks) {
  const total = tasks.length;
  const listo = tasks.filter((t) => t.status === 'Listo').length;
  const curso = tasks.filter((t) => t.status === 'En curso').length;
  const pendientes = total - listo - curso;
  const horas = tasks.reduce((sum, t) => sum + (Number(t.horas) || 0), 0);
  const pct = total ? Math.round((listo / total) * 100) : 0;

  const tiles = [
    { label: 'Total tareas', value: total, color: cssVar('--accent') },
    { label: `Completadas (${pct}%)`, value: listo, color: cssVar('--status-good') },
    { label: 'En curso', value: curso, color: cssVar('--col-encurso') },
    { label: 'Pendientes', value: pendientes, color: cssVar('--status-warning') },
    { label: 'Horas registradas', value: Math.round(horas * 10) / 10, color: cssVar('--accent-2') },
  ];

  els.statsTiles.innerHTML = tiles.map((t) => `
    <div class="stat-tile">
      <div class="stat-tile-value"><span class="stat-tile-dot" style="background:${t.color}"></span>${t.value}</div>
      <div class="stat-tile-label">${escapeHtml(t.label)}</div>
    </div>
  `).join('');
}

function renderStats(list) {
  if (typeof Chart === 'undefined') return;
  const tasks = list || getFilteredTasks();
  updateStatTiles(tasks);

  const textColor = cssVar('--text-muted');
  const gridColor = cssVar('--border');
  const surface = cssVar('--bg-elevated');
  const accent = cssVar('--accent');

  const mesCounts = MONTHS.map((m) => tasks.filter((t) => t.mes === m).length);
  buildChart('chart-mes', {
    type: 'bar',
    data: { labels: MONTHS, datasets: [{ label: 'Tareas', data: mesCounts, backgroundColor: accent, borderRadius: 4, maxBarThickness: 34 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } },
      },
    },
  });
  renderChartTable('chart-mes-table', ['Mes', 'Tareas'], MONTHS.map((m, i) => [m, mesCounts[i]]));

  const marcaCounts = MARCAS.map((m) => tasks.filter((t) => t.marca === m).length);
  const marcaColors = MARCAS.map(marcaColor);
  buildChart('chart-marca', {
    type: 'doughnut',
    data: { labels: MARCAS.map(marcaLabel), datasets: [{ data: marcaCounts, backgroundColor: marcaColors, borderColor: surface, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, font: { size: 11 } } } },
    },
  });
  renderChartTable('chart-marca-table', ['Marca', 'Tareas'], MARCAS.map((m, i) => [marcaLabel(m), marcaCounts[i]]));

  const catCounts = CATEGORIES.map((c) => tasks.filter((t) => t.categoria === c).length);
  const catColors = CATEGORIES.map(categoryColor);
  buildChart('chart-categoria', {
    type: 'doughnut',
    data: { labels: CATEGORIES, datasets: [{ data: catCounts, backgroundColor: catColors, borderColor: surface, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, font: { size: 11 } } } },
    },
  });
  renderChartTable('chart-categoria-table', ['Categoría', 'Tareas'], CATEGORIES.map((c, i) => [c, catCounts[i]]));

  const prioCounts = PRIORITIES.map((p) => tasks.filter((t) => t.prioridad === p).length);
  const prioColors = PRIORITIES.map(priorityColor);
  buildChart('chart-prioridad', {
    type: 'doughnut',
    data: { labels: PRIORITIES, datasets: [{ data: prioCounts, backgroundColor: prioColors, borderColor: surface, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, font: { size: 11 } } } },
    },
  });
  renderChartTable('chart-prioridad-table', ['Prioridad', 'Tareas'], PRIORITIES.map((p, i) => [p, prioCounts[i]]));

  const tendencia = buildTendenciaData(tasks);
  buildChart('chart-tendencia', {
    type: 'line',
    data: {
      labels: tendencia.labels,
      datasets: [{
        label: 'Completadas (acumulado)',
        data: tendencia.data,
        borderColor: accent,
        backgroundColor: hexToRgba(accent, 0.15),
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: accent,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } },
      },
    },
  });
  renderChartTable('chart-tendencia-table', ['Mes', 'Completadas (acumulado)'], tendencia.keys.map((k, i) => [monthLabel(k), tendencia.data[i]]));
}

/* ========================= drag & drop (SortableJS) ======================== */

STATUSES.forEach((status) => {
  // eslint-disable-next-line no-undef
  new Sortable(els.lists[status], {
    group: 'board',
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: handleCardDrop,
  });
});

function handleCardDrop(evt) {
  const taskId = evt.item.dataset.id;
  const newStatus = evt.to.dataset.list;
  const oldStatus = evt.from.dataset.list;
  updateColumnCountsFromDom();
  if (newStatus === oldStatus) return;

  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const prevStatus = task.status;
  task.status = newStatus;
  updateStatsSummary();

  sbClient.from('tasks').update({ status: newStatus }).eq('id', taskId).then(({ error }) => {
    if (error) {
      task.status = prevStatus;
      showToast('No se pudo mover la tarea: ' + error.message, 'error');
      render();
    }
  });
}

/* ============================== modal =================================== */

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.tabPanel === tab));
}

function openTaskModal(taskId) {
  state.editingTaskId = taskId || null;
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : null;

  els.modalTitle.textContent = task ? 'Editar tarea' : 'Nueva tarea';
  els.deleteTaskBtn.hidden = !task;

  const defaultMes = state.filterMes !== 'Todos' ? state.filterMes : currentMesOrFallback('Febrero');
  const defaultMarca = state.filterMarca !== 'Todas' ? state.filterMarca : 'General';
  document.getElementById('field-nombre').value = task ? task.nombre : '';
  document.getElementById('field-marca').value = task ? task.marca || 'General' : defaultMarca;
  document.getElementById('field-mes').value = task ? task.mes : defaultMes;
  document.getElementById('field-status').value = task ? task.status : 'Sin empezar';
  document.getElementById('field-prioridad').value = task ? task.prioridad : 'Media';
  document.getElementById('field-categoria').value = task ? task.categoria : 'General';
  document.getElementById('field-apuntada').value = task ? (task.apuntada || '') : todayISO();
  document.getElementById('field-terminada').value = (task && task.terminada) || '';
  document.getElementById('field-horas').value = task && task.horas != null ? task.horas : '';
  document.getElementById('field-notas').value = (task && task.notas) || '';

  switchTab('detalles');
  renderSubtasksTab(task);
  renderHistoryTab(task);
  els.modalOverlay.hidden = false;
}

function closeModal() {
  els.modalOverlay.hidden = true;
  state.editingTaskId = null;
}

document.getElementById('new-task-btn').addEventListener('click', () => openTaskModal(null));
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('cancel-task-btn').addEventListener('click', closeModal);
els.taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('field-nombre').value.trim(),
    marca: document.getElementById('field-marca').value,
    mes: document.getElementById('field-mes').value,
    status: document.getElementById('field-status').value,
    prioridad: document.getElementById('field-prioridad').value,
    categoria: document.getElementById('field-categoria').value,
    apuntada: document.getElementById('field-apuntada').value || null,
    terminada: document.getElementById('field-terminada').value || null,
    horas: document.getElementById('field-horas').value === '' ? null : Number(document.getElementById('field-horas').value),
    notas: document.getElementById('field-notas').value,
  };
  if (!payload.nombre) return;

  const saveBtn = document.getElementById('save-task-btn');
  saveBtn.disabled = true;
  let error;
  if (state.editingTaskId) {
    ({ error } = await sbClient.from('tasks').update(payload).eq('id', state.editingTaskId));
  } else {
    const inserted = await sbClient.from('tasks').insert(payload).select().single();
    error = inserted.error;
    if (!error && inserted.data) state.editingTaskId = inserted.data.id;
  }
  saveBtn.disabled = false;

  if (error) {
    showToast('Error al guardar: ' + error.message, 'error');
    return;
  }

  showToast('Tarea guardada', 'success');
  await loadTasks();
  render();

  const updated = state.tasks.find((t) => t.id === state.editingTaskId);
  els.modalTitle.textContent = 'Editar tarea';
  els.deleteTaskBtn.hidden = false;
  renderSubtasksTab(updated);
  renderHistoryTab(updated);
});

els.deleteTaskBtn.addEventListener('click', async () => {
  if (!state.editingTaskId) return;
  if (!confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return;
  const { error } = await sbClient.from('tasks').delete().eq('id', state.editingTaskId);
  if (error) {
    showToast('Error al eliminar: ' + error.message, 'error');
    return;
  }
  state.tasks = state.tasks.filter((t) => t.id !== state.editingTaskId);
  render();
  closeModal();
  showToast('Tarea eliminada', 'success');
});

/* ------------------------------ subtareas -------------------------------- */

function renderSubtasksTab(task) {
  els.subtasksList.innerHTML = '';
  if (!task) {
    els.subtasksHint.hidden = false;
    els.subtaskAddForm.hidden = true;
    els.subtasksProgress.hidden = true;
    return;
  }
  els.subtasksHint.hidden = true;
  els.subtaskAddForm.hidden = false;

  const subtasks = [...(task.subtasks || [])].sort((a, b) => a.pos - b.pos);
  const pending = subtasks.filter((s) => !s.done);
  const done = subtasks.filter((s) => s.done);

  if (subtasks.length) {
    const pct = Math.round((done.length / subtasks.length) * 100);
    els.subtasksProgress.hidden = false;
    els.subtasksProgressLabel.textContent = `${done.length}/${subtasks.length}`;
    els.subtasksProgressFill.style.width = `${pct}%`;
  } else {
    els.subtasksProgress.hidden = true;
  }

  if (pending.length) {
    els.subtasksList.appendChild(buildSubtaskGroupLabel(`Pendientes · ${pending.length}`));
    pending.forEach((st) => els.subtasksList.appendChild(buildSubtaskItem(task.id, st)));
  }
  if (done.length) {
    els.subtasksList.appendChild(buildSubtaskGroupLabel(`Completadas · ${done.length}`));
    done.forEach((st) => els.subtasksList.appendChild(buildSubtaskItem(task.id, st)));
  }
}

function buildSubtaskGroupLabel(text) {
  const li = document.createElement('li');
  li.className = 'subtask-group-label';
  li.textContent = text;
  return li;
}

function buildSubtaskItem(taskId, st) {
  const li = document.createElement('li');
  li.className = 'subtask-item' + (st.done ? ' done' : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = st.done;
  cb.addEventListener('change', async () => {
    const checked = cb.checked;
    const { error } = await sbClient.from('subtasks').update({ done: checked }).eq('id', st.id);
    if (error) {
      showToast('Error al actualizar subtarea', 'error');
      cb.checked = !checked;
      return;
    }
    st.done = checked;
    render();
    renderSubtasksTab(state.tasks.find((t) => t.id === taskId));
  });

  const span = document.createElement('span');
  span.textContent = st.texto;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'subtask-remove';
  del.textContent = '✕';
  del.addEventListener('click', async () => {
    const { error } = await sbClient.from('subtasks').delete().eq('id', st.id);
    if (error) {
      showToast('Error al eliminar subtarea', 'error');
      return;
    }
    const task = state.tasks.find((t) => t.id === taskId);
    if (task) task.subtasks = (task.subtasks || []).filter((s) => s.id !== st.id);
    render();
    renderSubtasksTab(task);
  });

  li.append(cb, span, del);
  return li;
}

els.subtaskAddForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const taskId = state.editingTaskId;
  if (!taskId) return;
  const texto = els.subtaskInput.value.trim();
  if (!texto) return;
  const task = state.tasks.find((t) => t.id === taskId);
  const pos = task && task.subtasks ? task.subtasks.length : 0;

  const { data, error } = await sbClient.from('subtasks').insert({ task_id: taskId, texto, pos }).select().single();
  if (error) {
    showToast('Error al añadir subtarea', 'error');
    return;
  }
  if (task) {
    task.subtasks = task.subtasks || [];
    task.subtasks.push(data);
  }
  els.subtaskInput.value = '';
  renderSubtasksTab(task);
  render();
});

/* ------------------------------- historial -------------------------------- */

async function renderHistoryTab(task) {
  if (!task) {
    els.historyList.innerHTML = '<li class="history-item">Guarda la tarea primero.</li>';
    return;
  }
  els.historyList.innerHTML = '<li class="history-item">Cargando…</li>';
  const { data, error } = await sbClient
    .from('task_logs')
    .select('*')
    .eq('task_id', task.id)
    .order('changed_at', { ascending: false });

  if (error) {
    els.historyList.innerHTML = '<li class="history-item">Error al cargar historial.</li>';
    return;
  }
  if (!data.length) {
    els.historyList.innerHTML = '<li class="history-item">Sin historial todavía.</li>';
    return;
  }
  els.historyList.innerHTML = '';
  data.forEach((log) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const fromTxt = log.status_anterior ? escapeHtml(log.status_anterior) : 'Creada';
    li.innerHTML = `<div>${fromTxt} → <strong>${escapeHtml(log.status_nuevo)}</strong></div><time>${formatDateTime(log.changed_at)}</time>`;
    els.historyList.appendChild(li);
  });
}

/* ============================== exportar PDF =============================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const PDF_PAGE_W = 842;
const PDF_PAGE_H = 595;
const PDF_MARGIN = 28;
const PDF_TITLE_BLOCK_H = 46;
const PDF_COLHEAD_H = 18;
const PDF_FOOTER_H = 14;
const PDF_COLS = [
  { key: 'marca', label: 'Marca', width: 80 },
  { key: 'nombre', label: 'Tarea', width: 232 },
  { key: 'mes', label: 'Mes', width: 48 },
  { key: 'estado', label: 'Estado', width: 66 },
  { key: 'prioridad', label: 'Prioridad', width: 48 },
  { key: 'categoria', label: 'Categoría', width: 70 },
  { key: 'apuntada', label: 'Apuntada', width: 52 },
  { key: 'terminada', label: 'Terminada', width: 52 },
  { key: 'progreso', label: 'Progr.', width: 40 },
];

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function pdfColX() {
  let x = PDF_MARGIN;
  return PDF_COLS.map((c) => { const cx = x; x += c.width; return cx; });
}

function pdfWrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  let idx = 0;
  while (idx < words.length && lines.length < maxLines) {
    const w = words[idx];
    const test = cur ? cur + ' ' + w : w;
    if (!cur || ctx.measureText(test).width <= maxWidth) {
      cur = test;
      idx++;
    } else {
      lines.push(cur);
      cur = '';
    }
  }
  if (cur) lines.push(cur);
  if (idx < words.length) {
    let last = lines[lines.length - 1] || '';
    while (last.length && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  return lines.length ? lines : [''];
}

function buildPdfReportRows(tasks) {
  const rows = [];
  tasks.forEach((t) => {
    rows.push({ kind: 'task', task: t });
    [...(t.subtasks || [])].sort((a, b) => a.pos - b.pos).forEach((s) => rows.push({ kind: 'sub', sub: s }));
  });
  return rows;
}

function preparePdfRow(ctx, row) {
  const nombreColW = PDF_COLS[1].width - 8;
  if (row.kind === 'task') {
    ctx.font = 'bold 9px Helvetica';
    const lines = pdfWrapLines(ctx, row.task.nombre, nombreColW - 4, 2);
    return { ...row, lines, height: Math.max(lines.length, 1) * 11 + 6 };
  }
  ctx.font = '8px Helvetica';
  const prefix = row.sub.done ? '[x] ' : '[ ] ';
  const lines = pdfWrapLines(ctx, prefix + row.sub.texto, nombreColW - 16, 2);
  return { ...row, lines, height: Math.max(lines.length, 1) * 10 + 4 };
}

function paginatePdfRows(rows) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const prepared = rows.map((r) => preparePdfRow(ctx, r));
  const usableBottom = PDF_PAGE_H - PDF_MARGIN - PDF_FOOTER_H;
  const firstStartY = PDF_MARGIN + PDF_TITLE_BLOCK_H + PDF_COLHEAD_H;
  const otherStartY = PDF_MARGIN + PDF_COLHEAD_H;
  const pages = [];
  let current = [];
  let y = firstStartY;
  prepared.forEach((row) => {
    const startY = pages.length === 0 ? firstStartY : otherStartY;
    if (current.length && y + row.height > usableBottom) {
      pages.push(current);
      current = [];
      y = otherStartY;
    }
    if (!current.length) y = pages.length === 0 ? firstStartY : otherStartY;
    current.push(row);
    y += row.height;
  });
  if (current.length) pages.push(current);
  return pages;
}

function drawPdfCell(svg, x, y, rowHeight, text, opts) {
  const size = (opts && opts.size) || 8;
  const el = svgEl('text', {
    x, y: y + rowHeight / 2 + size / 3,
    'font-family': 'helvetica', 'font-size': size,
    fill: (opts && opts.color) || '#454b52',
  });
  el.textContent = text == null || text === '' ? '—' : String(text);
  svg.appendChild(el);
}

function buildPdfPageSVG(pageRows, opts) {
  const svg = svgEl('svg', { viewBox: `0 0 ${PDF_PAGE_W} ${PDF_PAGE_H}`, width: PDF_PAGE_W, height: PDF_PAGE_H });
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: PDF_PAGE_W, height: PDF_PAGE_H, fill: '#ffffff' }));

  let y = PDF_MARGIN;
  if (opts.isFirst) {
    const title = svgEl('text', { x: PDF_MARGIN, y: y + 16, 'font-family': 'helvetica', 'font-size': 17, 'font-weight': 'bold', fill: '#1c2126' });
    title.textContent = 'Tareas Alin Intec';
    svg.appendChild(title);
    const sub = svgEl('text', { x: PDF_MARGIN, y: y + 32, 'font-family': 'helvetica', 'font-size': 9, fill: '#626a73' });
    sub.textContent = `${opts.filterSummary} · generado ${opts.generatedAt}`;
    svg.appendChild(sub);
    y += PDF_TITLE_BLOCK_H;
  }

  const colX = pdfColX();
  svg.appendChild(svgEl('rect', { x: PDF_MARGIN, y, width: PDF_PAGE_W - PDF_MARGIN * 2, height: PDF_COLHEAD_H, fill: '#eceef1' }));
  PDF_COLS.forEach((c, i) => {
    const t = svgEl('text', { x: colX[i] + 4, y: y + 12.5, 'font-family': 'helvetica', 'font-size': 7.5, 'font-weight': 'bold', fill: '#626a73' });
    t.textContent = c.label.toUpperCase();
    svg.appendChild(t);
  });
  y += PDF_COLHEAD_H;

  pageRows.forEach((row) => {
    if (row.kind === 'task') {
      const t = row.task;
      svg.appendChild(svgEl('rect', { x: PDF_MARGIN, y, width: 3, height: row.height, fill: priorityColor(t.prioridad) }));
      drawPdfCell(svg, colX[0] + 4, y, row.height, marcaLabel(t.marca), { size: 8, color: '#1c2126' });
      row.lines.forEach((line, li) => {
        const el = svgEl('text', { x: colX[1] + 4, y: y + 12 + li * 11, 'font-family': 'helvetica', 'font-size': 9, 'font-weight': 'bold', fill: '#1c2126' });
        el.textContent = line;
        svg.appendChild(el);
      });
      drawPdfCell(svg, colX[2] + 4, y, row.height, t.mes);
      drawPdfCell(svg, colX[3] + 4, y, row.height, t.status);
      drawPdfCell(svg, colX[4] + 4, y, row.height, t.prioridad);
      drawPdfCell(svg, colX[5] + 4, y, row.height, t.categoria);
      drawPdfCell(svg, colX[6] + 4, y, row.height, t.apuntada);
      drawPdfCell(svg, colX[7] + 4, y, row.height, t.terminada);
      const subs = t.subtasks || [];
      drawPdfCell(svg, colX[8] + 4, y, row.height, subs.length ? `${subs.filter((s) => s.done).length}/${subs.length}` : '—');
    } else {
      const s = row.sub;
      row.lines.forEach((line, li) => {
        const el = svgEl('text', {
          x: colX[1] + 18, y: y + 10 + li * 10,
          'font-family': 'helvetica', 'font-size': 8,
          fill: s.done ? '#898781' : '#454b52',
          'text-decoration': s.done ? 'line-through' : 'none',
        });
        el.textContent = line;
        svg.appendChild(el);
      });
    }
    svg.appendChild(svgEl('line', {
      x1: PDF_MARGIN, x2: PDF_PAGE_W - PDF_MARGIN, y1: y + row.height, y2: y + row.height,
      stroke: '#dfe2e6', 'stroke-width': 0.5,
    }));
    y += row.height;
  });

  const foot = svgEl('text', {
    x: PDF_PAGE_W - PDF_MARGIN, y: PDF_PAGE_H - 12, 'text-anchor': 'end',
    'font-family': 'helvetica', 'font-size': 8, fill: '#898781',
  });
  foot.textContent = `Página ${opts.pageNum} de ${opts.totalPages}`;
  svg.appendChild(foot);

  return svg;
}

function buildPdfFilterSummary() {
  const parts = [state.filterMes !== 'Todos' ? state.filterMes : 'Todos los meses'];
  if (state.filterMarca !== 'Todas') parts.push(marcaLabel(state.filterMarca));
  if (state.filterCategoria !== 'Todas') parts.push(state.filterCategoria);
  if (state.filterPrioridad !== 'Todas') parts.push(state.filterPrioridad);
  if (state.filterQuery.trim()) parts.push(`"${state.filterQuery.trim()}"`);
  return parts.join(' · ');
}

async function exportPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('No se pudo cargar el generador de PDF', 'error');
    return;
  }
  const tasks = sortTasks(getFilteredTasks());
  if (!tasks.length) {
    showToast('No hay tareas para exportar con los filtros actuales', 'error');
    return;
  }

  const btn = els.exportPdfBtn;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generando…';

  try {
    const rows = buildPdfReportRows(tasks);
    const pages = paginatePdfRows(rows);
    const filterSummary = `${tasks.length} tareas · ${buildPdfFilterSummary()}`;
    const generatedAt = new Date().toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-99999px';
    document.body.appendChild(container);

    for (let i = 0; i < pages.length; i++) {
      const svg = buildPdfPageSVG(pages[i], {
        isFirst: i === 0,
        pageNum: i + 1,
        totalPages: pages.length,
        filterSummary,
        generatedAt,
      });
      container.appendChild(svg);
      if (i > 0) doc.addPage();
      // eslint-disable-next-line no-await-in-loop
      await doc.svg(svg, { x: 0, y: 0, width: PDF_PAGE_W, height: PDF_PAGE_H });
      container.removeChild(svg);
    }
    container.remove();

    const mesPart = state.filterMes !== 'Todos' ? state.filterMes.toLowerCase() : 'todas';
    doc.save(`tareas-${mesPart}-${todayISO()}.pdf`);
    showToast('PDF generado', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al generar el PDF: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

els.exportPdfBtn.addEventListener('click', exportPDF);

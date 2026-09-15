/* Tareas INTEC — tablero Kanban sobre Supabase */

const sbClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const STATUSES = ['Sin empezar', 'En curso', 'En espera', 'Parado', 'Listo'];
const PRIO_COLORS = { Alta: 'var(--danger)', Media: 'var(--warning)', Baja: 'var(--success)' };

const state = {
  session: null,
  tasks: [],
  filterMes: 'Todos',
  filterQuery: '',
  editingTaskId: null,
  channel: null,
  reloadTimer: null,
};

const els = {
  loginScreen: document.getElementById('login-screen'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  loginSubmit: document.getElementById('login-submit'),
  app: document.getElementById('app'),
  statsSummary: document.getElementById('stats-summary'),
  filterMes: document.getElementById('filter-mes'),
  filterSearch: document.getElementById('filter-search'),
  lists: {},
  counts: {},
  modalOverlay: document.getElementById('modal-overlay'),
  modalTitle: document.getElementById('modal-title'),
  taskForm: document.getElementById('task-form'),
  deleteTaskBtn: document.getElementById('delete-task-btn'),
  subtasksHint: document.getElementById('subtasks-hint'),
  subtasksList: document.getElementById('subtasks-list'),
  subtaskAddForm: document.getElementById('subtask-add-form'),
  subtaskInput: document.getElementById('subtask-input'),
  historyList: document.getElementById('history-list'),
  toastContainer: document.getElementById('toast-container'),
  themeToggle: document.getElementById('theme-toggle'),
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

/* ============================== render =================================== */

function getFilteredTasks() {
  const mes = state.filterMes;
  const q = state.filterQuery.trim().toLowerCase();
  return state.tasks.filter((t) => {
    if (mes !== 'Todos' && t.mes !== mes) return false;
    if (q) {
      const hay = `${t.nombre} ${t.notas || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function buildCard(task) {
  const div = document.createElement('div');
  div.className = 'task-card';
  div.dataset.id = task.id;
  div.style.setProperty('--prio-color', PRIO_COLORS[task.prioridad] || PRIO_COLORS.Media);

  const title = document.createElement('div');
  title.className = 'task-card-title';
  title.textContent = task.nombre;
  div.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'task-card-meta';
  meta.innerHTML = `
    <span class="badge">${escapeHtml(task.mes)}</span>
    <span class="badge">${escapeHtml(task.categoria)}</span>
    <span class="badge">${escapeHtml(task.prioridad)}</span>
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

function render() {
  const filtered = getFilteredTasks();
  STATUSES.forEach((status) => {
    const list = els.lists[status];
    list.innerHTML = '';
    filtered.filter((t) => t.status === status).forEach((t) => list.appendChild(buildCard(t)));
    els.counts[status].textContent = list.children.length;
  });
  updateStatsSummary();
}

function updateColumnCountsFromDom() {
  STATUSES.forEach((status) => {
    els.counts[status].textContent = els.lists[status].children.length;
  });
}

function updateStatsSummary() {
  const total = state.tasks.length;
  const listo = state.tasks.filter((t) => t.status === 'Listo').length;
  const pct = total ? Math.round((listo / total) * 100) : 0;
  els.statsSummary.textContent = `${total} tareas · ${listo} completadas (${pct}%)`;
}

/* ========================= filtros de la barra ============================ */

els.filterMes.addEventListener('change', (e) => {
  state.filterMes = e.target.value;
  render();
});

els.filterSearch.addEventListener('input', (e) => {
  state.filterQuery = e.target.value;
  render();
});

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

  const defaultMes = state.filterMes !== 'Todos' ? state.filterMes : 'Febrero';
  document.getElementById('field-nombre').value = task ? task.nombre : '';
  document.getElementById('field-mes').value = task ? task.mes : defaultMes;
  document.getElementById('field-status').value = task ? task.status : 'Sin empezar';
  document.getElementById('field-prioridad').value = task ? task.prioridad : 'Media';
  document.getElementById('field-categoria').value = task ? task.categoria : 'General';
  document.getElementById('field-apuntada').value = (task && task.apuntada) || '';
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
els.modalOverlay.addEventListener('click', (e) => {
  if (e.target === els.modalOverlay) closeModal();
});

els.taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('field-nombre').value.trim(),
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
    return;
  }
  els.subtasksHint.hidden = true;
  els.subtaskAddForm.hidden = false;
  const subtasks = [...(task.subtasks || [])].sort((a, b) => a.pos - b.pos);
  subtasks.forEach((st) => els.subtasksList.appendChild(buildSubtaskItem(task.id, st)));
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
    li.classList.toggle('done', checked);
    render();
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
    li.remove();
    render();
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

/* =============================================
   AI TRACKER — app.js
   Full logic: data layer, views, CRUD, notes,
   tags, search, import/export, autosave
============================================= */

// ===== DATA LAYER =====
const DB = {
  KEYS: {
    quests: 'ait_quests',
    tasks: 'ait_tasks',
    accounts: 'ait_accounts',
    globalNotes: 'ait_global_notes',
    questNotes: 'ait_quest_notes',
    platforms: 'ait_platforms',
    categories: 'ait_categories',
  },
  load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  },
  save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },
  get quests()      { return this.load(this.KEYS.quests); },
  get tasks()       { return this.load(this.KEYS.tasks); },
  get accounts()    { return this.load(this.KEYS.accounts); },
  get globalNotes() { return this.load(this.KEYS.globalNotes); },
  get questNotes()  { return this.load(this.KEYS.questNotes); },
  get platforms()   { return this.load(this.KEYS.platforms); },
  get categories()  { return this.load(this.KEYS.categories); },
  saveQuests(d)      { this.save(this.KEYS.quests, d); },
  saveTasks(d)       { this.save(this.KEYS.tasks, d); },
  saveAccounts(d)    { this.save(this.KEYS.accounts, d); },
  saveGlobalNotes(d) { this.save(this.KEYS.globalNotes, d); },
  saveQuestNotes(d)  { this.save(this.KEYS.questNotes, d); },
  savePlatforms(d)   { this.save(this.KEYS.platforms, d); },
  saveCategories(d)  { this.save(this.KEYS.categories, d); },
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function now() { return new Date().toISOString(); }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day:'2-digit', month:'short' }) + ' ' +
         d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
}
function calcDuration(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Default platforms
function getPlatforms() {
  const stored = DB.platforms;
  if (!stored.length) return ['Claude', 'ChatGPT', 'Gemini'];
  return stored;
}

// ===== VIEW ROUTER =====
let currentView = 'dashboard';
let currentQuestId = null;
let currentQuestStatusFilter = 'activa';
let currentQuestCategoryFilter = ''; // '' = Todas; si no, id de categoría
let currentQuestTaskFilter = 'pendientes'; // 'pendientes' (en_progreso + esperando_tokens) | '' (todas, incluye completadas)

function showView(name, questId) {
  // Si había una edición de nota de quest pendiente de autoguardar (el debounce
  // de 1.5s todavía no corrió), la guardamos YA antes de navegar. Si no,
  // DB.questNotes queda desactualizado y al volver a esta misma quest
  // renderQuestNotes()/loadQuestNoteEditor() recarga el valor viejo por encima
  // de lo que el usuario acaba de escribir — ver hallazgo de sesión 8 en
  // CONTEXT.md. flushQuestNoteAutosave() no hace nada si no hay nada pendiente.
  flushQuestNoteAutosave();
  closeSidebar(); // no-op on desktop; on mobile, navigating should close the open menu

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (navItem) navItem.classList.add('active');

  currentView = name;

  if (name === 'quest-detail' && questId) {
    if (currentQuestId !== questId) {
      currentQuestNoteId = null;
      currentQuestTaskFilter = 'pendientes'; // Q2: no arrastrar el filtro de una quest a otra
    }
    currentQuestId = questId;
    renderQuestDetail(questId);
    return;
  }

  const renders = {
    dashboard: renderDashboard,
    quests: renderQuests,
    tasks: renderTasks,
    accounts: renderAccounts,
    notes: renderGlobalNotes,
    stats: renderStats,
    settings: renderSettings,
  };
  if (renders[name]) renders[name]();
}

// ===== MOBILE NAV =====
// Hallazgo §8.5: en mobile el sidebar quedaba oculto (translateX(-100%)) sin ningún
// botón para volver a mostrarlo. Estas funciones controlan el botón hamburguesa
// (#mobile-nav-toggle) y el backdrop (#sidebar-backdrop) agregados en index.html.
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('open')) closeSidebar();
  else openSidebar();
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const toggle = document.getElementById('mobile-nav-toggle');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'true');
    const icon = toggle.querySelector('.mobile-nav-icon');
    if (icon) icon.textContent = '✕';
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const toggle = document.getElementById('mobile-nav-toggle');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    const icon = toggle.querySelector('.mobile-nav-icon');
    if (icon) icon.textContent = '☰';
  }
}

// ===== MODAL SYSTEM =====
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
  resetForms();
}
function closeModalOutside(e, id) {
  if (e.target.id === id) closeModal(id);
}
function resetForms() {
  ['quest-edit-id','quest-name','quest-desc','quest-status','quest-category',
   'task-edit-id','task-quest-id','task-account-id','task-title','task-desc','task-status','task-reactivation','task-notes-closure',
   'account-edit-id','account-email','account-alias','account-wait-id','account-wait-reactivation','account-wait-note','quick-note-title','new-platform-input'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  document.getElementById('modal-quest-title').textContent = 'Nueva Quest';
  document.getElementById('modal-task-title').textContent = 'Nueva Tarea';
  document.getElementById('modal-account-title').textContent = 'Nueva Cuenta';
  // Q5 (plan de cambios, Fase 3): un <input type="color"> no acepta value='' -- el
  // navegador lo interpretaría como negro (#000000), no como "sin elegir". Por eso no
  // entra en el array genérico de arriba (que sí sirve para SELECT/texto) y se resetea
  // acá aparte, a mano, al mismo violeta neutro que trae por defecto en el HTML. Sin
  // este reset, cancelar la edición de una cuenta de color rojo y después abrir
  // "+ Nueva Cuenta" arrancaría con el rojo pisado de la cuenta anterior.
  const colorInput = document.getElementById('account-color');
  if (colorInput) colorInput.value = '#7b5ea7';
  const wrap = document.getElementById('task-reactivation-wrap');
  if (wrap) wrap.style.display = 'none';
}

// ===== TOAST =====
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

// ===== TAG HELPERS =====
function initTagInput(inputId, displayId) {
  const input = document.getElementById(inputId);
  const display = document.getElementById(displayId);
  if (!input || !display) return;
  display._tags = display._tags || [];
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim().replace(/\s+/g, '_');
      if (!val) return;
      const tag = val.startsWith('#') ? val : '#' + val;
      if (!display._tags.includes(tag)) {
        display._tags.push(tag);
        renderTagsDisplay(displayId);
      }
      input.value = '';
    }
  };
}

function renderTagsDisplay(displayId) {
  const display = document.getElementById(displayId);
  if (!display) return;
  display.innerHTML = (display._tags || []).map(t =>
    `<span class="tag removable" onclick="removeTag('${displayId}','${t}')">${t}</span>`
  ).join('');
}

function removeTag(displayId, tag) {
  const display = document.getElementById(displayId);
  if (!display) return;
  display._tags = (display._tags || []).filter(t => t !== tag);
  renderTagsDisplay(displayId);
}

function setTags(displayId, tags) {
  const display = document.getElementById(displayId);
  if (!display) return;
  display._tags = [...(tags || [])];
  renderTagsDisplay(displayId);
}

function getTags(displayId) {
  const display = document.getElementById(displayId);
  return display ? [...(display._tags || [])] : [];
}

// ===== QUEST CRUD =====
function populateQuestCategorySelect() {
  const sel = document.getElementById('quest-category');
  if (!sel) return;
  const categories = DB.categories;
  sel.innerHTML = '<option value="">Sin categoría</option>' +
    categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
}

function saveQuest() {
  const name = document.getElementById('quest-name').value.trim();
  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
  const editId = document.getElementById('quest-edit-id').value;
  const quests = DB.quests;
  const categoryId = document.getElementById('quest-category').value || null;

  if (editId) {
    const idx = quests.findIndex(q => q.id === editId);
    if (idx !== -1) {
      quests[idx] = { ...quests[idx],
        name,
        desc: document.getElementById('quest-desc').value.trim(),
        status: document.getElementById('quest-status').value,
        categoryId,
        updatedAt: now(),
      };
    }
    showToast('Quest actualizada ✓', 'success');
  } else {
    quests.push({
      id: uid(), name,
      desc: document.getElementById('quest-desc').value.trim(),
      status: document.getElementById('quest-status').value,
      categoryId,
      createdAt: now(),
    });
    showToast('Quest creada ✓', 'success');
  }
  DB.saveQuests(quests);
  closeModal('modal-new-quest');
  if (currentView === 'quests') renderQuests();
  if (currentView === 'dashboard') renderDashboard();
}

function editQuest(id) {
  const q = DB.quests.find(q => q.id === id);
  if (!q) return;
  document.getElementById('quest-edit-id').value = q.id;
  document.getElementById('quest-name').value = q.name;
  document.getElementById('quest-desc').value = q.desc || '';
  document.getElementById('quest-status').value = q.status || 'activa';
  document.getElementById('modal-quest-title').textContent = 'Editar Quest';
  populateQuestCategorySelect();
  document.getElementById('quest-category').value = q.categoryId || '';
  openModal('modal-new-quest');
}

function deleteQuest(id) {
  if (!confirm('¿Eliminar esta quest y todas sus tareas y notas?')) return;
  let quests = DB.quests.filter(q => q.id !== id);
  const removedTaskIds = DB.tasks.filter(t => t.questId === id).map(t => t.id);
  let tasks = DB.tasks.filter(t => t.questId !== id);
  let qNotes = DB.questNotes.filter(n => n.questId !== id);

  // Liberar cuentas que quedaron apuntando a una tarea de esta quest (hallazgo §8.1)
  if (removedTaskIds.length) {
    const accounts = DB.accounts;
    let accountsChanged = false;
    accounts.forEach(a => {
      if (a.activeTaskId && removedTaskIds.includes(a.activeTaskId)) {
        a.status = 'free';
        a.activeTaskId = null;
        accountsChanged = true;
      }
    });
    if (accountsChanged) DB.saveAccounts(accounts);
  }

  DB.saveQuests(quests);
  DB.saveTasks(tasks);
  DB.saveQuestNotes(qNotes);
  showToast('Quest eliminada', 'error');
  if (currentView === 'quest-detail') showView('quests');
  else renderQuests();
  if (currentView === 'accounts') renderAccounts();
  if (currentView === 'dashboard') renderDashboard();
}

function editCurrentQuest() { editQuest(currentQuestId); }
function deleteCurrentQuest() { deleteQuest(currentQuestId); }

// ===== TASK CRUD =====
function populateTaskModal(editingTaskId) {
  const questSel = document.getElementById('task-quest-id');
  const accSel = document.getElementById('task-account-id');
  const editId = editingTaskId || document.getElementById('task-edit-id').value;
  const quests = DB.quests;
  const accounts = DB.accounts;

  questSel.innerHTML = quests.length
    ? quests.map(q => `<option value="${q.id}">${escHtml(q.name)}</option>`).join('')
    : '<option value="">— Sin quests —</option>';

  // La cuenta ya asignada a la tarea en edición sigue elegible aunque figure "ocupada"
  // (está ocupada por esta misma tarea) — hallazgo §8.3.
  const currentTask = editId ? DB.tasks.find(t => t.id === editId) : null;
  const ownAccountId = currentTask ? currentTask.accountId : null;

  const freeParts = accounts.filter(a => a.status === 'free')
    .map(a => `<option value="${a.id}">[${escHtml(a.platform)}] ${escHtml(a.alias || a.email)}</option>`);
  const busyParts = accounts.filter(a => a.status !== 'free').map(a => {
    const isOwn = a.id === ownAccountId;
    const label = isOwn ? ' (ocupada por esta tarea)' : (a.status === 'esperando_tokens' ? ' (esperando tokens)' : ' (ocupada)');
    const disabledAttr = isOwn ? '' : 'disabled';
    return `<option value="${a.id}" style="color:var(--danger)" ${disabledAttr}>[${escHtml(a.platform)}] ${escHtml(a.alias || a.email)}${label}</option>`;
  });

  accSel.innerHTML = accounts.length
    ? freeParts.join('') + (busyParts.length ? '<optgroup label="No disponibles">' + busyParts.join('') + '</optgroup>' : '')
    : '<option value="">— Sin cuentas —</option>';

  // Pre-select if in quest detail
  if (currentQuestId && !editId) {
    questSel.value = currentQuestId;
  }
}

function openNewTaskForQuest() {
  resetForms();
  populateTaskModal();
  if (currentQuestId) document.getElementById('task-quest-id').value = currentQuestId;
  openModal('modal-new-task');
}

function saveTask() {
  const questId = document.getElementById('task-quest-id').value;
  const accountId = document.getElementById('task-account-id').value;
  const title = document.getElementById('task-title').value.trim();
  const desc = document.getElementById('task-desc').value.trim();
  if (!questId || !accountId || !desc) {
    showToast('Completa los campos obligatorios', 'error');
    return;
  }

  const editId = document.getElementById('task-edit-id').value;
  const status = document.getElementById('task-status').value;
  // Q3 (plan de cambios): estos dos campos comparten un solo wrap que sólo se ve con
  // toggleReactivationField() cuando status==='esperando_tokens', pero el input seguía
  // guardando su valor viejo aunque quedara oculto -- por eso una tarea marcada
  // completada después de haber esperado tokens seguía mostrando la fecha/nota vieja
  // en las tarjetas. Sólo se persisten mientras el estado sea esperando_tokens.
  const reactivation = status === 'esperando_tokens' ? document.getElementById('task-reactivation').value : '';
  const notesClosure = status === 'esperando_tokens' ? document.getElementById('task-notes-closure').value.trim() : '';
  let tasks = DB.tasks;
  let accounts = DB.accounts;

  // No permitir asignar una cuenta que ya está ocupada por OTRA tarea, o que está
  // marcada esperando tokens (hallazgo §8.3, extendido para el estado nuevo).
  // Si es la propia cuenta de la tarea que se está editando, sí se permite (no cambia nada).
  const chosenAccount = accounts.find(a => a.id === accountId);
  if (chosenAccount && chosenAccount.status !== 'free' && chosenAccount.activeTaskId !== editId) {
    showToast('Esa cuenta no está disponible. Libérala o elige otra.', 'error');
    return;
  }

  if (editId) {
    const idx = tasks.findIndex(t => t.id === editId);
    if (idx !== -1) {
      const old = tasks[idx];
      // Release old account if account changed or status changed to completada
      if (old.accountId !== accountId || (status === 'completada' && old.status !== 'completada')) {
        const oldAccIdx = accounts.findIndex(a => a.id === old.accountId);
        if (oldAccIdx !== -1) {
          accounts[oldAccIdx].status = 'free';
          accounts[oldAccIdx].activeTaskId = null;
        }
      }
      tasks[idx] = { ...old, questId, accountId, title, desc, status, reactivation, notesClosure,
        updatedAt: now(),
        completedAt: status === 'completada' ? (old.completedAt || now()) : null,
      };
    }
  } else {
    // Número correlativo por quest: max existente + 1, no cantidad + 1 (hallazgo §8.4).
    // Evita reusar un taskNumber si se borró una tarea intermedia.
    const questTasks = tasks.filter(t => t.questId === questId);
    const maxTaskNumber = questTasks.reduce((max, t) => Math.max(max, t.taskNumber || 0), 0);
    const newTask = {
      id: uid(), questId, accountId, title, desc, status, reactivation, notesClosure,
      taskNumber: maxTaskNumber + 1, createdAt: now(),
      completedAt: status === 'completada' ? now() : null,
    };
    tasks.push(newTask);
  }

  // Update account status
  const accIdx = accounts.findIndex(a => a.id === accountId);
  if (accIdx !== -1) {
    if (status === 'completada') {
      accounts[accIdx].status = 'free';
      accounts[accIdx].activeTaskId = null;
    } else {
      accounts[accIdx].status = 'busy';
      accounts[accIdx].activeTaskId = editId || tasks[tasks.length - 1].id;
    }
  }

  DB.saveTasks(tasks);
  DB.saveAccounts(accounts);
  closeModal('modal-new-task');
  showToast(editId ? 'Tarea actualizada ✓' : 'Tarea creada ✓', 'success');
  if (currentView === 'quest-detail') renderQuestDetail(currentQuestId);
  else if (currentView === 'tasks') renderTasks();
  else if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'accounts') renderAccounts();
}

function editTask(id) {
  const t = DB.tasks.find(t => t.id === id);
  if (!t) return;
  resetForms();
  populateTaskModal(id);
  document.getElementById('task-edit-id').value = t.id;
  document.getElementById('task-quest-id').value = t.questId;
  document.getElementById('task-account-id').value = t.accountId;
  document.getElementById('task-title').value = t.title || '';
  document.getElementById('task-desc').value = t.desc || '';
  document.getElementById('task-status').value = t.status || 'en_progreso';
  document.getElementById('task-reactivation').value = t.reactivation || '';
  document.getElementById('task-notes-closure').value = t.notesClosure || '';
  document.getElementById('modal-task-title').textContent = 'Editar Tarea';
  toggleReactivationField();
  openModal('modal-new-task');
}

function deleteTask(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  let tasks = DB.tasks;
  const task = tasks.find(t => t.id === id);
  if (task) {
    let accounts = DB.accounts;
    const accIdx = accounts.findIndex(a => a.id === task.accountId);
    if (accIdx !== -1 && accounts[accIdx].activeTaskId === id) {
      accounts[accIdx].status = 'free';
      accounts[accIdx].activeTaskId = null;
      DB.saveAccounts(accounts);
    }
  }
  DB.saveTasks(tasks.filter(t => t.id !== id));
  showToast('Tarea eliminada');
  if (currentView === 'quest-detail') renderQuestDetail(currentQuestId);
  else renderTasks();
}

function toggleReactivationField() {
  const status = document.getElementById('task-status').value;
  const wrap = document.getElementById('task-reactivation-wrap');
  if (wrap) wrap.style.display = status === 'esperando_tokens' ? 'block' : 'none';
}

// ===== ACCOUNT CRUD =====
function populateAccountPlatformSelect() {
  const sel = document.getElementById('account-platform');
  const platforms = getPlatforms();
  sel.innerHTML = platforms.map(p => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');
}

function saveAccount() {
  const platform = document.getElementById('account-platform').value;
  const email = document.getElementById('account-email').value.trim();
  const alias = document.getElementById('account-alias').value.trim();
  const color = document.getElementById('account-color').value;
  if (!email) { showToast('El email es obligatorio', 'error'); return; }

  const editId = document.getElementById('account-edit-id').value;
  let accounts = DB.accounts;

  if (editId) {
    const idx = accounts.findIndex(a => a.id === editId);
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], platform, email, alias, color, updatedAt: now() };
    }
    showToast('Cuenta actualizada ✓', 'success');
  } else {
    accounts.push({ id: uid(), platform, email, alias, color, status: 'free', activeTaskId: null, createdAt: now() });
    showToast('Cuenta agregada ✓', 'success');
  }
  DB.saveAccounts(accounts);
  closeModal('modal-new-account');
  if (currentView === 'accounts') renderAccounts();
  if (currentView === 'settings') renderSettings();
}

function editAccount(id) {
  const a = DB.accounts.find(a => a.id === id);
  if (!a) return;
  populateAccountPlatformSelect();
  document.getElementById('account-edit-id').value = a.id;
  document.getElementById('account-platform').value = a.platform;
  document.getElementById('account-email').value = a.email;
  document.getElementById('account-alias').value = a.alias || '';
  document.getElementById('account-color').value = a.color || '#7b5ea7';
  document.getElementById('modal-account-title').textContent = 'Editar Cuenta';
  openModal('modal-new-account');
}

function deleteAccount(id) {
  const account = DB.accounts.find(a => a.id === id);
  if (!account) return;

  const linkedTasks = DB.tasks.filter(t => t.accountId === id);
  const activeLinkedTasks = linkedTasks.filter(t => t.status !== 'completada');

  let msg = '¿Eliminar esta cuenta?';
  if (activeLinkedTasks.length) {
    msg = `Esta cuenta tiene ${activeLinkedTasks.length} tarea(s) activa(s) asociada(s). ` +
          `Si la eliminas, esas tareas quedarán sin cuenta asignada. ¿Eliminar de todas formas?`;
  } else if (linkedTasks.length) {
    msg = `Esta cuenta tiene ${linkedTasks.length} tarea(s) asociada(s) (ya completadas). ` +
          `Si la eliminas, esas tareas quedarán sin cuenta asignada. ¿Eliminar de todas formas?`;
  }
  if (!confirm(msg)) return;

  // Limpiar la referencia huérfana en las tareas que apuntaban a esta cuenta (hallazgo §8.2)
  if (linkedTasks.length) {
    const tasks = DB.tasks.map(t => t.accountId === id ? { ...t, accountId: null, updatedAt: now() } : t);
    DB.saveTasks(tasks);
  }

  const accounts = DB.accounts.filter(a => a.id !== id);
  DB.saveAccounts(accounts);
  showToast('Cuenta eliminada');
  renderAccounts();
  if (currentView === 'tasks') renderTasks();
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'quest-detail') renderQuestDetail(currentQuestId);
}

function freeAccount(id) {
  const accounts = DB.accounts;
  const idx = accounts.findIndex(a => a.id === id);
  if (idx !== -1) {
    const taskId = accounts[idx].activeTaskId;
    accounts[idx].status = 'free';
    accounts[idx].activeTaskId = null;
    accounts[idx].waitReactivation = '';
    accounts[idx].waitNote = '';
    DB.saveAccounts(accounts);
    if (taskId) {
      const tasks = DB.tasks;
      const tIdx = tasks.findIndex(t => t.id === taskId);
      if (tIdx !== -1) { tasks[tIdx].status = 'completada'; tasks[tIdx].completedAt = now(); DB.saveTasks(tasks); }
    }
    showToast('Cuenta liberada ✓', 'success');
    renderAccounts();
  }
}

// Marcar una cuenta libre como "esperando tokens" sin necesidad de crear una tarea
// (pedido del usuario: se acaban los tokens y no siempre hay una tarea pendiente).
function markAccountWaiting(id) {
  const a = DB.accounts.find(a => a.id === id);
  if (!a || a.status !== 'free') return;
  document.getElementById('account-wait-id').value = id;
  document.getElementById('account-wait-reactivation').value = '';
  document.getElementById('account-wait-note').value = '';
  openModal('modal-account-wait');
}

function saveAccountWait() {
  const id = document.getElementById('account-wait-id').value;
  const reactivation = document.getElementById('account-wait-reactivation').value;
  const note = document.getElementById('account-wait-note').value.trim();
  const accounts = DB.accounts;
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) return;
  accounts[idx].status = 'esperando_tokens';
  accounts[idx].waitReactivation = reactivation;
  accounts[idx].waitNote = note;
  accounts[idx].updatedAt = now();
  DB.saveAccounts(accounts);
  closeModal('modal-account-wait');
  showToast('Cuenta marcada esperando tokens ⏳', 'success');
  renderAccounts();
  if (currentView === 'dashboard') renderDashboard();
}

// ===== AUTO-RELEASE: liberar cuentas/tareas cuando pasa su hora de reactivación =====
// Antes había que mirar el reloj y liberar la cuenta a mano (o reeditar la tarea)
// apenas se cumplía el plazo. Esto corre sin intervención: al cargar la app (por si
// algo venció mientras estaba cerrada), cada cierto intervalo mientras sigue abierta,
// y de nuevo apenas la pestaña recupera foco/visibilidad — los timers de una pestaña
// en segundo plano o con el equipo dormido se frenan o se limitan mucho, así que sin
// este último chequeo la detección podría demorar varios minutos después de volver.
const autoReleaseCheckMs = 30000;

function checkAutoReleases() {
  const nowDate = new Date();
  const tasks = DB.tasks;
  const accounts = DB.accounts;
  let tasksChanged = false;
  let accountsChanged = false;
  const notifications = [];

  // Caso 1: tarea "esperando tokens" cuya hora de reactivación ya pasó. La cuenta
  // asociada ya figura 'busy' desde que se creó la tarea (saveTask() la deja así sin
  // importar si la tarea está en_progreso o esperando_tokens — decisión de diseño en
  // §7 de CONTEXT.md), así que no hay que tocar la cuenta: sólo la tarea vuelve a
  // en_progreso, tal como se pidió (no se marca completada — eso sigue siendo una
  // decisión manual del usuario, igual que hoy).
  tasks.forEach(t => {
    if (t.status === 'esperando_tokens' && t.reactivation && new Date(t.reactivation) <= nowDate) {
      t.status = 'en_progreso';
      t.reactivation = ''; // ya cumplió su función; evita un badge "⟳ [hora ya pasada]" en una tarea que ya está en progreso
      t.updatedAt = now();
      tasksChanged = true;
      const acc = accounts.find(a => a.id === t.accountId);
      const accLabel = acc ? `[${acc.platform}] ${acc.alias || acc.email}` : 'Cuenta';
      const taskLabel = `Tarea #${t.taskNumber}` + (t.title ? ` "${t.title.slice(0, 30)}"` : '');
      notifications.push(`⟳ ${accLabel} — ${taskLabel} en progreso otra vez ✓`);
    }
  });

  // Caso 2: cuenta marcada "esperando tokens" sin tarea asociada, cuya hora ya
  // pasó. Mismo resultado que apretar "✓ Ya tengo tokens" a mano (freeAccount()
  // completaría una tarea si hubiera una asociada, pero acá activeTaskId siempre es
  // null — markAccountWaiting() sólo aplica a cuentas ya libres).
  accounts.forEach(a => {
    if (a.status === 'esperando_tokens' && a.waitReactivation && new Date(a.waitReactivation) <= nowDate) {
      a.status = 'free';
      a.waitReactivation = '';
      a.waitNote = '';
      a.updatedAt = now();
      accountsChanged = true;
      notifications.push(`⟳ [${a.platform}] ${a.alias || a.email} — cuenta libre otra vez ✓`);
    }
  });

  if (tasksChanged) DB.saveTasks(tasks);
  if (accountsChanged) DB.saveAccounts(accounts);
  if (!notifications.length) return;

  // El toast (#toast) es un único elemento — dos showToast() seguidos pisan el
  // mensaje anterior en vez de mostrar ambos. Como esta misma pasada puede liberar
  // más de una cuenta/tarea (típico al reabrir la app después de varias horas), se
  // encolan en vez de perderse todas menos la última.
  const maxIndividualReleaseToasts = 3;
  notifications.slice(0, maxIndividualReleaseToasts).forEach(msg => queueReleaseToast(msg));
  if (notifications.length > maxIndividualReleaseToasts) {
    queueReleaseToast(`⟳ +${notifications.length - maxIndividualReleaseToasts} cuenta(s)/tarea(s) más liberadas ✓`);
  }

  // Sólo refresca lo que puede haber cambiado, sin pasar por renderQuestDetail():
  // esa función también llama a renderQuestNotes(), que recarga el editor de notas
  // desde DB y pisaría una edición sin guardar todavía (mismo riesgo que el hallazgo
  // de la sesión 8). Como esta función nunca toca notas, alcanza con refrescar
  // tareas/stats de la quest actual directamente.
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'accounts') renderAccounts();
  else if (currentView === 'tasks') renderTasks();
  else if (currentView === 'quest-detail' && currentQuestId) {
    renderQuestTasks(currentQuestId);
    renderQuestStats(currentQuestId);
  }
}

let releaseToastQueue = [];
let releaseToastBusy = false;
const releaseToastVisibleMs = 3200;

function queueReleaseToast(msg) {
  releaseToastQueue.push(msg);
  if (!releaseToastBusy) drainReleaseToastQueue();
}

function drainReleaseToastQueue() {
  const msg = releaseToastQueue.shift();
  if (msg === undefined) { releaseToastBusy = false; return; }
  releaseToastBusy = true;
  showToast(msg, 'success');
  setTimeout(drainReleaseToastQueue, releaseToastVisibleMs);
}

// ===== NOTES CRUD =====
// --- Global Notes ---
let currentGlobalNoteId = null;
let globalNoteAutosaveTimer = null;

function newGlobalNote() {
  const notes = DB.globalNotes;
  const note = { id: uid(), title: 'Nueva nota', body: '', tags: [], createdAt: now(), updatedAt: now() };
  notes.unshift(note);
  DB.saveGlobalNotes(notes);
  currentGlobalNoteId = note.id;
  renderGlobalNotes();
  showToast('Nota creada ✓', 'success');
}

function createQuickGlobalNote() {
  const title = document.getElementById('quick-note-title').value.trim() || 'Nueva nota';
  const notes = DB.globalNotes;
  const note = { id: uid(), title, body: '', tags: [], createdAt: now(), updatedAt: now() };
  notes.unshift(note);
  DB.saveGlobalNotes(notes);
  closeModal('modal-new-note-global');
  currentGlobalNoteId = note.id;
  showView('notes');
}

function renderGlobalNotes() {
  let notes = DB.globalNotes;
  const search = document.getElementById('global-note-search')?.value.toLowerCase() || '';
  const activeFilters = getActiveTagFilters('global-note-tag-filters');

  // Build tag filter UI
  const allTags = [...new Set(notes.flatMap(n => n.tags || []))];
  renderTagFilterBar('global-note-tag-filters', allTags, renderGlobalNotes);

  if (search) notes = notes.filter(n => n.title.toLowerCase().includes(search) || (n.body||'').toLowerCase().includes(search));
  if (activeFilters.length) notes = notes.filter(n => activeFilters.every(t => (n.tags||[]).includes(t)));

  const list = document.getElementById('global-notes-list');
  list.innerHTML = notes.length
    ? notes.map(n => `
      <div class="note-nav-item ${n.id === currentGlobalNoteId ? 'active' : ''}" onclick="selectGlobalNote('${n.id}')">
        <div class="note-nav-title">${escHtml(n.title)}</div>
        <div class="note-nav-date">${fmtDate(n.updatedAt)}</div>
        ${(n.tags||[]).map(t => `<span class="tag" style="font-size:10px;padding:1px 5px;">${t}</span>`).join('')}
      </div>`)
    .join('')
    : '<div style="color:var(--muted);font-size:12px;padding:8px;">Sin notas</div>';

  if (currentGlobalNoteId) {
    const note = DB.globalNotes.find(n => n.id === currentGlobalNoteId);
    if (note) loadGlobalNoteEditor(note);
    else { currentGlobalNoteId = null; hideGlobalEditor(); }
  } else {
    hideGlobalEditor();
  }
}

function hideGlobalEditor() {
  document.getElementById('notes-empty-state').style.display = 'flex';
  document.getElementById('notes-editor-content').style.display = 'none';
}

function loadGlobalNoteEditor(note) {
  document.getElementById('notes-empty-state').style.display = 'none';
  const ec = document.getElementById('notes-editor-content');
  ec.style.display = 'flex';
  document.getElementById('global-note-title').value = note.title;
  document.getElementById('global-note-body').value = note.body || '';
  setTags('global-note-tags-display', note.tags || []);
  document.getElementById('global-note-save-status').textContent = '';
}

function selectGlobalNote(id) {
  currentGlobalNoteId = id;
  const note = DB.globalNotes.find(n => n.id === id);
  if (note) {
    renderGlobalNotes();
    loadGlobalNoteEditor(note);
  }
}

function autosaveGlobalNote() {
  clearTimeout(globalNoteAutosaveTimer);
  document.getElementById('global-note-save-status').textContent = 'Guardando...';
  globalNoteAutosaveTimer = setTimeout(() => {
    if (!currentGlobalNoteId) return;
    const notes = DB.globalNotes;
    const idx = notes.findIndex(n => n.id === currentGlobalNoteId);
    if (idx !== -1) {
      notes[idx].title = document.getElementById('global-note-title').value || 'Sin título';
      notes[idx].body = document.getElementById('global-note-body').value;
      notes[idx].tags = getTags('global-note-tags-display');
      notes[idx].updatedAt = now();
      DB.saveGlobalNotes(notes);
      document.getElementById('global-note-save-status').textContent = '✓ Guardado';
      renderGlobalNotesList();
    }
  }, 1500);
}

function renderGlobalNotesList() {
  let notes = DB.globalNotes;
  const list = document.getElementById('global-notes-list');
  if (!list) return;
  list.innerHTML = notes.map(n => `
    <div class="note-nav-item ${n.id === currentGlobalNoteId ? 'active' : ''}" onclick="selectGlobalNote('${n.id}')">
      <div class="note-nav-title">${escHtml(n.title)}</div>
      <div class="note-nav-date">${fmtDate(n.updatedAt)}</div>
    </div>`).join('');
}

function deleteCurrentGlobalNote() {
  if (!currentGlobalNoteId) return;
  if (!confirm('¿Eliminar esta nota?')) return;
  const notes = DB.globalNotes.filter(n => n.id !== currentGlobalNoteId);
  DB.saveGlobalNotes(notes);
  currentGlobalNoteId = notes.length ? notes[0].id : null;
  showToast('Nota eliminada');
  renderGlobalNotes();
}

// --- Quest Notes ---
let currentQuestNoteId = null;
let questNoteAutosaveTimer = null;

function newQuestNote() {
  if (!currentQuestId) return;
  flushQuestNoteAutosave(); // no perder una edición pendiente de la nota que se estaba viendo
  const notes = DB.questNotes;
  const note = { id: uid(), questId: currentQuestId, title: 'Nueva nota', body: '', tags: [], createdAt: now(), updatedAt: now() };
  notes.unshift(note);
  DB.saveQuestNotes(notes);
  currentQuestNoteId = note.id;
  renderQuestNotes();
}

function renderQuestNotesList() {
  const notes = DB.questNotes.filter(n => n.questId === currentQuestId);
  const list = document.getElementById('qd-notes-list');
  if (!list) return;
  list.innerHTML = notes.length
    ? notes.map(n => `
      <div class="note-nav-item ${n.id === currentQuestNoteId ? 'active' : ''}" onclick="selectQuestNote('${n.id}')">
        <div class="note-nav-title">${escHtml(n.title)}</div>
        <div class="note-nav-date">${fmtDate(n.updatedAt)}</div>
      </div>`).join('')
    : '<div style="color:var(--muted);font-size:12px;padding:8px;">Sin notas</div>';
}

function renderQuestNotes() {
  const notes = DB.questNotes.filter(n => n.questId === currentQuestId);
  renderQuestNotesList();

  if (currentQuestNoteId) {
    const note = notes.find(n => n.id === currentQuestNoteId);
    if (note) {
      loadQuestNoteEditor(note);
    } else {
      currentQuestNoteId = null;
      clearQuestNoteEditor();
    }
  } else {
    clearQuestNoteEditor();
  }
}

function clearQuestNoteEditor() {
  document.getElementById('qd-note-title').value = '';
  document.getElementById('qd-note-body').value = '';
  setTags('qd-note-tags-display', []);
  document.getElementById('qd-note-save-status').textContent = '';
  document.getElementById('qd-note-delete-btn').style.display = 'none';
}

function selectQuestNote(id) {
  flushQuestNoteAutosave(); // no perder una edición pendiente de la nota que se estaba viendo
  currentQuestNoteId = id;
  const note = DB.questNotes.find(n => n.id === id);
  if (note) { renderQuestNotes(); loadQuestNoteEditor(note); }
}

function loadQuestNoteEditor(note) {
  document.getElementById('qd-note-title').value = note.title;
  document.getElementById('qd-note-body').value = note.body || '';
  setTags('qd-note-tags-display', note.tags || []);
  document.getElementById('qd-note-save-status').textContent = '';
  document.getElementById('qd-note-delete-btn').style.display = 'inline-flex';
}

function commitQuestNoteSave() {
  if (!currentQuestNoteId) return false;
  const notes = DB.questNotes;
  const idx = notes.findIndex(n => n.id === currentQuestNoteId);
  if (idx === -1) return false;
  notes[idx].title = document.getElementById('qd-note-title').value || 'Sin título';
  notes[idx].body = document.getElementById('qd-note-body').value;
  notes[idx].tags = getTags('qd-note-tags-display');
  notes[idx].updatedAt = now();
  DB.saveQuestNotes(notes);
  return true;
}

function autosaveQuestNote() {
  clearTimeout(questNoteAutosaveTimer);
  document.getElementById('qd-note-save-status').textContent = 'Guardando...';
  questNoteAutosaveTimer = setTimeout(() => {
    questNoteAutosaveTimer = null;
    if (commitQuestNoteSave()) {
      document.getElementById('qd-note-save-status').textContent = '✓ Guardado';
      // Solo refresca la lista lateral (título/fecha), no el editor completo:
      // renderQuestNotes() recarga la nota vía loadQuestNoteEditor(), que
      // resetea qd-note-save-status a '' y pisaba el '✓ Guardado' de la línea
      // anterior en el mismo tick, antes de que el navegador llegara a pintarlo.
      renderQuestNotesList();
    }
  }, 1500);
}

// Guarda de inmediato un cambio pendiente (sin esperar los 1.5s del debounce)
// y cancela el timer. Se llama antes de cualquier acción que cambie de nota,
// de quest o de vista — si no, un DB.questNotes desactualizado le "gana la
// carrera" al timer: renderQuestNotes()/loadQuestNoteEditor() recarga el
// valor viejo por encima de lo recién escrito, y cuando el timer finalmente
// corre, guarda ese valor viejo (efectivamente descartando la edición).
// No hace nada si no hay ningún autoguardado pendiente.
function flushQuestNoteAutosave() {
  if (!questNoteAutosaveTimer) return;
  clearTimeout(questNoteAutosaveTimer);
  questNoteAutosaveTimer = null;
  commitQuestNoteSave();
}

function deleteCurrentQuestNote() {
  if (!currentQuestNoteId) return;
  if (!confirm('¿Eliminar esta nota?')) return;
  clearTimeout(questNoteAutosaveTimer); // la nota se borra, no tiene sentido autoguardarla
  questNoteAutosaveTimer = null;
  const notes = DB.questNotes.filter(n => n.id !== currentQuestNoteId);
  DB.saveQuestNotes(notes);
  const remaining = notes.filter(n => n.questId === currentQuestId);
  currentQuestNoteId = remaining.length ? remaining[0].id : null;
  showToast('Nota eliminada');
  renderQuestNotes();
}

// ===== TAG FILTER BAR =====
function getActiveTagFilters(barId) {
  const bar = document.getElementById(barId);
  if (!bar) return [];
  return [...bar.querySelectorAll('.tag.active')].map(t => t.dataset.tag);
}

function renderTagFilterBar(barId, tags, callback) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const active = getActiveTagFilters(barId);
  bar.innerHTML = tags.map(t =>
    `<span class="tag ${active.includes(t) ? 'active' : ''}" data-tag="${t}" onclick="toggleTagFilter('${barId}', '${t}', callback_${barId})">${t}</span>`
  ).join('');
  // Store callback reference
  window['callback_' + barId] = callback;
  bar.querySelectorAll('.tag').forEach(el => {
    el.onclick = () => {
      el.classList.toggle('active');
      callback();
    };
  });
}

// ===== RENDER VIEWS =====

// --- Dashboard ---
// D2 (plan de cambios): antes "tareas esperando tokens" y "cuentas esperando
// tokens sin tarea" eran 2 secciones separadas del dashboard, aunque para quien
// mira el tablero es un solo concepto -- algo en pausa por cupo, con una hora
// para volver. Este helper arma esa lista unificada, ordenada por fecha de
// reactivación (más próxima primero). reactivation/waitReactivation no son
// campos obligatorios (ver saveTask() y saveAccountWait()), así que un item sin
// fecha va al final en vez de romper el sort o mezclarse al azar con los que sí
// tienen hora.
function buildDashWaitingItems(tasks, accounts, quests) {
  const fromTasks = tasks.filter(t => t.status === 'esperando_tokens').map(t => {
    const quest = quests.find(q => q.id === t.questId);
    const acc = accounts.find(a => a.id === t.accountId);
    return {
      reactivation: t.reactivation || '',
      goTo: `showView('quest-detail','${t.questId}')`,
      title: `Tarea #${t.taskNumber}${t.title ? ' — ' + escHtml(t.title) : ''} — ${escHtml(quest?.name || '')}`,
      sub: acc ? `${escHtml(acc.platform)} · ${escHtml(acc.alias || acc.email)}` : '',
      desc: '',
    };
  });
  const fromAccounts = accounts.filter(a => a.status === 'esperando_tokens').map(a => ({
    reactivation: a.waitReactivation || '',
    goTo: `showView('accounts')`,
    title: escHtml(a.alias || a.email),
    sub: escHtml(a.platform),
    desc: a.waitNote ? escHtml(a.waitNote) : '',
  }));
  return [...fromTasks, ...fromAccounts].sort((x, y) => {
    if (!x.reactivation && !y.reactivation) return 0;
    if (!x.reactivation) return 1;   // sin fecha, al final
    if (!y.reactivation) return -1;
    return new Date(x.reactivation) - new Date(y.reactivation);
  });
}

function renderDashboard() {
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' });
  const accounts = DB.accounts;
  const tasks = DB.tasks;
  const quests = DB.quests;

  // ===== Métrica 1: esperando tokens (unificada, ver buildDashWaitingItems) =====
  const waitingItems = buildDashWaitingItems(tasks, accounts, quests);
  document.getElementById('dash-metric-waiting').textContent = waitingItems.length;
  const nextWithDate = waitingItems.find(i => i.reactivation);
  document.getElementById('dash-metric-waiting-sub').textContent = !waitingItems.length
    ? 'sin pendientes 🟢'
    : nextWithDate ? `próxima: ${fmtDatetime(nextWithDate.reactivation)}` : 'sin hora definida';
  document.getElementById('dash-waiting-list').innerHTML = waitingItems.length
    ? waitingItems.map(item => `<div class="card" style="cursor:pointer" onclick="${item.goTo}">
        <div class="card-header">
          <div>
            <div class="card-title">${item.title}</div>
            ${item.sub ? `<div class="card-sub">${item.sub}</div>` : ''}
          </div>
          <span class="badge badge-waiting">esperando</span>
        </div>
        ${item.desc ? `<div class="card-desc card-desc-clamp">${item.desc}</div>` : ''}
        ${item.reactivation ? `<div class="card-footer"><span class="reactivation-badge">⟳ ${fmtDatetime(item.reactivation)}</span></div>` : ''}
      </div>`).join('')
    : '<div class="list-empty">Sin tareas ni cuentas esperando tokens 🟢</div>';

  // ===== Métrica 2: quests activas =====
  const activeQ = quests.filter(q => q.status === 'activa');
  document.getElementById('dash-metric-quests').textContent = activeQ.length;
  const pendingInActive = tasks.filter(t => t.status !== 'completada' && activeQ.some(q => q.id === t.questId)).length;
  document.getElementById('dash-metric-quests-sub').textContent = activeQ.length
    ? `${pendingInActive} tarea${pendingInActive === 1 ? '' : 's'} pendiente${pendingInActive === 1 ? '' : 's'}`
    : 'sin quests activas';
  document.getElementById('dash-quests-active').innerHTML = activeQ.length
    ? activeQ.map(q => {
        const qTasks = tasks.filter(t => t.questId === q.id);
        const done = qTasks.filter(t => t.status === 'completada').length;
        return `<div class="card" style="cursor:pointer" onclick="showView('quest-detail','${q.id}')">
          <div class="card-header">
            <div class="card-title">${escHtml(q.name)}</div>
            <span class="badge badge-active">activa</span>
          </div>
          <div class="card-sub">${done}/${qTasks.length} tareas completadas</div>
        </div>`;
      }).join('')
    : '<div class="list-empty">Sin quests activas</div>';

  // ===== Métrica 3: cuentas ocupadas =====
  const busyAccounts = accounts.filter(a => a.status === 'busy');
  document.getElementById('dash-metric-busy').textContent = busyAccounts.length;
  const freeAccounts = accounts.filter(a => a.status === 'free').length;
  document.getElementById('dash-metric-busy-sub').textContent = `${freeAccounts} libre${freeAccounts === 1 ? '' : 's'} ahora`;
  document.getElementById('dash-accounts-busy').innerHTML = busyAccounts.length
    ? busyAccounts.map(a => {
        const task = a.activeTaskId ? tasks.find(t => t.id === a.activeTaskId) : null;
        const quest = task ? quests.find(q => q.id === task.questId) : null;
        // D1 (plan de cambios): antes esta tarjeta no navegaba a ningún lado al clickear.
        const goTo = task ? `showView('quest-detail','${task.questId}')` : `showView('accounts')`;
        return `<div class="card" style="cursor:pointer" onclick="${goTo}">
          <div class="card-header">
            <div>
              <div class="card-title">${escHtml(a.alias || a.email)}</div>
              <div class="card-sub">${escHtml(a.platform)} · ${escHtml(a.email)}</div>
            </div>
            <span class="badge badge-busy">ocupada</span>
          </div>
          ${task ? `<div class="card-desc card-desc-clamp">${escHtml(quest?.name || '')}${task.title ? ' — ' + escHtml(task.title) : ''} — ${escHtml(task.desc)}</div>` : ''}
          ${task?.status === 'esperando_tokens' && task.reactivation ? `<div class="card-footer"><span class="reactivation-badge">⟳ ${fmtDatetime(task.reactivation)}</span></div>` : ''}
        </div>`;
      }).join('')
    : '<div class="list-empty">Sin cuentas ocupadas 🟢</div>';
}

// D2 (plan de cambios): expande/colapsa el detalle de una métrica del dashboard.
// No necesita guardar el estado "abierto" en ninguna variable global: index.html
// precarga las 7 vistas en el DOM y showView() sólo alterna la clase .active
// (nunca destruye ni recrea #view-dashboard), y renderDashboard() de acá arriba
// sólo reescribe el innerHTML de los contenedores internos (#dash-waiting-list,
// etc.), nunca la clase .open de .dash-group ni el aria-expanded del botón --
// así que el estado sobrevive solo, tanto a un re-render (p. ej. checkAutoReleases
// corriendo cada 30s de fondo) como a navegar a otra vista y volver.
function toggleDashGroup(key) {
  const section = document.getElementById('dash-group-' + key);
  const metric = document.querySelector(`.dash-metric[data-group="${key}"]`);
  if (!section || !metric) return;
  const willOpen = !section.classList.contains('open');
  section.classList.toggle('open', willOpen);
  metric.setAttribute('aria-expanded', String(willOpen));
}

// --- Quests ---
function renderQuestStatusFilter() {
  const bar = document.getElementById('quest-status-filter');
  if (!bar) return;
  const options = [
    { value: 'activa', label: 'Activas' },
    { value: 'pausada', label: 'Pausadas' },
    { value: 'completada', label: 'Completadas' },
    { value: '', label: 'Todas' }
  ];
  bar.innerHTML = options.map(o =>
    `<span class="tag ${currentQuestStatusFilter === o.value ? 'active' : ''}" data-status="${o.value}">${o.label}</span>`
  ).join('');
  bar.querySelectorAll('.tag').forEach(el => {
    el.onclick = () => {
      currentQuestStatusFilter = el.dataset.status;
      renderQuests();
    };
  });
}

// Q4 (plan de cambios, Fase 3): reemplaza a getActiveTagFilters('quest-tag-filters') +
// renderTagFilterBar(). Antes era multi-select (una quest podía tener N tags), ahora una
// quest tiene a lo sumo UNA categoría, así que el filtro pasa a ser single-select como
// renderQuestStatusFilter(), no multi como era el de tags. Si no hay categorías creadas
// todavía, no tiene sentido mostrar una barra con el único pill "Todas" sin nada para
// comparar -- se deja vacía, mismo comportamiento que tenía la barra de tags con allTags=[].
function renderQuestCategoryFilter() {
  const bar = document.getElementById('quest-category-filter');
  if (!bar) return;
  const categories = DB.categories;
  if (!categories.length) { bar.innerHTML = ''; return; }
  const options = [{ id: '', name: 'Todas' }, ...categories];
  bar.innerHTML = options.map(c =>
    `<span class="tag ${currentQuestCategoryFilter === c.id ? 'active' : ''}" data-category="${c.id}">${escHtml(c.name)}</span>`
  ).join('');
  bar.querySelectorAll('.tag').forEach(el => {
    el.onclick = () => {
      currentQuestCategoryFilter = el.dataset.category;
      renderQuests();
    };
  });
}

function renderQuests() {
  let quests = DB.quests;
  const search = (document.getElementById('quest-search')?.value || '').toLowerCase();

  renderQuestStatusFilter();
  if (currentQuestStatusFilter) quests = quests.filter(q => q.status === currentQuestStatusFilter);

  renderQuestCategoryFilter();
  if (currentQuestCategoryFilter) quests = quests.filter(q => q.categoryId === currentQuestCategoryFilter);

  if (search) quests = quests.filter(q => q.name.toLowerCase().includes(search) || (q.desc||'').toLowerCase().includes(search));

  const tasks = DB.tasks;
  const categories = DB.categories;
  const el = document.getElementById('quests-list');
  el.innerHTML = quests.length
    ? quests.map(q => {
        const qTasks = tasks.filter(t => t.questId === q.id);
        const done = qTasks.filter(t => t.status === 'completada').length;
        const totalTime = calcQuestTime(q.id);
        const category = q.categoryId ? categories.find(c => c.id === q.categoryId) : null;
        return `<div class="card" onclick="showView('quest-detail','${q.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${escHtml(q.name)}</div>
              <div class="card-sub">${fmtDate(q.createdAt)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="badge badge-${q.status}">${q.status}</span>
              <div class="card-actions" onclick="event.stopPropagation()">
                <button class="btn-icon" onclick="editQuest('${q.id}')">✎</button>
                <button class="btn-icon danger" onclick="deleteQuest('${q.id}')">✕</button>
              </div>
            </div>
          </div>
          ${q.desc ? `<div class="card-desc">${escHtml(q.desc)}</div>` : ''}
          <div class="card-footer">
            <span class="badge" style="background:var(--surface2);color:var(--muted)">${done}/${qTasks.length} tareas</span>
            ${totalTime ? `<span class="badge" style="background:var(--surface2);color:var(--muted)">⏱ ${totalTime}</span>` : ''}
            ${category ? `<span class="tag">${escHtml(category.name)}</span>` : ''}
          </div>
        </div>`;
      }).join('')
    : `<div class="list-empty">${DB.quests.length ? 'No hay quests que coincidan con el filtro.' : 'Sin quests. ¡Crea tu primera quest!'}</div>`;
}

// --- Quest Detail ---
function renderQuestDetail(questId) {
  const quest = DB.quests.find(q => q.id === questId);
  if (!quest) { showView('quests'); return; }
  document.getElementById('qd-title').textContent = quest.name;
  renderQuestTasks(questId);
  renderQuestNotes();
  renderQuestStats(questId);
}

// Q2 (plan de cambios, Fase 2): mismo patrón que renderQuestStatusFilter() en la lista
// principal de Quests, adaptado a 2 opciones -- acá no hace falta un filtro de 4 estados,
// el pedido es puntual: ocultar completadas por defecto, con un escape hatch a "Todas".
function renderQuestTaskFilter() {
  const bar = document.getElementById('qd-task-filter');
  if (!bar) return;
  const options = [
    { value: 'pendientes', label: 'Pendientes' },
    { value: '', label: 'Todas' }
  ];
  bar.innerHTML = options.map(o =>
    `<span class="tag ${currentQuestTaskFilter === o.value ? 'active' : ''}" data-filter="${o.value}">${o.label}</span>`
  ).join('');
  bar.querySelectorAll('.tag').forEach(el => {
    el.onclick = () => {
      currentQuestTaskFilter = el.dataset.filter;
      renderQuestTasks(currentQuestId);
    };
  });
}

function renderQuestTasks(questId) {
  const allTasks = DB.tasks.filter(t => t.questId === questId);
  const accounts = DB.accounts;

  renderQuestTaskFilter();
  const tasks = currentQuestTaskFilter === 'pendientes'
    ? allTasks.filter(t => t.status !== 'completada')
    : allTasks;

  const el = document.getElementById('qd-tasks-list');
  el.innerHTML = tasks.length
    ? tasks.map(t => {
        const acc = accounts.find(a => a.id === t.accountId);
        const dur = t.completedAt ? calcDuration(t.createdAt, t.completedAt) : null;
        // T2 (plan de cambios, Fase 2): si la tarea tiene título, ese título pasa a ser
        // el dato principal (card-title) y "Tarea #N" baja a card-sub como dato
        // secundario, más chico. Sin título, se mantiene el comportamiento de siempre.
        const titleMain = t.title ? escHtml(t.title) : `Tarea #${t.taskNumber}`;
        const numberSub = t.title ? `Tarea #${t.taskNumber} · ` : '';
        return `<div class="card" onclick="editTask('${t.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">${titleMain}</div>
              <div class="card-sub">${numberSub}${acc ? `[${escHtml(acc.platform)}] ${escHtml(acc.alias || acc.email)}` : ''} · ${fmtDate(t.createdAt)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="badge badge-${t.status}">${statusLabel(t.status)}</span>
              <div class="card-actions" onclick="event.stopPropagation()">
                <button class="btn-icon" onclick="editTask('${t.id}')">✎</button>
                <button class="btn-icon danger" onclick="deleteTask('${t.id}')">✕</button>
              </div>
            </div>
          </div>
          <div class="card-desc">${escHtml(t.desc)}</div>
          <div class="card-footer">
            ${t.status === 'esperando_tokens' && t.reactivation ? `<span class="reactivation-badge">⟳ ${fmtDatetime(t.reactivation)}</span>` : ''}
            ${dur ? `<span class="badge" style="background:var(--surface2);color:var(--muted)">⏱ ${dur}</span>` : ''}
            ${t.status === 'esperando_tokens' && t.notesClosure ? `<span style="font-size:11px;color:var(--muted)">📝 ${escHtml(t.notesClosure.slice(0,60))}${t.notesClosure.length>60?'...':''}</span>` : ''}
          </div>
        </div>`;
      }).join('')
    : `<div class="list-empty">${allTasks.length ? 'No hay tareas pendientes en esta quest (probá el filtro "Todas").' : 'Sin tareas en esta quest'}</div>`;
}

function renderQuestStats(questId) {
  const tasks = DB.tasks.filter(t => t.questId === questId);
  const done = tasks.filter(t => t.status === 'completada');
  const waiting = tasks.filter(t => t.status === 'esperando_tokens');
  const totalTime = calcQuestTime(questId);

  const byPlatform = {};
  const accounts = DB.accounts;
  tasks.forEach(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    const p = acc ? acc.platform : 'Desconocida';
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  });

  const el = document.getElementById('qd-stats-content');
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Tareas totales</div><div class="stat-value">${tasks.length}</div></div>
    <div class="stat-card"><div class="stat-label">Completadas</div><div class="stat-value" style="color:var(--success)">${done.length}</div></div>
    <div class="stat-card"><div class="stat-label">Esperando tokens</div><div class="stat-value" style="color:var(--warn)">${waiting.length}</div></div>
    <div class="stat-card"><div class="stat-label">Tiempo total</div><div class="stat-value" style="font-size:22px">${totalTime || '—'}</div></div>
    <div class="stat-card" style="grid-column: span 2">
      <div class="stat-label">Por plataforma</div>
      <ul class="stat-list">${Object.entries(byPlatform).map(([p,c]) => `<li><span>${escHtml(p)}</span><span>${c} tarea${c!==1?'s':''}</span></li>`).join('')}</ul>
    </div>
  `;
}

function calcQuestTime(questId) {
  const done = DB.tasks.filter(t => t.questId === questId && t.status === 'completada' && t.completedAt);
  let totalMs = 0;
  done.forEach(t => { totalMs += new Date(t.completedAt) - new Date(t.createdAt); });
  if (!totalMs) return null;
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// --- Tasks ---
function renderTasks() {
  let tasks = DB.tasks;
  const search = (document.getElementById('task-search')?.value || '').toLowerCase();
  const questFilter = document.getElementById('task-filter-quest')?.value || '';
  const platformFilter = document.getElementById('task-filter-platform')?.value || '';
  const statusFilter = document.getElementById('task-filter-status')?.value || '';

  // Populate filters
  const quests = DB.quests;
  const accounts = DB.accounts;
  const platforms = [...new Set(accounts.map(a => a.platform))];

  const questSel = document.getElementById('task-filter-quest');
  if (questSel) {
    const cur = questSel.value;
    questSel.innerHTML = '<option value="">Todas las quests</option>' +
      quests.map(q => `<option value="${q.id}" ${q.id===cur?'selected':''}>${escHtml(q.name)}</option>`).join('');
  }
  const platSel = document.getElementById('task-filter-platform');
  if (platSel) {
    const cur = platSel.value;
    platSel.innerHTML = '<option value="">Todas las plataformas</option>' +
      platforms.map(p => `<option value="${escHtml(p)}" ${p===cur?'selected':''}>${escHtml(p)}</option>`).join('');
  }

  if (search) tasks = tasks.filter(t => t.desc.toLowerCase().includes(search) || (t.title || '').toLowerCase().includes(search));
  if (questFilter) tasks = tasks.filter(t => t.questId === questFilter);
  if (platformFilter) tasks = tasks.filter(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    return acc && acc.platform === platformFilter;
  });
  if (statusFilter) tasks = tasks.filter(t => t.status === statusFilter);

  const el = document.getElementById('tasks-list');
  el.innerHTML = tasks.length
    ? tasks.map(t => {
        const quest = quests.find(q => q.id === t.questId);
        const acc = accounts.find(a => a.id === t.accountId);
        const dur = t.completedAt ? calcDuration(t.createdAt, t.completedAt) : null;
        return `<div class="card" onclick="editTask('${t.id}')">
          <div class="card-header">
            <div>
              <div class="card-title">
                ${quest ? `<span style="color:var(--muted);font-size:12px">${escHtml(quest.name)} /</span> ` : ''}
                Tarea #${t.taskNumber}${t.title ? ' — ' + escHtml(t.title) : ''}
              </div>
              <div class="card-sub">${acc ? `[${escHtml(acc.platform)}] ${escHtml(acc.alias || acc.email)}` : ''} · ${fmtDate(t.createdAt)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="badge badge-${t.status}">${statusLabel(t.status)}</span>
              <div class="card-actions" onclick="event.stopPropagation()">
                <button class="btn-icon" onclick="editTask('${t.id}')">✎</button>
                <button class="btn-icon danger" onclick="deleteTask('${t.id}')">✕</button>
              </div>
            </div>
          </div>
          <div class="card-desc">${escHtml(t.desc)}</div>
          <div class="card-footer">
            ${t.status === 'esperando_tokens' && t.reactivation ? `<span class="reactivation-badge">⟳ ${fmtDatetime(t.reactivation)}</span>` : ''}
            ${dur ? `<span class="badge" style="background:var(--surface2);color:var(--muted)">⏱ ${dur}</span>` : ''}
          </div>
        </div>`;
      }).join('')
    : '<div class="list-empty">Sin tareas</div>';
}

// --- Accounts ---
function renderAccounts() {
  const accounts = DB.accounts;
  const tasks = DB.tasks;
  const quests = DB.quests;
  const el = document.getElementById('accounts-grid');

  el.innerHTML = accounts.length
    ? accounts.map(a => {
        const task = a.activeTaskId ? tasks.find(t => t.id === a.activeTaskId) : null;
        const quest = task ? quests.find(q => q.id === task.questId) : null;
        const isFree = a.status === 'free';
        const isWaiting = a.status === 'esperando_tokens';
        return `<div class="account-card ${a.status}">
          <div class="account-card-header">
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <span class="color-dot" style="background:${a.color || '#7b5ea7'}" title="Color de la cuenta"></span>
              <div>
                <span class="platform-tag">${escHtml(a.platform)}</span>
                <div class="account-alias" style="margin-top:6px">${escHtml(a.alias || a.email)}</div>
                <div class="account-email">${escHtml(a.email)}</div>
              </div>
            </div>
            <span class="badge badge-${a.status}">${statusLabel(a.status)}</span>
          </div>
          ${a.status === 'busy' && task ? `
          <div class="account-task-info">
            <div><strong>${escHtml(quest?.name || '')}</strong> — Tarea #${task.taskNumber}${task.title ? ' — ' + escHtml(task.title) : ''}</div>
            <div style="margin-top:4px">${escHtml(task.desc.slice(0,80))}${task.desc.length>80?'...':''}</div>
            ${task.reactivation && task.status === 'esperando_tokens' ? `<div style="margin-top:6px"><span class="reactivation-badge">⟳ ${fmtDatetime(task.reactivation)}</span></div>` : ''}
          </div>` : ''}
          ${isWaiting && (a.waitNote || a.waitReactivation) ? `
          <div class="account-task-info">
            ${a.waitNote ? `<div>${escHtml(a.waitNote)}</div>` : ''}
            ${a.waitReactivation ? `<div style="margin-top:6px"><span class="reactivation-badge">⟳ ${fmtDatetime(a.waitReactivation)}</span></div>` : ''}
          </div>` : ''}
          <div class="account-card-actions">
            ${isFree ? `<button class="btn-secondary btn-sm" onclick="markAccountWaiting('${a.id}')">⏳ Esperando tokens</button>` : ''}
            ${!isFree ? `<button class="btn-secondary btn-sm" onclick="freeAccount('${a.id}')">${isWaiting ? '✓ Ya tengo tokens' : 'Liberar'}</button>` : ''}
            <button class="btn-icon" onclick="editAccount('${a.id}')">✎</button>
            <button class="btn-icon danger" onclick="deleteAccount('${a.id}')">✕</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="list-empty" style="grid-column:1/-1">Sin cuentas. Agrégalas en Settings o aquí arriba.</div>';
}

// --- Stats Global ---
function renderStats() {
  const tasks = DB.tasks;
  const quests = DB.quests;
  const accounts = DB.accounts;
  const notes = DB.globalNotes;
  const questNotes = DB.questNotes;

  const totalTime = (() => {
    const done = tasks.filter(t => t.status === 'completada' && t.completedAt);
    let ms = 0;
    done.forEach(t => { ms += new Date(t.completedAt) - new Date(t.createdAt); });
    if (!ms) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  const byPlatform = {};
  tasks.forEach(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    const p = acc ? acc.platform : '?';
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  });

  const byStatus = {
    en_progreso: tasks.filter(t=>t.status==='en_progreso').length,
    esperando_tokens: tasks.filter(t=>t.status==='esperando_tokens').length,
    completada: tasks.filter(t=>t.status==='completada').length,
  };

  const el = document.getElementById('stats-content');
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Quests totales</div><div class="stat-value">${quests.length}</div><div class="stat-sub">${quests.filter(q=>q.status==='completada').length} completadas</div></div>
    <div class="stat-card"><div class="stat-label">Tareas totales</div><div class="stat-value">${tasks.length}</div><div class="stat-sub">${byStatus.completada} completadas</div></div>
    <div class="stat-card"><div class="stat-label">Tiempo registrado</div><div class="stat-value" style="font-size:22px">${totalTime}</div></div>
    <div class="stat-card"><div class="stat-label">Cuentas</div><div class="stat-value">${accounts.length}</div><div class="stat-sub">${accounts.filter(a=>a.status==='free').length} libres · ${accounts.filter(a=>a.status==='busy').length} ocupadas</div></div>
    <div class="stat-card"><div class="stat-label">Notas</div><div class="stat-value">${notes.length + questNotes.length}</div><div class="stat-sub">${notes.length} globales · ${questNotes.length} en quests</div></div>
    <div class="stat-card">
      <div class="stat-label">Tareas por estado</div>
      <ul class="stat-list">
        <li><span>En progreso</span><span>${byStatus.en_progreso}</span></li>
        <li><span>Esperando tokens</span><span>${byStatus.esperando_tokens}</span></li>
        <li><span>Completadas</span><span>${byStatus.completada}</span></li>
      </ul>
    </div>
    <div class="stat-card" style="grid-column:span 2">
      <div class="stat-label">Tareas por plataforma</div>
      <ul class="stat-list">${Object.entries(byPlatform).map(([p,c])=>`<li><span>${escHtml(p)}</span><span>${c}</span></li>`).join('') || '<li><span style="color:var(--muted)">Sin datos</span></li>'}</ul>
    </div>
  `;
}

// --- Settings ---
function renderSettings() {
  const platforms = getPlatforms();
  const el = document.getElementById('platforms-list');
  el.innerHTML = platforms.map(p => `
    <div class="platform-item">
      ${escHtml(p)}
      ${['Claude','ChatGPT'].includes(p) ? '' : `<button class="platform-remove" onclick="removePlatform('${p}')">✕</button>`}
    </div>`).join('');
  renderCategoriesSettingsList();
}

function renderCategoriesSettingsList() {
  const categories = DB.categories;
  const el = document.getElementById('categories-list');
  if (!el) return;
  el.innerHTML = categories.length
    ? categories.map(c => `
      <div class="platform-item">
        ${escHtml(c.name)}
        <button class="platform-remove" onclick="removeCategory('${c.id}')">✕</button>
      </div>`).join('')
    : '<p class="settings-desc" style="margin:0">Todavía no creaste ninguna categoría.</p>';
}

function addCategory() {
  const input = document.getElementById('new-category-input');
  const val = input.value.trim();
  if (!val) return;
  const categories = DB.categories;
  if (categories.map(c => c.name.toLowerCase()).includes(val.toLowerCase())) {
    showToast('Ya existe esa categoría', 'error'); return;
  }
  categories.push({ id: uid(), name: val, createdAt: now() });
  DB.saveCategories(categories);
  input.value = '';
  renderCategoriesSettingsList();
  showToast('Categoría agregada ✓', 'success');
}

function removeCategory(id) {
  const cat = DB.categories.find(c => c.id === id);
  if (!cat) return;
  const affected = DB.quests.filter(q => q.categoryId === id).length;
  const msg = affected
    ? `¿Eliminar la categoría "${cat.name}"? ${affected} quest${affected !== 1 ? 's' : ''} quedarán sin categoría.`
    : `¿Eliminar la categoría "${cat.name}"?`;
  if (!confirm(msg)) return;
  DB.saveCategories(DB.categories.filter(c => c.id !== id));
  if (affected) DB.saveQuests(DB.quests.map(q => q.categoryId === id ? { ...q, categoryId: null } : q));
  renderCategoriesSettingsList();
  if (currentView === 'quests') renderQuests();
}

function addPlatform() {
  const input = document.getElementById('new-platform-input');
  const val = input.value.trim();
  if (!val) return;
  const platforms = getPlatforms();
  if (platforms.map(p=>p.toLowerCase()).includes(val.toLowerCase())) {
    showToast('Ya existe esa plataforma', 'error'); return;
  }
  platforms.push(val);
  DB.savePlatforms(platforms);
  input.value = '';
  renderSettings();
  showToast('Plataforma agregada ✓', 'success');
}

function removePlatform(name) {
  if (!confirm(`¿Eliminar la plataforma "${name}"?`)) return;
  const platforms = getPlatforms().filter(p => p !== name);
  DB.savePlatforms(platforms);
  renderSettings();
}

// ===== IMPORT / EXPORT =====
function exportData() {
  const data = {
    version: 1,
    exportedAt: now(),
    quests: DB.quests,
    tasks: DB.tasks,
    accounts: DB.accounts,
    globalNotes: DB.globalNotes,
    questNotes: DB.questNotes,
    platforms: DB.platforms,
    categories: DB.categories,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-tracker-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Datos exportados ✓', 'success');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.version) throw new Error('Formato inválido');
      if (!confirm('Esto reemplazará todos tus datos actuales. ¿Continuar?')) return;
      if (data.quests)      DB.saveQuests(data.quests);
      if (data.tasks)       DB.saveTasks(data.tasks);
      if (data.accounts)    DB.saveAccounts(data.accounts);
      if (data.globalNotes) DB.saveGlobalNotes(data.globalNotes);
      if (data.questNotes)  DB.saveQuestNotes(data.questNotes);
      if (data.platforms)   DB.savePlatforms(data.platforms);
      if (data.categories)  DB.saveCategories(data.categories);
      showToast('Datos importados ✓', 'success');
      renderSettings();
    } catch {
      showToast('Error al importar el archivo', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearAllData() {
  if (!confirm('⚠️ ¿Borrar TODOS los datos? Esta acción es irreversible.')) return;
  Object.values(DB.KEYS).forEach(k => localStorage.removeItem(k));
  showToast('Datos eliminados');
  showView('dashboard');
}

// ===== HELPERS =====
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusLabel(s) {
  const labels = { en_progreso: 'en progreso', esperando_tokens: 'esperando', completada: 'completada', activa: 'activa', pausada: 'pausada', free: 'libre', busy: 'ocupada' };
  return labels[s] || s;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Init default platforms if empty
  if (!DB.platforms.length) DB.savePlatforms(['Claude', 'ChatGPT', 'Gemini']);

  // Nav
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Tabs in quest detail
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const group = tab.closest('.tabs');
      group.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const contentId = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === contentId);
      });
    });
  });

  // Task status toggle
  document.getElementById('task-status').addEventListener('change', toggleReactivationField);

  // Search listeners
  document.getElementById('quest-search').addEventListener('input', renderQuests);
  document.getElementById('task-search').addEventListener('input', renderTasks);
  document.getElementById('global-note-search').addEventListener('input', renderGlobalNotes);

  // Task filter listeners
  ['task-filter-quest','task-filter-platform','task-filter-status'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderTasks);
  });

  // Tag inputs (notas -- las quests ya no usan tags, ver Q4 en CONTEXT.md sesión 15)
  initTagInput('global-note-tags-input', 'global-note-tags-display');
  initTagInput('qd-note-tags', 'qd-note-tags-display');

  // Note autosave
  document.getElementById('global-note-title').addEventListener('input', autosaveGlobalNote);
  document.getElementById('global-note-body').addEventListener('input', autosaveGlobalNote);
  document.getElementById('global-note-tags-display').addEventListener('DOMSubtreeModified', () => {
    clearTimeout(globalNoteAutosaveTimer);
    globalNoteAutosaveTimer = setTimeout(autosaveGlobalNote, 100);
  });

  document.getElementById('qd-note-title').addEventListener('input', autosaveQuestNote);
  document.getElementById('qd-note-body').addEventListener('input', autosaveQuestNote);

  // Red de seguridad adicional: si se cierra/refresca la pestaña dentro de la
  // ventana de 1.5s del debounce, igual queda guardado.
  window.addEventListener('beforeunload', flushQuestNoteAutosave);

  // Open task modal preload — exact match on the onclick value so this only binds
  // to the "+ Nueva Tarea" buttons. A substring selector (`[onclick*="modal-new-task"]`)
  // also matched the modal overlay and its close/cancel buttons (they call
  // closeModal/closeModalOutside with the same 'modal-new-task' id), which sit as
  // ancestors of the modal content. That made ANY click inside the modal (e.g. opening
  // the account <select>) re-run populateTaskModal(), rebuilding the select's options
  // and resetting it back to the first account.
  document.querySelectorAll('[onclick="openModal(\'modal-new-task\')"]').forEach(btn => {
    btn.addEventListener('click', populateTaskModal);
  });

  // Account modal preload — same exact-match fix as above.
  document.querySelectorAll('[onclick="openModal(\'modal-new-account\')"]').forEach(btn => {
    btn.addEventListener('click', populateAccountPlatformSelect);
  });

  // Quest modal preload — same exact-match fix as above (Q4, plan de cambios Fase 3).
  document.querySelectorAll('[onclick="openModal(\'modal-new-quest\')"]').forEach(btn => {
    btn.addEventListener('click', populateQuestCategorySelect);
  });

  // Initial render
  showView('dashboard');

  // Auto-release: catch-up inmediato (por si algo venció con la app cerrada) y
  // después cada autoReleaseCheckMs mientras siga abierta. visibilitychange/focus
  // adelantan el chequeo apenas se vuelve a la pestaña, para no depender del
  // intervalo si el navegador lo frenó en segundo plano (ver comentario junto a
  // autoReleaseCheckMs).
  checkAutoReleases();
  setInterval(checkAutoReleases, autoReleaseCheckMs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAutoReleases();
  });
  window.addEventListener('focus', checkAutoReleases);
});

// Expose for inline onclick
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeModalOutside = closeModalOutside;
window.saveQuest = saveQuest;
window.editQuest = editQuest;
window.deleteQuest = deleteQuest;
window.editCurrentQuest = editCurrentQuest;
window.deleteCurrentQuest = deleteCurrentQuest;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.openNewTaskForQuest = openNewTaskForQuest;
window.toggleReactivationField = toggleReactivationField;
window.saveAccount = saveAccount;
window.editAccount = editAccount;
window.deleteAccount = deleteAccount;
window.freeAccount = freeAccount;
window.markAccountWaiting = markAccountWaiting;
window.saveAccountWait = saveAccountWait;
window.newGlobalNote = newGlobalNote;
window.createQuickGlobalNote = createQuickGlobalNote;
window.selectGlobalNote = selectGlobalNote;
window.deleteCurrentGlobalNote = deleteCurrentGlobalNote;
window.newQuestNote = newQuestNote;
window.selectQuestNote = selectQuestNote;
window.deleteCurrentQuestNote = deleteCurrentQuestNote;
window.removeTag = removeTag;
window.addPlatform = addPlatform;
window.removePlatform = removePlatform;
window.addCategory = addCategory;
window.removeCategory = removeCategory;
window.exportData = exportData;
window.importData = importData;
window.clearAllData = clearAllData;
window.showView = showView;
window.toggleDashGroup = toggleDashGroup;

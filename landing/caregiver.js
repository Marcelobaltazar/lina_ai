const API_URL = 'https://linaai-production.up.railway.app';

const SEVERITY_BADGE = { low: 'badge-low', medium: 'badge-medium', high: 'badge-high' };
const DAY_LABELS = { mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' };

let currentToken = '';
let editingId    = null;

// ── Bootstrap ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  currentToken = window.location.pathname.split('/').pop();

  try {
    const data = await api('GET', '');
    renderPage(data);
    show('main-content');
    hide('state-loading');
  } catch (err) {
    hide('state-loading');
    if (err.status === 404) show('state-error');
    else {
      show('state-error');
      document.querySelector('#state-error p').textContent = 'Ocorreu um erro ao carregar. Tente novamente.';
    }
  }
});

function renderPage({ elder, relative, medications, recentAlerts, weekStats }) {
  // Header
  el('elder-name').textContent = elder.name || 'Usuário';
  el('elder-city').textContent = elder.city || '';
  el('welcome-msg').textContent =
    `Olá, ${relative.name || 'cuidador(a)'}! Esta é sua área exclusiva para cuidar de ${elder.name || 'seu familiar'}.`;

  // Stats
  el('stat-msgs').textContent  = weekStats.totalMessages;
  el('stat-days').textContent  = weekStats.activeDays;
  el('stat-meds').textContent  =
    weekStats.medicationsTotal > 0
      ? `${weekStats.medicationsConfirmed}/${weekStats.medicationsTotal} ✅`
      : '—';

  const pendingAlerts = recentAlerts.length;
  el('stat-alerts').textContent = pendingAlerts;
  if (pendingAlerts > 0) el('stat-alerts-card').classList.add('alert-active');

  // Alerts
  renderAlerts(recentAlerts);

  // Medications
  renderMedications(medications);
}

function renderAlerts(alerts) {
  const container = el('alerts-list');
  if (!alerts.length) {
    container.innerHTML = '<div class="c-no-alerts">✅ Nenhum ponto de atenção esta semana</div>';
    return;
  }
  container.innerHTML = alerts.map((a) => `
    <div class="c-alert-row">
      <div class="c-alert-info">
        <div class="c-alert-type">${a.type || '—'}</div>
        <div class="c-alert-date">${new Date(a.created_at || a.notified_at).toLocaleString('pt-BR')}</div>
      </div>
      <span class="badge ${SEVERITY_BADGE[a.severity] || 'badge-low'}">${a.severity || '—'}</span>
    </div>
  `).join('');
}

function renderMedications(medications) {
  const container = el('medications-list');
  const active = medications.filter((m) => m.active !== false);

  if (!active.length) {
    container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">Nenhum medicamento cadastrado.</p>';
    return;
  }

  container.innerHTML = active.map((m) => {
    const times = Array.isArray(m.times) ? m.times : [];
    const days  = Array.isArray(m.days)  ? m.days  : [];
    const allDays = days.length === 7;

    return `
      <div class="c-med-card">
        <div class="c-med-name">${esc(m.name)}</div>
        <div class="c-med-dosage">${[m.dosage, m.form].filter(Boolean).join(' · ') || '—'}</div>
        ${times.length ? `<div class="c-med-times">${times.map((t) => `<span class="time-badge">${t}</span>`).join('')}</div>` : ''}
        ${!allDays && days.length ? `<div class="c-med-meta">📅 ${days.map((d) => DAY_LABELS[d] || d).join(', ')}</div>` : ''}
        ${m.purpose        ? `<div class="c-med-meta">🩺 ${esc(m.purpose)}</div>` : ''}
        ${m.doctor_name    ? `<div class="c-med-meta">👨‍⚕️ Dr. ${esc(m.doctor_name)}</div>` : ''}
        ${m.continuous_use ? `<div class="c-med-meta">🔄 Uso contínuo</div>` : m.end_date ? `<div class="c-med-meta">📆 Até ${fmtDate(m.end_date)}</div>` : ''}
        <div class="c-med-actions">
          <button class="btn-outline btn-sm" onclick="openModal(${JSON.stringify(m).replace(/"/g, '&quot;')})">✏️ Editar</button>
          <button class="btn-danger" onclick="removeMedication('${m.id}', '${esc(m.name)}')">🗑 Remover</button>
        </div>
      </div>
    `;
  }).join('');
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function openModal(medication = null) {
  editingId = medication?.id || null;
  el('modal-title').textContent = editingId ? 'Editar medicamento' : 'Adicionar medicamento';

  resetForm();

  if (medication) {
    el('med-id').value             = medication.id || '';
    el('med-name').value           = medication.name || '';
    el('med-generic-name').value   = medication.generic_name || '';
    el('med-dosage').value         = medication.dosage || '';
    el('med-form').value           = medication.form || 'Comprimido';
    el('med-manufacturer').value   = medication.manufacturer || '';
    el('med-quantity').value       = medication.quantity || '';
    el('med-take-with').value      = medication.take_with || 'Água';
    el('med-purpose').value        = medication.purpose || '';
    el('med-doctor-name').value    = medication.doctor_name || '';
    el('med-doctor-specialty').value = medication.doctor_specialty || '';
    el('med-start-date').value     = medication.start_date || '';
    el('med-end-date').value       = medication.end_date || '';
    el('med-continuous').checked   = !!medication.continuous_use;
    el('med-side-effects').value   = medication.side_effects || '';
    el('med-missed-dose').value    = medication.missed_dose || '';
    el('med-restrictions').value   = medication.restrictions || '';
    el('med-notes').value          = medication.notes || '';
    toggleEndDate(!!medication.continuous_use);

    // Times
    const times = Array.isArray(medication.times) ? medication.times : [];
    times.forEach((t) => addTimeField(t));

    // Days
    const days = Array.isArray(medication.days) ? medication.days : [];
    document.querySelectorAll('input[name="days"]').forEach((cb) => {
      cb.checked = days.includes(cb.value);
    });
  } else {
    addTimeField();
  }

  show('modal-overlay');
}

function closeModal() {
  hide('modal-overlay');
  editingId = null;
}

function handleOverlayClick(e) {
  if (e.target === el('modal-overlay')) closeModal();
}

function resetForm() {
  el('med-form-el').reset();
  el('times-container').innerHTML = '';
  document.querySelectorAll('input[name="days"]').forEach((cb) => { cb.checked = true; });
  el('med-end-date').disabled = false;
}

async function saveMedication(e) {
  e.preventDefault();

  const times = Array.from(document.querySelectorAll('.time-input')).map((i) => i.value).filter(Boolean);
  const days  = Array.from(document.querySelectorAll('input[name="days"]:checked')).map((cb) => cb.value);

  const payload = {
    name:             el('med-name').value.trim(),
    generic_name:     el('med-generic-name').value.trim(),
    dosage:           el('med-dosage').value.trim(),
    form:             el('med-form').value,
    manufacturer:     el('med-manufacturer').value.trim(),
    times,
    days,
    quantity:         el('med-quantity').value.trim(),
    take_with:        el('med-take-with').value,
    purpose:          el('med-purpose').value.trim(),
    doctor_name:      el('med-doctor-name').value.trim(),
    doctor_specialty: el('med-doctor-specialty').value.trim(),
    start_date:       el('med-start-date').value || null,
    end_date:         el('med-continuous').checked ? null : (el('med-end-date').value || null),
    continuous_use:   el('med-continuous').checked,
    side_effects:     el('med-side-effects').value.trim(),
    missed_dose:      el('med-missed-dose').value.trim(),
    restrictions:     el('med-restrictions').value.trim(),
    notes:            el('med-notes').value.trim(),
  };

  try {
    if (editingId) {
      await api('PUT', `/medications/${editingId}`, payload);
    } else {
      await api('POST', '/medications', payload);
    }
    closeModal();
    const data = await api('GET', '/medications');
    renderMedications(data);
  } catch (err) {
    alert('Erro ao salvar: ' + (err.message || 'tente novamente.'));
  }
}

async function removeMedication(id, name) {
  if (!confirm(`Remover "${name}"? O medicamento será desativado.`)) return;
  try {
    await api('DELETE', `/medications/${id}`);
    const data = await api('GET', '/medications');
    renderMedications(data);
  } catch (err) {
    alert('Erro ao remover: ' + (err.message || 'tente novamente.'));
  }
}

// ── Form helpers ───────────────────────────────────────────────────────────────
function addTimeField(value = '') {
  const row = document.createElement('div');
  row.className = 'time-input-row';
  row.innerHTML = `
    <input type="time" class="form-control time-input" value="${value}" />
    <button type="button" class="btn-remove-time" onclick="this.parentElement.remove()">✕</button>
  `;
  el('times-container').appendChild(row);
}

function toggleEndDate(continuous) {
  el('med-end-date').disabled = continuous;
  if (continuous) el('med-end-date').value = '';
}

// ── API ────────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`${API_URL}/caregiver/${currentToken}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error((await res.json().catch(() => ({}))).error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Utils ──────────────────────────────────────────────────────────────────────
const el    = (id) => document.getElementById(id);
const show  = (id) => el(id).classList.remove('hidden');
const hide  = (id) => el(id).classList.add('hidden');
const esc   = (s)  => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR');

// Expose to HTML onclick handlers
window.openModal        = openModal;
window.closeModal       = closeModal;
window.handleOverlayClick = handleOverlayClick;
window.saveMedication   = saveMedication;
window.removeMedication = removeMedication;
window.addTimeField     = addTimeField;
window.toggleEndDate    = toggleEndDate;

const ALL_SKILLS = [
  'EVA command',
  'Cooling systems',
  'EVA systems',
  'Medical operations',
  'Plant biology',
  'Power systems'
];

const FLAG_OPTIONS = [
  {id: 'injury', label: 'Injury / limited mobility', blocks: ['assignment']},
  {id: 'eva-limit', label: 'EVA limit', blocks: ['eva']},
  {id: 'contagion', label: 'Contagion watch', blocks: ['assignment']},
  {id: 'med-hold', label: 'Medication hold', blocks: ['eva', 'assignment']}
];

const templateCrew = [
  {id:'ibarra',name:'S. Ibarra',fullName:'Sofia Ibarra',role:'Commander',initials:'SI',sleep:7.6,fatigue:2,baseline:7.7,history:[7.8,7.5,7.9,7.4,7.8,7.6,7.6],state:'available',skills:['EVA command'],flags:[],note:'Feeling rested. Ready for the inspection.',time:'08:15'},
  {id:'chen',name:'L. Chen',fullName:'Lin Chen',role:'Systems specialist',initials:'LC',sleep:4.8,fatigue:7,baseline:7.4,history:[7.5,7.2,6.8,6.5,5.9,5.3,4.8],state:'review',skills:['Cooling systems','EVA systems'],flags:[],note:'Woke up several times. Having trouble concentrating this morning.',time:'08:32'},
  {id:'alvarez',name:'R. Alvarez',fullName:'Rafael Alvarez',role:'Flight engineer',initials:'RA',sleep:7.2,fatigue:3,baseline:7.3,history:[7.1,7.6,7.3,7.5,7.0,7.4,7.2],state:'available',skills:['Cooling systems','EVA systems'],flags:[],note:'Slept well. Available for systems work if needed.',time:'08:20'},
  {id:'okonkwo',name:'A. Okonkwo',fullName:'Amara Okonkwo',role:'Crew medical officer',initials:'AO',sleep:7.8,fatigue:2,baseline:7.6,history:[7.5,7.7,7.3,7.8,7.6,7.9,7.8],state:'available',skills:['Medical operations'],flags:[],note:'No concerns at this morning’s check-in.',time:'08:10'}
];

const ROLES = {
  medical: {
    id: 'medical',
    label: 'Crew medical officer',
    short: 'A. Okonkwo',
    initials: 'AO',
    crewId: 'okonkwo',
    defaultView: 'health',
    heading: 'Health view'
  },
  commander: {
    id: 'commander',
    label: 'Commander',
    short: 'S. Ibarra',
    initials: 'SI',
    crewId: 'ibarra',
    defaultView: 'plan',
    heading: 'Plan view'
  }
};

const crewPhoto = id => `assets/crew/${id}.jpg`;
const avatarHtml = (c, size = '') => {
  const cls = size ? `avatar ${size}` : 'avatar';
  return `<span class="${cls}" title="${escapeText(c.fullName || c.name)}"><img src="${crewPhoto(c.id)}" alt="${escapeText(c.fullName || c.name)}" width="76" height="76" loading="lazy" decoding="async"></span>`;
};
const tinyAvatarHtml = c => `<span class="tiny-avatar" title="${escapeText(c.name)}"><img src="${crewPhoto(c.id)}" alt="" width="40" height="40" loading="lazy" decoding="async"></span>`;

const storageKey = 'crew-swap-data-v3';
let sleepCatalog = null;
let state;
let currentView = 'overview';
let toastTimer;

const byId = id => state.crew.find(c => c.id === id);
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clock = () => new Date().toISOString().slice(11, 16);
const statusLabel = c => c.state === 'down' ? 'Stand-down' : c.state === 'review' ? 'Needs review' : 'Available';
const flagMeta = id => FLAG_OPTIONS.find(f => f.id === id);
const crewFlags = c => (c.flags || []).map(flagMeta).filter(Boolean);

function fatigueFromDeficit(deficit) {
  return Math.max(1, Math.min(10, Math.round(2 + deficit * 2.2)));
}

function applySleepData(crewList, catalog) {
  return crewList.map(person => {
    const measured = catalog.crew[person.id];
    if (!measured) return structuredClone(person);
    const next = structuredClone(person);
    next.history = measured.history_hours.map(Number);
    next.baseline = Number(measured.baseline_hours);
    next.sleep = Number(measured.latest_hours);
    next.subject = measured.subject;
    next.sourceNights = measured.nights;
    const deficit = Number(measured.deficit_hours);
    next.fatigue = fatigueFromDeficit(deficit);
    if (next.state !== 'down') {
      next.state = deficit >= 1.5 || next.fatigue >= 6 ? 'review' : 'available';
    }
    if (person.id === 'chen' && next.state === 'review') {
      next.note = `Measured sleep fell to ${next.sleep.toFixed(2)} h last night against a ${next.baseline.toFixed(2)} h usual average. Concentration feels off this morning.`;
    }
    next.skills = Array.isArray(person.skills) ? [...person.skills] : [];
    next.flags = Array.isArray(person.flags) ? [...person.flags] : [];
    return next;
  });
}

function defaultRequirements() {
  return {
    coolingLoop: {
      title: 'Cooling loop inspection',
      specialistSkills: ['Cooling systems'],
      commanderSkill: 'EVA command'
    }
  };
}

function freshState(catalog) {
  const crew = catalog ? applySleepData(templateCrew, catalog) : structuredClone(templateCrew);
  return {
    crew,
    assigned: 'chen',
    inspectionDeferred: false,
    version: 1,
    log: [],
    selected: 'chen',
    dataVersion: catalog?.dataset?.version || 'sample',
    operatorRole: 'medical',
    requirements: defaultRequirements()
  };
}

function normalizeState(saved, catalog) {
  const base = freshState(catalog);
  if (!saved?.crew?.length) return base;
  const crew = base.crew.map(person => {
    const prior = saved.crew.find(c => c.id === person.id);
    if (!prior) return person;
    return {
      ...person,
      ...prior,
      history: Array.isArray(prior.history) ? prior.history : person.history,
      skills: Array.isArray(prior.skills) ? prior.skills.filter(s => ALL_SKILLS.includes(s)) : person.skills,
      flags: Array.isArray(prior.flags) ? prior.flags.filter(id => FLAG_OPTIONS.some(f => f.id === id)) : []
    };
  });
  return {
    ...base,
    ...saved,
    crew,
    requirements: {
      coolingLoop: {
        ...base.requirements.coolingLoop,
        ...(saved.requirements?.coolingLoop || {}),
        specialistSkills: (saved.requirements?.coolingLoop?.specialistSkills || base.requirements.coolingLoop.specialistSkills)
          .filter(s => ALL_SKILLS.includes(s))
      }
    },
    operatorRole: ROLES[saved.operatorRole] ? saved.operatorRole : 'medical'
  };
}

function readState(catalog) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (
      saved?.crew?.length === 4 &&
      saved.crew.every(c => templateCrew.some(i => i.id === c.id) && Array.isArray(c.history)) &&
      Array.isArray(saved.log) &&
      saved.dataVersion === (catalog?.dataset?.version || 'sample')
    ) {
      return normalizeState(saved, catalog);
    }
  } catch {}
  return freshState(catalog);
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    toast('Changes are available for this session.');
  }
}

function addLog(title, detail) {
  state.log.unshift({time: clock(), title, detail});
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function dataBadge() {
  if (!sleepCatalog) return 'Sample';
  return 'BIDSleep';
}

function flagBlocks(c, kind) {
  return crewFlags(c).find(f => f.blocks.includes(kind));
}

function renderOperator() {
  const role = ROLES[state.operatorRole];
  const avatar = document.getElementById('operator-avatar');
  avatar.innerHTML = `<img src="${crewPhoto(role.crewId)}" alt="${escapeText(role.short)}" width="60" height="60" decoding="async">`;
  document.getElementById('operator-name').textContent = role.short;
  document.getElementById('operator-role').textContent = role.label;
  document.getElementById('role-select').value = state.operatorRole;
}

function renderCrew() {
  document.getElementById('crew-grid').innerHTML = state.crew.map(c => {
    const flags = crewFlags(c);
    return `
    <button class="crew-card card ${state.selected === c.id ? 'selected' : ''}" data-crew="${c.id}" aria-pressed="${state.selected === c.id}" aria-label="Review ${escapeText(c.fullName)}, ${statusLabel(c)}">
      <div class="crew-card-top">${avatarHtml(c)}<div><h3>${c.name}</h3><div class="crew-role">${c.role}</div></div></div>
      <div class="crew-status ${c.state}"><i class="dot ${c.state === 'review' ? 'amber' : c.state === 'down' ? 'gray' : 'green'}"></i>${statusLabel(c)}</div>
      ${flags.length ? `<div class="flag-row">${flags.map(f => `<span class="flag-chip">${escapeText(f.label)}</span>`).join('')}</div>` : ''}
      <div class="crew-metrics">
        <div><span class="metric-label">Sleep</span><span class="metric-value ${c.sleep < c.baseline - 1 ? 'warning' : ''}">${c.sleep.toFixed(1)}<small>h</small></span></div>
        <div><span class="metric-label">Fatigue</span><span class="metric-value ${c.fatigue >= 6 ? 'warning' : ''}">${c.fatigue}<small>/10</small></span></div>
      </div>
      <div class="mini-trend" aria-hidden="true">${c.history.map(v => `<span style="--bar:${Math.max(10, v / 9 * 100)}%"></span>`).join('')}</div>
      <div class="crew-foot"><span>${escapeText(c.time)}</span></div>
    </button>`;
  }).join('');
}

function renderHealth() {
  const c = byId(state.selected);
  const delta = (c.sleep - c.baseline).toFixed(1);
  const flags = crewFlags(c);
  document.getElementById('health-panel').innerHTML = `
    <div class="panel-header"><div class="health-identity">${avatarHtml(c, 'large')}<div><h2>${c.name}</h2></div></div><span class="focus-tag">${c.state === 'review' ? 'REVIEW' : c.state === 'down' ? 'DOWN' : 'READY'}</span></div>
    <div class="detail-main">
      <div class="detail-intro"><span>${escapeText(c.time)} UTC</span><span>${Number(delta) > 0 ? '+' : ''}${delta} h vs usual</span></div>
      <figure class="sleep-figure" aria-label="Seven nights of sleep: ${c.history.join(', ')} hours. Personal baseline ${c.baseline} hours.">
        <div class="chart-title">7-night sleep <span>usual ${c.baseline} h</span></div>
        <div class="chart-area"><div class="baseline" style="top:${100 - c.baseline / 9 * 100}%"></div>${c.history.map(v => `<div class="chart-bar" style="--height:${v / 9 * 100}%"><span>${Number(v).toFixed(1)}</span></div>`).join('')}</div>
        <div class="chart-days">${[181,182,183,184,185,186,187].map(d => `<span>${d}</span>`).join('')}</div>
      </figure>
      <blockquote class="quote">“${escapeText(c.note)}”</blockquote>
      <div class="flag-block">
        <div class="flag-block-head"><span class="metric-label">Flags</span><button type="button" class="text-link" data-action="flags">Edit →</button></div>
        ${flags.length
          ? `<ul class="flag-list">${flags.map(f => `<li><strong>${escapeText(f.label)}</strong></li>`).join('')}</ul>`
          : '<p class="health-footnote">None</p>'}
      </div>
      <div class="health-actions">
        <button class="button btn btn--secondary secondary" data-action="checkin">Check-in</button>
        <button class="button ${c.state === 'down' ? 'primary' : 'danger'}" data-action="status">${c.state === 'down' ? 'Return to duty' : 'Duty status'}</button>
      </div>
    </div>`;
}

function renderQualifications() {
  const req = state.requirements.coolingLoop;
  const panel = document.getElementById('qualifications-panel');
  panel.innerHTML = `
    <div class="panel-header">
      <div><h2>Qualifications</h2></div>
    </div>
    <div class="quals-body">
      <section class="quals-block">
        <h3>Cooling loop</h3>
        <div class="skill-chips" id="req-specialist">
          ${ALL_SKILLS.map(skill => `
            <label class="skill-chip"><input type="checkbox" data-req="specialist" value="${escapeText(skill)}" ${req.specialistSkills.includes(skill) ? 'checked' : ''}> ${escapeText(skill)}</label>
          `).join('')}
        </div>
        <label class="field"><span>Commander skill</span>
          <select id="req-commander">${ALL_SKILLS.map(skill => `<option value="${escapeText(skill)}" ${req.commanderSkill === skill ? 'selected' : ''}>${escapeText(skill)}</option>`).join('')}</select>
        </label>
      </section>
      <section class="quals-block">
        <h3>Crew skills</h3>
        <div class="quals-table-wrap">
          <table class="quals-table">
            <thead><tr><th>Crew</th>${ALL_SKILLS.map(s => `<th>${escapeText(s)}</th>`).join('')}</tr></thead>
            <tbody>
              ${state.crew.map(c => `
                <tr>
                  <th scope="row"><span class="qual-crew">${avatarHtml(c, 'small')}<span>${escapeText(c.name)}<small>${escapeText(c.role)}</small></span></span></th>
                  ${ALL_SKILLS.map(skill => `
                    <td><input type="checkbox" data-crew-skill="${c.id}" value="${escapeText(skill)}" ${c.skills.includes(skill) ? 'checked' : ''} aria-label="${escapeText(c.name)} ${escapeText(skill)}"></td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;

  panel.querySelectorAll('[data-req="specialist"]').forEach(input => {
    input.onchange = () => {
      state.requirements.coolingLoop.specialistSkills = [...panel.querySelectorAll('[data-req="specialist"]:checked')].map(el => el.value);
      if (!state.requirements.coolingLoop.specialistSkills.length) {
        state.requirements.coolingLoop.specialistSkills = ['Cooling systems'];
        input.checked = input.value === 'Cooling systems';
      }
      addLog('Qualification matrix updated', `Cooling loop specialist skills: ${state.requirements.coolingLoop.specialistSkills.join(', ')}.`);
      render();
      toast('Task requirements updated.');
    };
  });
  document.getElementById('req-commander').onchange = event => {
    state.requirements.coolingLoop.commanderSkill = event.target.value;
    addLog('Qualification matrix updated', `Commander skill set to ${event.target.value}.`);
    render();
    toast('Commander skill updated.');
  };
  panel.querySelectorAll('[data-crew-skill]').forEach(input => {
    input.onchange = () => {
      const person = byId(input.dataset.crewSkill);
      const skill = input.value;
      if (input.checked && !person.skills.includes(skill)) person.skills.push(skill);
      if (!input.checked) person.skills = person.skills.filter(s => s !== skill);
      addLog(`${person.name} qualifications updated`, person.skills.length ? person.skills.join(', ') : 'No skills listed.');
      render();
      toast(`${person.name} skills saved.`);
    };
  });
}

function inspectionStatus() {
  if (state.inspectionDeferred) return 'Deferred';
  const specialist = byId(state.assigned);
  const commander = byId('ibarra');
  if (commander.state === 'down' || specialist.state === 'down') return 'Coverage gap';
  if (flagBlocks(commander, 'assignment') || flagBlocks(commander, 'eva') || flagBlocks(specialist, 'assignment') || flagBlocks(specialist, 'eva')) return 'Coverage gap';
  if (!meetsSpecialist(specialist) || !commander.skills.includes(state.requirements.coolingLoop.commanderSkill)) return 'Coverage gap';
  if (specialist.state === 'review' || commander.state === 'review') return 'Health review';
  return 'Scheduled';
}

function meetsSpecialist(c) {
  const needed = state.requirements.coolingLoop.specialistSkills;
  return needed.every(skill => c.skills.includes(skill));
}

function tasks() {
  const swap = state.assigned === 'alvarez' && !state.inspectionDeferred;
  return [
    {time:'09:30', title: state.requirements.coolingLoop.title, duration:'90 min', crew:[state.assigned,'ibarra'], status:inspectionStatus()},
    {time:'09:30', title:'Medical console coverage', duration:'45 min', crew:['okonkwo'], status:byId('okonkwo').state === 'down' || flagBlocks(byId('okonkwo'), 'assignment') ? 'Coverage gap' : 'Scheduled'},
    {time:swap ? '13:00' : '10:00', title:'Plant growth experiment', duration:'60 min', crew:['alvarez'], status:byId('alvarez').state === 'down' || flagBlocks(byId('alvarez'), 'assignment') ? 'Deferred' : swap ? 'Rescheduled' : 'Scheduled'},
    {time:'11:15', title:'Resistive exercise', duration:'45 min', crew:state.crew.filter(c => c.state !== 'down' && !flagBlocks(c, 'assignment')).map(c => c.id), status:'Scheduled'}
  ].sort((a, b) => a.time.localeCompare(b.time));
}

function renderSchedule() {
  const list = tasks();
  document.getElementById('schedule').innerHTML = list.map(t => `
    <div class="task ${['Health review','Coverage gap'].includes(t.status) ? 'review-task' : t.status === 'Deferred' ? 'deferred-task' : ''}">
      <span class="task-time">${t.time}</span>
      <div class="task-box">
        <div class="task-top"><strong>${t.title}</strong><span class="task-badge">${t.status.toUpperCase()}</span></div>
        <div class="task-bottom">
          <span class="task-crew">${t.crew.map(id => tinyAvatarHtml(byId(id))).join('')}<span>${t.crew.map(id => byId(id).name).join(' + ') || 'No available crew'}</span></span>
          <span>${t.duration}</span>
        </div>
      </div>
    </div>`).join('');
  const gaps = list.filter(t => t.status === 'Coverage gap').length;
  document.getElementById('version-label').textContent = `v${String(state.version).padStart(2, '0')}`;
  document.getElementById('coverage-label').textContent = gaps
    ? `${list.filter(t => t.status !== 'Deferred').length} tasks · ${gaps} gap${gaps === 1 ? '' : 's'}`
    : `${list.filter(t => t.status !== 'Deferred').length} tasks`;
  document.getElementById('plan-footer').textContent = '';
}

function renderAlert() {
  const needs = state.crew.filter(c => c.state === 'review');
  const flagged = state.crew.filter(c => crewFlags(c).length);
  const gaps = tasks().filter(t => t.status === 'Coverage gap');
  const box = document.getElementById('alert-banner');
  box.classList.toggle('resolved', !needs.length && !gaps.length);
  document.getElementById('alert-title').textContent = gaps.length
    ? 'Coverage gap'
    : needs.length
      ? `${needs.map(c => c.name).join(', ')} needs review`
      : flagged.length
        ? `${flagged.map(c => c.name).join(', ')} flagged`
        : 'All clear';
  document.getElementById('alert-description').textContent = '';
  document.getElementById('review-checkin').innerHTML = gaps.length
    ? 'Coverage ↗'
    : needs.length
      ? 'Review ↗'
      : 'Packet ↗';
  document.getElementById('attention-count').textContent = needs.length + flagged.filter(c => c.state !== 'review').length;
  document.getElementById('log-count').textContent = state.log.length;
}

function renderLog() {
  document.getElementById('log-content').innerHTML = state.log.length
    ? state.log.map(l => `<article class="log-row"><time>${escapeText(l.time)}</time><div><h3>${escapeText(l.title)}</h3><p>${escapeText(l.detail)}</p></div></article>`).join('')
    : '<div class="empty"><strong>No decisions yet.</strong></div>';
}

function renderChrome() {
  const tag = document.querySelector('.preview-tag');
  if (tag) tag.textContent = dataBadge();
  renderOperator();
}

function render() {
  renderChrome();
  renderCrew();
  renderHealth();
  renderSchedule();
  renderAlert();
  renderLog();
  if (currentView === 'quals') renderQualifications();
  const next = tasks().find(t => t.status !== 'Deferred');
  document.getElementById('next-operation').textContent = next ? `${next.time} · ${next.title}` : 'Review deferred operations';
  persist();
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const labels = {
    overview: 'Overview',
    health: 'Health',
    plan: 'Plan',
    quals: 'Qualifications',
    log: 'Decision log'
  };
  document.getElementById('breadcrumb-current').textContent = labels[view];
  document.getElementById('page-heading').textContent = labels[view];
  document.body.classList.toggle('plan-view', view === 'plan');
  document.body.classList.toggle('health-view', view === 'health');
  document.body.classList.toggle('overview-view', view === 'overview');
  document.body.classList.toggle('quals-view', view === 'quals');
  document.getElementById('crew-section').classList.toggle('hidden', view === 'log' || view === 'plan' || view === 'quals');
  document.getElementById('workspace').classList.toggle('hidden', view === 'log' || view === 'quals');
  document.getElementById('log-panel').classList.toggle('hidden', view !== 'log');
  document.getElementById('qualifications-panel').classList.toggle('hidden', view !== 'quals');
  document.getElementById('alert-banner').classList.toggle('hidden', view === 'log' || view === 'quals');
  document.getElementById('new-checkin').classList.toggle('hidden', view === 'plan' || view === 'log' || view === 'quals');
  if (view === 'quals') renderQualifications();
}

const dialog = document.getElementById('dialog');

function showDialog(title, eyebrow, body) {
  document.getElementById('dialog-content').innerHTML = `<div class="dialog-header"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div><button class="icon-button" data-close aria-label="Close dialog">×</button></div><div class="dialog-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  dialog.close();
}

function openCheckin() {
  const c = byId(state.selected);
  showDialog('Check-in', 'Self-report', `
    <form id="checkin-form">
      <label class="field"><span>Crew</span><select name="crew">${state.crew.map(p => `<option value="${p.id}" ${p.id === c.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
      <div class="field-row">
        <label class="field"><span>Sleep (h)</span><input name="sleep" type="number" min="0" max="24" step="0.01" value="${c.sleep}" required></label>
        <label class="field"><span>Fatigue <output id="fatigue-output">${c.fatigue}</output>/10</span><input name="fatigue" type="range" min="0" max="10" value="${c.fatigue}"></label>
      </div>
      <label class="field"><span>Note</span><textarea name="note" maxlength="300" required>${escapeText(c.note)}</textarea></label>
      <div class="dialog-actions"><button type="button" class="button btn btn--secondary secondary" data-close>Cancel</button><button class="button btn btn--primary primary" type="submit">Save →</button></div>
    </form>`);
  const form = document.getElementById('checkin-form');
  form.elements.fatigue.addEventListener('input', () => {
    document.getElementById('fatigue-output').textContent = form.elements.fatigue.value;
  });
  form.elements.crew.addEventListener('change', () => {
    const person = byId(form.elements.crew.value);
    form.elements.sleep.value = person.sleep;
    form.elements.fatigue.value = person.fatigue;
    form.elements.note.value = person.note;
    document.getElementById('fatigue-output').textContent = person.fatigue;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const person = byId(form.elements.crew.value);
    person.sleep = Number(form.elements.sleep.value);
    person.fatigue = Number(form.elements.fatigue.value);
    person.note = form.elements.note.value.trim();
    person.time = clock();
    person.history[6] = person.sleep;
    if (person.state !== 'down') person.state = 'review';
    state.selected = person.id;
    addLog(`${person.name} check-in`, `${person.sleep} h · fatigue ${person.fatigue}/10`);
    closeDialog();
    render();
    toast('Check-in saved.');
  });
}

function openFlags() {
  const c = byId(state.selected);
  showDialog('Flags', c.initials, `
    <form id="flags-form">
      ${FLAG_OPTIONS.map(flag => `
        <label class="choice">
          <input type="checkbox" name="flag" value="${flag.id}" ${(c.flags || []).includes(flag.id) ? 'checked' : ''}>
          <strong>${escapeText(flag.label)}</strong>
        </label>
      `).join('')}
      <div class="dialog-actions"><button type="button" class="button btn btn--secondary secondary" data-close>Cancel</button><button class="button btn btn--primary primary" type="submit">Save →</button></div>
    </form>`);
  document.getElementById('flags-form').onsubmit = event => {
    event.preventDefault();
    const selected = [...event.target.querySelectorAll('input[name="flag"]:checked')].map(el => el.value);
    c.flags = selected;
    addLog(`${c.name} flags`, selected.length ? selected.map(id => flagMeta(id).label).join('; ') : 'Cleared');
    closeDialog();
    render();
    toast('Flags saved.');
  };
}

function openDuty() {
  const c = byId(state.selected);
  const measured = '';
  const flags = crewFlags(c);
  showDialog('Duty status', c.initials, `
    <div class="review-summary">
      <div><span>Sleep</span><b>${c.sleep} h</b></div>
      <div><span>Usual</span><b>${c.baseline} h</b></div>
      <div><span>Fatigue</span><b>${c.fatigue}/10</b></div>
    </div>
    <blockquote class="quote">“${escapeText(c.note)}”</blockquote>
    ${flags.length ? `<p class="health-footnote">${flags.map(f => f.label).join('; ')}</p>` : ''}
    ${measured}
    <div class="dialog-actions">
      <button class="button btn btn--secondary secondary" id="confirm-available">Available</button>
      <button class="button btn danger" id="confirm-down" ${c.state === 'down' ? 'disabled' : ''}>Stand down →</button>
    </div>`);
  document.getElementById('confirm-available').onclick = () => {
    c.state = 'available';
    addLog(`${c.name} available`, 'Confirmed by medical officer.');
    closeDialog();
    render();
    toast(`${c.name} available.`);
  };
  document.getElementById('confirm-down').onclick = () => {
    c.state = 'down';
    addLog(`${c.name} stood down`, 'Confirmed by medical officer.');
    render();
    openCoverage();
  };
}

function candidateReason(c) {
  if (c.state === 'down') return 'Confirmed stand-down';
  if (c.state === 'review') return 'Health review pending';
  const blocked = flagBlocks(c, 'assignment') || flagBlocks(c, 'eva');
  if (blocked) return blocked.label;
  if (!meetsSpecialist(c)) {
    const missing = state.requirements.coolingLoop.specialistSkills.filter(s => !c.skills.includes(s));
    return missing.length ? `Missing: ${missing.join(', ')}` : 'Specialist qualification required';
  }
  return '';
}

function openCoverage() {
  const commander = byId('ibarra');
  const commanderSkill = state.requirements.coolingLoop.commanderSkill;
  const commanderDown = commander.state === 'down' || !!flagBlocks(commander, 'assignment') || !!flagBlocks(commander, 'eva') || !commander.skills.includes(commanderSkill);
  const eligible = state.crew.filter(c => !candidateReason(c));
  const options = state.crew.filter(c => c.id !== 'ibarra');
  const selected = eligible.find(c => c.id === state.assigned) || eligible[0];
  showDialog('Coverage', '09:30 cooling loop', `
    ${commanderDown ? `<div class="plan-notice">Commander blocked — defer inspection.</div>` : ''}
    <form id="coverage-form">
      ${options.map(c => {
        const reason = commanderDown ? 'Commander unavailable' : candidateReason(c);
        return `<label class="choice"><input type="radio" name="replacement" value="${c.id}" ${reason ? 'disabled' : c.id === selected?.id ? 'checked' : ''}><strong>${c.name}</strong><p>${c.role}</p>${reason ? `<em>${reason}</em>` : ''}</label>`;
      }).join('')}
      <label class="choice"><input type="radio" name="replacement" value="defer" ${commanderDown || !eligible.length ? 'checked' : ''}><strong>Defer</strong></label>
      <div class="dialog-actions"><button type="button" class="button btn btn--secondary secondary" data-close>Cancel</button><button type="submit" class="button btn btn--primary primary">Confirm →</button></div>
    </form>`);
  document.getElementById('coverage-form').onsubmit = event => {
    event.preventDefault();
    const choice = new FormData(event.target).get('replacement');
    if (!choice) return;
    state.inspectionDeferred = choice === 'defer';
    if (choice !== 'defer') state.assigned = choice;
    state.version++;
    const description = choice === 'defer'
      ? 'Inspection deferred.'
      : `${byId(choice).name} + S. Ibarra assigned.${choice === 'alvarez' ? ' Plant growth → 13:00.' : ''}`;
    addLog(`Plan v${state.version}`, description);
    render();
    showDialog('Plan updated', 'Confirmed', `
      <p>${escapeText(description)}</p>
      <div class="dialog-actions"><button class="button btn btn--secondary secondary" data-close>Close</button><button class="button btn btn--primary primary" id="show-packet">Earth packet →</button></div>`);
    document.getElementById('show-packet').onclick = openPacket;
  };
}

function packetText() {
  const dataLine = sleepCatalog
    ? `Sleep source: ${sleepCatalog.dataset.name} ${sleepCatalog.dataset.version}`
    : 'Sleep source: sample values';
  return [
    'CREW SWAP · ARES · SOL 187',
    `Plan v${state.version} · ${ROLES[state.operatorRole].short}`,
    dataLine,
    '',
    ...state.crew.map(c => {
      const flags = crewFlags(c).map(f => f.label).join(', ');
      return `${c.name}: ${statusLabel(c)} · ${c.sleep} h${flags ? ` · ${flags}` : ''}`;
    }),
    '',
    `Cooling loop: ${state.requirements.coolingLoop.specialistSkills.join(', ')} + ${state.requirements.coolingLoop.commanderSkill}`,
    '',
    ...tasks().map(t => `${t.time} | ${t.title} | ${t.status} | ${t.crew.map(id => byId(id).name).join(', ') || '—'}`),
    '',
    state.log[0]?.detail || 'No changes.'
  ].join('\n');
}

function download(name, content, type = 'text/plain') {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openPacket() {
  showDialog('Earth packet', 'Sol 187', `
    <pre class="packet">${escapeText(packetText())}</pre>
    <div class="dialog-actions"><button class="button btn btn--secondary secondary" data-close>Close</button><button class="button btn btn--primary primary" id="download-packet">Download ↓</button></div>`);
  document.getElementById('download-packet').onclick = () => {
    download('crew-swap-earth-packet.txt', packetText());
    toast('Packet downloaded.');
  };
}

function openSources() {
  const dataset = sleepCatalog?.dataset;
  const sleepBlock = dataset
    ? `<div class="source-item"><a href="${escapeText(dataset.url)}" target="_blank" rel="noopener">${escapeText(dataset.name)} ${escapeText(dataset.version)} ↗</a><p>DOI: <a href="${escapeText(dataset.doi)}" target="_blank" rel="noopener">${escapeText(dataset.doi)}</a></p></div>`
    : `<div class="source-item"><strong>Sleep data</strong><p>Using sample histories.</p></div>`;
  showDialog('Sources', 'References', `
    ${sleepBlock}
    <div class="source-item"><a href="https://www.nasa.gov/news-release/nasa-coverage-of-rescheduled-spacewalk-preparing-for-new-solar-array/" target="_blank" rel="noopener">NASA spacewalk reassignment ↗</a></div>
    <div class="source-item"><a href="https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20140016946.pdf" target="_blank" rel="noopener">NASA fatigue study ↗</a></div>
    <div class="dialog-actions"><button class="button btn btn--primary primary" data-close>Close</button></div>`);
}

function switchRole(roleId) {
  if (!ROLES[roleId]) return;
  state.operatorRole = roleId;
  const role = ROLES[roleId];
  addLog(`Operator switched to ${role.label}`, role.heading);
  render();
  setView(role.defaultView);
  toast(`${role.short}`);
}

function bindEvents() {
  document.querySelector('nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button) setView(button.dataset.view);
  });
  document.querySelector('.brand').onclick = event => {
    event.preventDefault();
    setView('overview');
  };
  document.getElementById('crew-grid').onclick = event => {
    const card = event.target.closest('[data-crew]');
    if (card) {
      state.selected = card.dataset.crew;
      render();
    }
  };
  document.getElementById('health-panel').onclick = event => {
    const button = event.target.closest('[data-action]');
    if (button?.dataset.action === 'checkin') openCheckin();
    if (button?.dataset.action === 'status') openDuty();
    if (button?.dataset.action === 'flags') openFlags();
  };
  document.getElementById('role-select').onchange = event => switchRole(event.target.value);
  document.getElementById('new-checkin').onclick = openCheckin;
  document.getElementById('review-checkin').onclick = () => {
    if (tasks().some(t => t.status === 'Coverage gap')) return openCoverage();
    const c = state.crew.find(p => p.state === 'review');
    if (c) {
      state.selected = c.id;
      render();
      openDuty();
    } else openPacket();
  };
  document.getElementById('review-options').onclick = openCoverage;
  document.getElementById('open-plan').onclick = () => setView('plan');
  document.getElementById('sources-button').onclick = openSources;
  document.getElementById('mobile-tools').onclick = () => {
    showDialog('Options', 'Crew Swap', `
      <label class="field"><span>Role</span>
        <select id="mobile-role">${Object.values(ROLES).map(r => `<option value="${r.id}" ${state.operatorRole === r.id ? 'selected' : ''}>${r.short} — ${r.label}</option>`).join('')}</select>
      </label>
      <div class="dialog-actions"><button class="button btn btn--secondary secondary" id="mobile-reset">Reset</button><button class="button btn btn--primary primary" id="mobile-sources">Sources</button></div>`);
    document.getElementById('mobile-role').onchange = event => {
      switchRole(event.target.value);
      closeDialog();
    };
    document.getElementById('mobile-sources').onclick = openSources;
    document.getElementById('mobile-reset').onclick = () => document.getElementById('reset-button').click();
  };
  document.getElementById('export-log').onclick = () => {
    download('crew-swap-decision-log.json', JSON.stringify(state.log, null, 2), 'application/json');
    toast('Decision log downloaded.');
  };
  document.getElementById('reset-button').onclick = () => {
    showDialog('Reset?', 'Preview', `
      <p>Clear saved decisions and restore the starting crew state.</p>
      <div class="dialog-actions"><button class="button btn btn--secondary secondary" data-close>Cancel</button><button class="button btn danger" id="confirm-reset">Reset</button></div>`);
    document.getElementById('confirm-reset').onclick = () => {
      const role = state.operatorRole;
      state = freshState(sleepCatalog);
      state.operatorRole = role;
      render();
      setView(ROLES[role].defaultView);
      closeDialog();
      toast('Preview restored.');
    };
  };
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) closeDialog();
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog();
    }
  });
}

async function boot() {
  try {
    const response = await fetch('data/sleep.json', {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    sleepCatalog = await response.json();
  } catch (error) {
    console.warn('Measured sleep data unavailable, using sample values.', error);
    sleepCatalog = null;
  }
  state = readState(sleepCatalog);
  bindEvents();
  render();
  setView(ROLES[state.operatorRole].defaultView);
  if (sleepCatalog) {
    toast('Loaded measured sleep histories from PhysioNet BIDSleep.');
  }
}

boot();

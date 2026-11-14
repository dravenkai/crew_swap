const templateCrew = [
  {id:'ibarra',name:'S. Ibarra',fullName:'Sofia Ibarra',role:'Commander',initials:'SI',sleep:7.6,fatigue:2,baseline:7.7,history:[7.8,7.5,7.9,7.4,7.8,7.6,7.6],state:'available',skills:['EVA command'],note:'Feeling rested. Ready for the inspection.',time:'08:15'},
  {id:'chen',name:'L. Chen',fullName:'Lin Chen',role:'Systems specialist',initials:'LC',sleep:4.8,fatigue:7,baseline:7.4,history:[7.5,7.2,6.8,6.5,5.9,5.3,4.8],state:'review',skills:['Cooling systems','EVA systems'],note:'Woke up several times. Having trouble concentrating this morning.',time:'08:32'},
  {id:'alvarez',name:'R. Alvarez',fullName:'Rafael Alvarez',role:'Flight engineer',initials:'RA',sleep:7.2,fatigue:3,baseline:7.3,history:[7.1,7.6,7.3,7.5,7.0,7.4,7.2],state:'available',skills:['Cooling systems','EVA systems'],note:'Slept well. Available for systems work if needed.',time:'08:20'},
  {id:'okonkwo',name:'A. Okonkwo',fullName:'Amara Okonkwo',role:'Crew medical officer',initials:'AO',sleep:7.8,fatigue:2,baseline:7.6,history:[7.5,7.7,7.3,7.8,7.6,7.9,7.8],state:'available',skills:['Medical operations'],note:'No concerns at this morning’s check-in.',time:'08:10'}
];

const storageKey = 'crew-swap-data-v2';
let sleepCatalog = null;
let state;
let currentView = 'overview';
let toastTimer;

const byId = id => state.crew.find(c => c.id === id);
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clock = () => new Date().toISOString().slice(11, 16);
const statusLabel = c => c.state === 'down' ? 'Stand-down confirmed' : c.state === 'review' ? 'Check-in needs review' : 'Available';

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
    return next;
  });
}

function freshState(catalog) {
  const crew = catalog ? applySleepData(templateCrew, catalog) : structuredClone(templateCrew);
  return {crew, assigned:'chen', inspectionDeferred:false, version:1, log:[], selected:'chen', dataVersion: catalog?.dataset?.version || 'sample'};
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
      return saved;
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
  if (!sleepCatalog) return 'UI PREVIEW · SAMPLE CREW';
  return 'MEASURED SLEEP · PHYSIONET BIDSLEEP';
}

function renderCrew() {
  document.getElementById('crew-grid').innerHTML = state.crew.map(c => `
    <button class="crew-card ${state.selected === c.id ? 'selected' : ''}" data-crew="${c.id}" aria-pressed="${state.selected === c.id}" aria-label="Review ${escapeText(c.fullName)}, ${statusLabel(c)}">
      <div class="crew-card-top"><span class="avatar">${c.initials}</span><div><h3>${c.name}</h3><div class="crew-role">${c.role}</div></div></div>
      <div class="crew-status ${c.state}"><i class="dot ${c.state === 'review' ? 'amber' : c.state === 'down' ? 'gray' : 'green'}"></i>${statusLabel(c)}</div>
      <div class="crew-metrics">
        <div><span class="metric-label">Last night’s sleep</span><span class="metric-value ${c.sleep < c.baseline - 1 ? 'warning' : ''}">${c.sleep.toFixed(2)}<small>h</small></span></div>
        <div><span class="metric-label">Reported fatigue</span><span class="metric-value ${c.fatigue >= 6 ? 'warning' : ''}">${c.fatigue}<small>/ 10</small></span></div>
      </div>
      <div class="mini-trend" aria-hidden="true">${c.history.map(v => `<span style="--bar:${Math.max(10, v / 9 * 100)}%"></span>`).join('')}</div>
      <div class="crew-foot"><span>7-NIGHT SLEEP TREND</span><span>CHECK-IN ${escapeText(c.time)}</span></div>
    </button>`).join('');
}

function renderHealth() {
  const c = byId(state.selected);
  const delta = (c.sleep - c.baseline).toFixed(2);
  const sourceLine = c.subject
    ? `Measured total sleep from PhysioNet BIDSleep subject ${escapeText(c.subject)}. Crew identity and mission duties remain simulated.`
    : 'Sample sleep history for interface review.';
  document.getElementById('health-panel').innerHTML = `
    <div class="panel-header"><div><span class="eyebrow">CREW HEALTH / ${c.initials}</span><h2>${c.name}’s check-in</h2></div><span class="focus-tag">${c.state === 'review' ? 'NEEDS REVIEW' : c.state === 'down' ? 'STAND-DOWN' : 'AVAILABLE'}</span></div>
    <div class="detail-main">
      <div class="detail-intro"><span>Reported at ${escapeText(c.time)} UTC</span><span>${Number(delta) > 0 ? '+' : ''}${delta} h from usual sleep</span></div>
      <figure class="sleep-figure" aria-label="Seven nights of sleep: ${c.history.join(', ')} hours. Personal baseline ${c.baseline} hours.">
        <div class="chart-title">Sleep over the last 7 nights <span>— USUAL ${c.baseline} H</span></div>
        <div class="chart-area"><div class="baseline" style="top:${100 - c.baseline / 9 * 100}%"></div>${c.history.map(v => `<div class="chart-bar" style="--height:${v / 9 * 100}%"><span>${Number(v).toFixed(1)}</span></div>`).join('')}</div>
        <div class="chart-days">${[181,182,183,184,185,186,187].map(d => `<span>${d}</span>`).join('')}</div>
      </figure>
      <blockquote class="quote">“${escapeText(c.note)}”<small>${c.name.toUpperCase()} · SELF-REPORTED</small></blockquote>
      <p class="health-footnote">${sourceLine}</p>
      <div class="health-actions">
        <button class="button secondary" data-action="checkin">Update check-in</button>
        <button class="button ${c.state === 'down' ? 'primary' : 'danger'}" data-action="status">${c.state === 'down' ? 'Review return to duty' : 'Review duty status'}</button>
      </div>
      <p class="health-footnote">Duty changes require confirmation by the crew medical officer.</p>
    </div>`;
}

function inspectionStatus() {
  if (state.inspectionDeferred) return 'Deferred';
  if (byId('ibarra').state === 'down' || byId(state.assigned).state === 'down') return 'Coverage gap';
  if (byId(state.assigned).state === 'review' || byId('ibarra').state === 'review') return 'Health review';
  return 'Scheduled';
}

function tasks() {
  const swap = state.assigned === 'alvarez' && !state.inspectionDeferred;
  return [
    {time:'09:30', title:'Cooling loop inspection', duration:'90 min', crew:[state.assigned,'ibarra'], status:inspectionStatus()},
    {time:'09:30', title:'Medical console coverage', duration:'45 min', crew:['okonkwo'], status:byId('okonkwo').state === 'down' ? 'Coverage gap' : 'Scheduled'},
    {time:swap ? '13:00' : '10:00', title:'Plant growth experiment', duration:'60 min', crew:['alvarez'], status:byId('alvarez').state === 'down' ? 'Deferred' : swap ? 'Rescheduled' : 'Scheduled'},
    {time:'11:15', title:'Resistive exercise', duration:'45 min', crew:state.crew.filter(c => c.state !== 'down').map(c => c.id), status:'Scheduled'}
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
          <span class="task-crew">${t.crew.map(id => `<span class="tiny-avatar" title="${byId(id).name}">${byId(id).initials}</span>`).join('')}<span>${t.crew.map(id => byId(id).name).join(' + ') || 'No available crew'}</span></span>
          <span>${t.duration}</span>
        </div>
      </div>
    </div>`).join('');
  document.getElementById('version-label').textContent = `VERSION ${String(state.version).padStart(2, '0')}`;
  document.getElementById('coverage-label').textContent = `${list.filter(t => t.status !== 'Deferred').length} active tasks · ${list.filter(t => t.status === 'Coverage gap').length} coverage gaps`;
  document.getElementById('plan-footer').textContent = state.version > 1
    ? 'Plan updated onboard. Changes are recorded in the decision log.'
    : 'Review crew health before the next operation.';
}

function renderAlert() {
  const needs = state.crew.filter(c => c.state === 'review');
  const gaps = tasks().filter(t => t.status === 'Coverage gap');
  const box = document.getElementById('alert-banner');
  box.classList.toggle('resolved', !needs.length && !gaps.length);
  document.getElementById('alert-title').textContent = gaps.length
    ? 'The mission plan needs new coverage.'
    : needs.length
      ? `${needs.length === 1 ? 'One crew member needs' : needs.length + ' crew members need'} a closer look.`
      : 'Crew changes are accounted for.';
  document.getElementById('alert-description').textContent = gaps.length
    ? 'A confirmed stand-down affects an assigned task. Review available coverage.'
    : needs.length
      ? `${needs.map(c => c.name).join(', ')} ${needs.length === 1 ? 'has' : 'have'} a check-in awaiting review before the next operation.`
      : 'Review the current plan and share the onboard decision with Earth.';
  document.getElementById('review-checkin').innerHTML = gaps.length
    ? 'Review coverage ↗'
    : needs.length
      ? 'Review check-in ↗'
      : 'View Earth packet ↗';
  document.getElementById('attention-count').textContent = needs.length;
  document.getElementById('log-count').textContent = state.log.length;
}

function renderLog() {
  document.getElementById('log-content').innerHTML = state.log.length
    ? state.log.map(l => `<article class="log-row"><time>${escapeText(l.time)}</time><div><h3>${escapeText(l.title)}</h3><p>${escapeText(l.detail)}</p></div></article>`).join('')
    : '<div class="empty"><strong>Your decisions will appear here.</strong><p>Review a check-in, confirm a duty change, or approve a new plan to create the first entry.</p></div>';
}

function renderChrome() {
  const tag = document.querySelector('.preview-tag');
  if (tag) tag.textContent = dataBadge();
}

function render() {
  renderChrome();
  renderCrew();
  renderHealth();
  renderSchedule();
  renderAlert();
  renderLog();
  const next = tasks().find(t => t.status !== 'Deferred');
  document.getElementById('next-operation').textContent = next ? `${next.time} · ${next.title}` : 'Review deferred operations';
  persist();
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const labels = {
    overview: ['Overview', 'Ready for what’s next.', 'A clear view of your crew. A plan that adapts with them.'],
    health: ['Crew health', 'Every crew member matters.', 'Review personal trends and the latest check-ins.'],
    plan: ['Mission plan', 'Keep the mission moving.', 'See who is assigned, what has changed, and where coverage is needed.'],
    log: ['Decision log', 'A record of every decision.', 'Health reviews, duty changes, and the reasoning behind the plan.']
  };
  document.getElementById('breadcrumb-current').textContent = labels[view][0];
  document.getElementById('page-heading').textContent = labels[view][1];
  document.getElementById('page-description').textContent = labels[view][2];
  document.body.classList.toggle('plan-view', view === 'plan');
  document.body.classList.toggle('health-view', view === 'health');
  document.getElementById('crew-section').classList.toggle('hidden', view === 'log');
  document.getElementById('workspace').classList.toggle('hidden', view === 'log');
  document.getElementById('log-panel').classList.toggle('hidden', view !== 'log');
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
  showDialog('A moment to check in.', 'CREW HEALTH / SELF-REPORT', `
    <p>Record how you slept and how you feel before your next task.</p>
    <form id="checkin-form">
      <label class="field"><span>Crew member</span><select name="crew">${state.crew.map(p => `<option value="${p.id}" ${p.id === c.id ? 'selected' : ''}>${p.name} — ${p.role}</option>`).join('')}</select></label>
      <div class="field-row">
        <label class="field"><span>Last night’s sleep (hours)</span><input name="sleep" type="number" min="0" max="24" step="0.01" value="${c.sleep}" required></label>
        <label class="field"><span>Fatigue <output id="fatigue-output">${c.fatigue}</output> / 10</span><input name="fatigue" type="range" min="0" max="10" value="${c.fatigue}"><small>0 · None &nbsp; 10 · Extreme</small></label>
      </div>
      <label class="field"><span>How are you feeling?</span><textarea name="note" maxlength="300" required>${escapeText(c.note)}</textarea></label>
      <div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit">Save check-in →</button></div>
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
    addLog(`${person.name} submitted a check-in`, `${person.sleep} h sleep; fatigue ${person.fatigue}/10. ${person.state === 'down' ? 'Stand-down remains in effect pending review.' : 'Queued for duty review.'}`);
    closeDialog();
    render();
    toast('Check-in saved. Ready for medical officer review.');
  });
}

function openDuty() {
  const c = byId(state.selected);
  const measured = c.subject ? `<p class="health-footnote">Sleep chart uses measured BIDSleep subject ${escapeText(c.subject)}. The stand-down decision stays with the medical officer.</p>` : '';
  showDialog('Review duty status', 'CREW MEDICAL OFFICER / ' + c.initials, `
    <p>Review ${c.name}’s report and confirm the appropriate duty status.</p>
    <div class="review-summary">
      <div><span>Last night</span><b>${c.sleep} h</b></div>
      <div><span>Usual sleep</span><b>${c.baseline} h</b></div>
      <div><span>Fatigue</span><b>${c.fatigue}/10</b></div>
    </div>
    <blockquote class="quote">“${escapeText(c.note)}”</blockquote>
    ${measured}
    <p>Standing down removes ${c.name} from available coverage. Existing assignments will be flagged for replanning.</p>
    <div class="dialog-actions">
      <button class="button secondary" id="confirm-available">Confirm available</button>
      <button class="button danger" id="confirm-down" ${c.state === 'down' ? 'disabled' : ''}>Confirm stand-down →</button>
    </div>`);
  document.getElementById('confirm-available').onclick = () => {
    c.state = 'available';
    addLog(`${c.name} confirmed available`, 'Duty status reviewed by A. Okonkwo. Existing plan retained pending any reassignment.');
    closeDialog();
    render();
    toast(`${c.name} is available for assignment.`);
  };
  document.getElementById('confirm-down').onclick = () => {
    c.state = 'down';
    addLog(`${c.name} stood down`, 'A. Okonkwo confirmed stand-down after reviewing the crew check-in and measured sleep trend.');
    render();
    openCoverage();
  };
}

function candidateReason(c) {
  if (c.state === 'down') return 'Confirmed stand-down';
  if (c.state === 'review') return 'Health review pending';
  if (!c.skills.includes('Cooling systems')) return 'Cooling systems qualification required';
  return '';
}

function openCoverage() {
  const commanderDown = byId('ibarra').state === 'down';
  const eligible = state.crew.filter(c => !candidateReason(c));
  const options = state.crew.filter(c => c.id !== 'ibarra');
  const selected = eligible.find(c => c.id === state.assigned) || eligible[0];
  showDialog('Find the next workable plan.', 'MISSION PLAN / COOLING LOOP INSPECTION', `
    <p>09:30–11:00 UTC · Requires a cooling systems specialist and an EVA commander. Qualifications and assignments are sample mission inputs.</p>
    ${commanderDown ? '<div class="plan-notice">The only EVA commander is stood down. The inspection must be deferred until qualified coverage is available.</div>' : ''}
    <form id="coverage-form">
      ${options.map(c => {
        const reason = commanderDown ? 'EVA commander unavailable' : candidateReason(c);
        return `<label class="choice"><input type="radio" name="replacement" value="${c.id}" ${reason ? 'disabled' : c.id === selected?.id ? 'checked' : ''}><strong>${c.name} · ${c.role}</strong><p>${c.skills.join(' · ')}</p>${reason ? `<em>${reason}</em>` : c.id === 'alvarez' ? '<em>Moves plant growth experiment from 10:00 to 13:00 to avoid overlap.</em>' : '<p>Available for the full inspection window.</p>'}</label>`;
      }).join('')}
      <label class="choice"><input type="radio" name="replacement" value="defer" ${commanderDown || !eligible.length ? 'checked' : ''}><strong>Defer the inspection</strong><p>Hold the task for crew review. Record the coverage gap in the Earth packet.</p></label>
      <div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button primary">Confirm plan →</button></div>
    </form>`);
  document.getElementById('coverage-form').onsubmit = event => {
    event.preventDefault();
    const choice = new FormData(event.target).get('replacement');
    if (!choice) return;
    state.inspectionDeferred = choice === 'defer';
    if (choice !== 'defer') state.assigned = choice;
    state.version++;
    const description = choice === 'defer'
      ? 'Cooling loop inspection deferred. Crew review required before rescheduling.'
      : `${byId(choice).name} assigned with S. Ibarra.${choice === 'alvarez' ? ' Plant growth experiment moved to 13:00 to avoid overlap.' : ''}`;
    addLog(`Mission plan v${state.version} confirmed`, description);
    render();
    showDialog('Plan updated.', 'CONFIRMED BY A. OKONKWO', `
      <p>${escapeText(description)}</p>
      <div class="plan-notice">${state.crew.filter(c => c.state === 'down').map(c => c.name).join(', ') || 'No crew'} ${state.crew.some(c => c.state === 'down') ? 'currently stood down. Review return to duty when appropriate.' : 'currently stood down.'}</div>
      <div class="dialog-actions"><button class="button secondary" data-close>Back to overview</button><button class="button primary" id="show-packet">Review Earth packet →</button></div>`);
    document.getElementById('show-packet').onclick = openPacket;
  };
}

function packetText() {
  const dataLine = sleepCatalog
    ? `Sleep source: ${sleepCatalog.dataset.name} ${sleepCatalog.dataset.version}`
    : 'Sleep source: sample values';
  return [
    'CREW SWAP / ARES / SOL 187',
    `MISSION PLAN VERSION ${state.version}`,
    dataLine,
    'Crew identities and schedule are simulated.',
    '',
    `Duty review: ${state.crew.map(c => `${c.name}: ${statusLabel(c)} (${c.sleep} h sleep)`).join('; ')}`,
    '',
    ...tasks().map(t => `${t.time} UTC | ${t.title} | ${t.status}\nCrew: ${t.crew.map(id => byId(id).name).join(', ') || 'Unassigned'}`),
    '',
    'Latest decision:',
    state.log[0]?.detail || 'No changes confirmed.',
    '',
    'Prepared onboard. One-way light time: 20 minutes (scenario assumption).',
    'Transmission pending.'
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
  showDialog('Earth handoff', 'ONBOARD DECISION / READY TO REVIEW', `
    <p>The packet reflects current duty status and the latest mission plan.</p>
    <pre class="packet">${escapeText(packetText())}</pre>
    <div class="dialog-actions"><button class="button secondary" data-close>Close</button><button class="button primary" id="download-packet">Download packet ↓</button></div>`);
  document.getElementById('download-packet').onclick = () => {
    download('crew-swap-earth-packet.txt', packetText());
    toast('Earth packet downloaded.');
  };
}

function openSources() {
  const dataset = sleepCatalog?.dataset;
  const sleepBlock = dataset
    ? `<div class="source-item"><a href="${escapeText(dataset.url)}" target="_blank" rel="noopener">${escapeText(dataset.name)} ${escapeText(dataset.version)} ↗</a><p>${escapeText(dataset.notes)}</p><p>DOI: <a href="${escapeText(dataset.doi)}" target="_blank" rel="noopener">${escapeText(dataset.doi)}</a></p></div>`
    : `<div class="source-item"><strong>Sleep data</strong><p>Measured sleep records were unavailable. The interface is using sample sleep histories.</p></div>`;
  showDialog('Data & references', 'PROTOTYPE / PROVENANCE', `
    <p>Crew names, roles, qualifications, and the Mars schedule are simulated. Sleep totals are measured overnight recordings mapped into the demo.</p>
    ${sleepBlock}
    <div class="source-item"><a href="https://www.nasa.gov/news-release/nasa-coverage-of-rescheduled-spacewalk-preparing-for-new-solar-array/" target="_blank" rel="noopener">NASA · A real crew reassignment ↗</a><p>In 2021, Thomas Pesquet replaced Mark Vande Hei on a rescheduled spacewalk while Vande Hei provided internal support.</p></div>
    <div class="source-item"><a href="https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20140016946.pdf" target="_blank" rel="noopener">NASA · Fatigue in ISS astronauts ↗</a><p>Background on fatigue, sleep monitoring, and performance measures. Duty decisions in this preview are made by the operator.</p></div>
    <div class="dialog-actions"><button class="button primary" data-close>Got it</button></div>`);
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
  };
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
    showDialog('Preview options', 'CREW SWAP', `
      <p>${sleepCatalog ? 'Sleep totals come from PhysioNet BIDSleep. Mission roles remain simulated.' : 'The interface currently uses sample crew health and mission data.'}</p>
      <div class="dialog-actions"><button class="button secondary" id="mobile-reset">Reset preview</button><button class="button primary" id="mobile-sources">Data & references</button></div>`);
    document.getElementById('mobile-sources').onclick = openSources;
    document.getElementById('mobile-reset').onclick = () => document.getElementById('reset-button').click();
  };
  document.getElementById('export-log').onclick = () => {
    download('crew-swap-decision-log.json', JSON.stringify(state.log, null, 2), 'application/json');
    toast('Decision log downloaded.');
  };
  document.getElementById('reset-button').onclick = () => {
    showDialog('Restart the preview?', 'SAMPLE MISSION', `
      <p>This restores the four crew records from the loaded sleep dataset and clears locally saved decisions.</p>
      <div class="dialog-actions"><button class="button secondary" data-close>Keep current plan</button><button class="button danger" id="confirm-reset">Reset preview</button></div>`);
    document.getElementById('confirm-reset').onclick = () => {
      state = freshState(sleepCatalog);
      render();
      setView('overview');
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
  setView('overview');
  if (sleepCatalog) {
    toast('Loaded measured sleep histories from PhysioNet BIDSleep.');
  }
}

boot();

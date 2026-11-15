const initialCrew = [
  {id:'ibarra',name:'Aung Min',fullName:'Aung Min',role:'Commander',initials:'AM',sleep:7.6,fatigue:2,baseline:7.7,history:[7.8,7.5,7.9,7.4,7.8,7.6,7.6],state:'available',skills:['EVA command'],note:'Feeling rested. Ready for the inspection.',time:'08:15'},
  {id:'chen',name:'Thiri Htet',fullName:'Thiri Htet',role:'Systems specialist',initials:'TH',sleep:4.8,fatigue:7,baseline:7.4,history:[7.5,7.2,6.8,6.5,5.9,5.3,4.8],state:'review',skills:['Cooling systems','EVA systems'],note:'Woke up several times. Having trouble concentrating this morning.',time:'08:32'},
  {id:'alvarez',name:'Kaung Htet',fullName:'Kaung Htet',role:'Flight engineer',initials:'KH',sleep:7.2,fatigue:3,baseline:7.3,history:[7.1,7.6,7.3,7.5,7.0,7.4,7.2],state:'available',skills:['Cooling systems','EVA systems'],note:'Slept well. Available for systems work if needed.',time:'08:20'},
  {id:'okonkwo',name:'May Thazin',fullName:'May Thazin',role:'Crew medical officer',initials:'MT',sleep:7.8,fatigue:2,baseline:7.6,history:[7.5,7.7,7.3,7.8,7.6,7.9,7.8],state:'available',skills:['Medical operations'],note:'No concerns at this morning’s check-in.',time:'08:10'}
];
const sleepDataset = window.CREW_SLEEP_DATA;
const measuredNights = sleepDataset.subjects.find(subject => subject.id === 'Bidslab00').nights;
const referenceHours = measuredNights.slice(0, 3).reduce((sum, night) => sum + night.sleepMinutes, 0) / 180;
function loadMeasuredSleep(person) {
  person.history = measuredNights.map(night => night.sleepMinutes / 60);
  person.sleep = person.history.at(-1);
  person.baseline = referenceHours;
  person.sleepSource = 'bidsleep';
}
loadMeasuredSleep(initialCrew.find(person => person.id === 'chen'));
const storageKey='crew-swap-ui-v1';
const freshState=()=>({crew:structuredClone(initialCrew),assigned:'chen',inspectionDeferred:false,version:1,log:[],selected:'chen'});
function readState(){try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.crew?.length===4&&saved.crew.every(c=>initialCrew.some(i=>i.id===c.id)&&Array.isArray(c.history))&&Array.isArray(saved.log))return saved;}catch{}return freshState();}
let state=readState();
// Apply current crew identities to saved missions without resetting their decisions.
const previousCrewNames = [
  ['Sofia Ibarra', 'Aung Min'], ['S. Ibarra', 'Aung Min'], ['Ibarra', 'Aung Min'],
  ['Lin Chen', 'Thiri Htet'], ['L. Chen', 'Thiri Htet'], ['Chen', 'Thiri Htet'],
  ['Rafael Alvarez', 'Kaung Htet'], ['R. Alvarez', 'Kaung Htet'], ['Alvarez', 'Kaung Htet'],
  ['Amara Okonkwo', 'May Thazin'], ['A. Okonkwo', 'May Thazin'], ['Okonkwo', 'May Thazin']
];
for (const person of state.crew) {
  const identity = initialCrew.find(crew => crew.id === person.id);
  person.name = identity.name;
  person.fullName = identity.fullName;
  person.initials = identity.initials;
}
for (const entry of state.log) {
  for (const field of ['title', 'detail']) {
    if (typeof entry[field] !== 'string') continue;
    for (const [previousName, currentName] of previousCrewNames) {
      entry[field] = entry[field].replaceAll(previousName, currentName);
    }
  }
}
let currentView='overview';
let toastTimer;
const byId=id=>state.crew.find(c=>c.id===id);
const escapeText=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clock=()=>new Date().toISOString().slice(11,16);
const statusLabel=c=>c.state==='down'?'Stand-down confirmed':c.state==='review'?'Check-in needs review':'Available';
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{toast('Changes are available for this session.');}}
function addLog(title,detail){state.log.unshift({time:clock(),title,detail});}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}

function sleepEvidenceText(person) {
  if (person.id !== 'chen') return 'Fictional sleep history and scenario report.';
  if (person.sleepSource !== 'bidsleep') return 'Manual or legacy sample sleep values. Measured replay available in Thiri Htet’s check-in.';
  const difference = person.sleep - referenceHours;
  return 'BIDSleep v1.0.1 · participant Bidslab00 · Earth-study replay. ' +
    'Latest recording ' + measuredNights.at(-1).date + ': ' + person.sleep.toFixed(2) + ' h. ' +
    'Personal reference = (' + measuredNights.slice(0,3).map(n => n.sleepMinutes + ' min').join(' + ') + ') / 3 / 60 = ' + referenceHours.toFixed(2) + ' h. ' +
    'Latest minus reference = ' + difference.toFixed(2) + ' h. Latest recording excluded from baseline. ' +
    'Fatigue ' + person.fatigue + '/10 (' + (person.reportEdited ? 'manual entry' : 'fictional scenario report') + '). ' +
    'Short research reference; duty status requires officer review. Source: ' + sleepDataset.url;
}
function sleepEvidence(person, allowLoad = true) {
  if (person.id !== 'chen') return '';
  if (person.sleepSource !== 'bidsleep') return '<div class="sleep-evidence"><p>Sleep values are manually entered or from the earlier sample.</p>' + (allowLoad ? '<button class="button btn secondary" data-action="measured">Load measured sleep replay</button>' : '') + '</div>';
  return '<div class="sleep-evidence"><strong>Measured Earth-study replay · BIDSleep</strong><details><summary>View source and baseline calculation</summary><p>' + escapeText(sleepEvidenceText(person).split(' Source:')[0]) + '</p>' +
    '<p>Sleep = expert-scored N1 + N2 + N3 + REM epochs × 30 seconds. Wake and unknown epochs are excluded. Dates use source US/Eastern time. Each recording is retained, including two starting on December 4.</p><ul>' +
    measuredNights.map(n => '<li><a href="' + n.sourceUrl + '" target="_blank" rel="noopener">' + escapeText(n.recordingStart) + '</a> · ' + n.sleepMinutes + ' min sleep · ' + n.unknownMinutes + ' min unknown</li>').join('') +
    '</ul><p>All seven source files are bundled locally with SHA-256 checksums.</p></details></div>';
}

function renderCrew() {
  document.getElementById('crew-grid').innerHTML = state.crew.map(c => `<button class="crew-card ${state.selected===c.id?'selected':''}" data-crew="${c.id}" aria-pressed="${state.selected===c.id}"><strong>${c.name}</strong><span class="crew-role">${c.role}</span><span class="crew-status ${c.state}">${statusLabel(c)}</span></button>`).join('');
  document.getElementById('overview-crew').innerHTML = state.crew.map(c => `<button class="crew-row" data-crew="${c.id}"><span><strong>${c.name}</strong><span class="crew-role">${c.role}</span></span><span class="crew-status ${c.state}">${statusLabel(c)}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`).join('');
}
function renderHealth() {
  const c=byId(state.selected);
  const delta=c.sleep-c.baseline;
  const chartMax=Math.max(9, ...c.history, c.baseline);
  const dates=c.sleepSource==='bidsleep' ? measuredNights.map(n=>n.date.slice(5)) : ['Night 1','Night 2','Night 3','Night 4','Night 5','Night 6','Latest'];
  document.getElementById('health-panel').innerHTML=`
    <div class="panel-header"><div><h2>${c.name}</h2><p>${c.role}</p></div><span class="crew-status ${c.state}">${statusLabel(c)}</span></div>
    <div class="detail-main">
      <div class="health-metrics"><div><span>Latest sleep</span><strong>${c.sleep.toFixed(2)} <small>hours</small></strong></div><div><span>Personal reference</span><strong>${c.baseline.toFixed(2)} <small>hours</small></strong></div><div><span>Reported fatigue</span><strong>${c.fatigue} <small>/ 10</small></strong></div></div>
      <figure class="sleep-figure" aria-label="Seven sleep recordings in hours: ${c.history.map(v=>v.toFixed(2)).join(', ')}. Reference ${c.baseline.toFixed(2)} hours.">
        <div class="chart-title"><h3>Sleep history</h3><span>${Math.abs(delta).toFixed(2)} h ${delta<0?'below':'above'} reference</span></div>
        <div class="chart-area"><div class="baseline" style="bottom:${c.baseline/chartMax*100}%"></div>${c.history.map(v=>`<div class="chart-column"><div class="chart-bar" style="height:${v/chartMax*100}%"><span>${v.toFixed(1)}</span></div></div>`).join('')}</div>
        <div class="chart-days">${dates.map(d=>`<span>${d}</span>`).join('')}</div>
      </figure>
      ${sleepEvidence(c)}
      <div class="report-heading"><h3>Latest check-in</h3><span>${escapeText(c.time)} UTC</span></div>
      <blockquote class="quote">“${escapeText(c.note)}”<small>${c.reportEdited?'Manual check-in':'Fictional scenario report'}</small></blockquote>
      <div class="health-actions"><button class="button btn secondary" data-action="checkin">Update check-in</button><button class="button btn primary" data-action="status">${c.state==='down'?'Review return to duty':'Review duty status'}</button></div>
      <p class="health-footnote">May Thazin confirms duty changes after reviewing the evidence.</p>
    </div>`;
}
function inspectionStatus(){if(state.inspectionDeferred)return 'Deferred';if(byId('ibarra').state==='down'||byId(state.assigned).state==='down'||(state.assigned==='alvarez'&&state.alvarezUnavailable))return 'Coverage gap';if(byId(state.assigned).state==='review'||byId('ibarra').state==='review')return 'Health review';return 'Scheduled';}
function tasks(){const swap=state.assigned==='alvarez'&&!state.inspectionDeferred;return [
  {time:'09:30',title:'Cooling loop inspection',duration:'90 min',crew:[state.assigned,'ibarra'],status:inspectionStatus()},
  {time:'09:30',title:'Medical console coverage',duration:'45 min',crew:['okonkwo'],status:byId('okonkwo').state==='down'?'Coverage gap':'Scheduled'},
  {time:swap?'13:00':'10:00',title:'Plant growth experiment',duration:'60 min',crew:['alvarez'],status:byId('alvarez').state==='down'?'Deferred':swap?'Rescheduled':'Scheduled'},
  {time:'11:15',title:'Resistive exercise',duration:'45 min',crew:state.crew.filter(c=>c.state!=='down').map(c=>c.id),status:'Scheduled'}
].sort((a,b)=>a.time.localeCompare(b.time));}
function renderSchedule() {
  document.getElementById('schedule').innerHTML=tasks().map(t=>`<article class="task ${['Health review','Coverage gap'].includes(t.status)?'review-task':''}"><div class="task-time">${t.time}<span>${t.duration}</span></div><div class="task-info"><h3>${t.title}</h3><p>${t.crew.map(id=>byId(id).name).join(' · ')||'No available crew'}</p></div><span class="task-badge ${t.status==='Scheduled'?'available':t.status==='Deferred'?'down':'review'}">${t.status}</span></article>`).join('');
  document.getElementById('version-label').textContent='Plan version '+state.version;
  document.getElementById('plan-footer').textContent=state.version>1?'Changes are recorded in the decision log.':'Review duty clearance before confirming coverage.';
}
function renderAlert() {
  const needs=state.crew.filter(c=>c.state==='review');
  const gaps=tasks().filter(t=>t.status==='Coverage gap');
  document.getElementById('alert-banner').classList.toggle('resolved',!needs.length&&!gaps.length);
  document.getElementById('alert-title').textContent=gaps.length?'Coverage needs attention':needs.length?'Check-in awaiting review':'Crew reviews complete';
  document.getElementById('alert-description').textContent=gaps.length?'A duty change affects an assigned task. Review qualified replacements.':needs.length?needs.map(c=>c.name).join(', ')+' needs a duty review before the next operation.':'Review the mission plan or prepare the Earth handoff.';
  document.getElementById('review-checkin').textContent=gaps.length?'Review coverage':needs.length?'Review check-in':'Review Earth packet';
}
function renderLog(){document.getElementById('log-content').innerHTML=state.log.length?state.log.map(l=>`<article class="log-row"><time>${escapeText(l.time)}</time><div><h3>${escapeText(l.title)}</h3><p>${escapeText(l.detail)}</p></div></article>`).join(''):'<div class="empty"><strong>Your decisions will appear here.</strong><p>Review a check-in, confirm a duty change, or approve a new plan to create the first entry.</p></div>';}
function render() {
  renderCrew(); renderHealth(); renderSchedule(); renderAlert(); renderLog();
  const next=tasks().find(t=>t.status!=='Deferred');
  document.getElementById('next-operation').innerHTML=next?`<div class="operation-time">${next.time}<span>UTC · ${next.duration}</span></div><h3>${next.title}</h3><p>${next.crew.map(id=>byId(id).name).join(' · ')}</p><span class="task-badge ${next.status==='Scheduled'?'available':'review'}">${next.status}</span>`:'<p>Review deferred operations to schedule the next task.</p>';
  persist();
}
function setView(view) {
  const labels={overview:['Mission overview','Crew status and the next operation.'],health:['Crew health','Review sleep, check-ins, and duty clearance.'],plan:['Mission plan','Review assignments and resolve coverage gaps.'],log:['Decision log','Duty changes and the reasoning behind each plan.']};
  if(!labels[view]) view='overview';
  currentView=view;
  document.body.dataset.view=view;
  document.querySelectorAll('.nav-item').forEach(button=>{
    button.classList.toggle('active',button.dataset.view===view);
    if(button.dataset.view===view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('page-heading').textContent=labels[view][0];
  document.getElementById('page-description').textContent=labels[view][1];
  for(const [id,target] of [['overview-content','overview'],['alert-banner','overview'],['health-workspace','health'],['mission-workspace','plan'],['log-panel','log']]) {
    document.getElementById(id).classList.toggle('hidden',view!==target);
  }
  document.getElementById('new-checkin').classList.toggle('hidden',view==='plan'||view==='log');
  if(location.hash!=='#'+view) history.replaceState(null,'','#'+view);
}
const dialog=document.getElementById('dialog');
function showDialog(title,eyebrow,body){document.getElementById('dialog-content').innerHTML=`<div class="dialog-header"><div><h2 id="dialog-heading">${title}</h2></div><button class="icon-button" data-close aria-label="Close dialog">×</button></div><div class="dialog-body">${body}</div>`;if(!dialog.open)dialog.showModal();}
function closeDialog(){dialog.close();}
function openCheckin(){const c=byId(state.selected);showDialog('Update check-in','CREW HEALTH / SELF-REPORT',`<p>Record how you slept and how you feel before your next task.</p><form id="checkin-form"><label class="field"><span>Crew member</span><select name="crew">${state.crew.map(p=>`<option value="${p.id}" ${p.id===c.id?'selected':''}>${p.name} — ${p.role}</option>`).join('')}</select></label><div class="field-row"><label class="field"><span>Last night’s sleep (hours)</span><input name="sleep" type="number" min="0" max="24" step="0.1" value="${c.sleep.toFixed(1)}" required></label><label class="field"><span>Fatigue <output id="fatigue-output">${c.fatigue}</output> / 10</span><input name="fatigue" type="range" min="0" max="10" value="${c.fatigue}"><small>0 · None &nbsp; 10 · Extreme</small></label></div><label class="field"><span>How are you feeling?</span><textarea name="note" maxlength="300" required>${escapeText(c.note)}</textarea></label><div class="dialog-actions"><button type="button" class="button btn secondary" data-close>Cancel</button><button class="button btn primary" type="submit">Save check-in →</button></div></form>`);const form=document.getElementById('checkin-form');form.elements.fatigue.addEventListener('input',()=>document.getElementById('fatigue-output').textContent=form.elements.fatigue.value);form.elements.crew.addEventListener('change',()=>{const person=byId(form.elements.crew.value);form.elements.sleep.value=person.sleep.toFixed(1);form.elements.fatigue.value=person.fatigue;form.elements.note.value=person.note;document.getElementById('fatigue-output').textContent=person.fatigue;});form.addEventListener('submit',event=>{event.preventDefault();const person=byId(form.elements.crew.value);const enteredSleep=Number(form.elements.sleep.value);const sleepChanged=enteredSleep!==Number(person.sleep.toFixed(1));if(sleepChanged)person.sleep=enteredSleep;person.fatigue=Number(form.elements.fatigue.value);person.note=form.elements.note.value.trim();person.time=clock();if(sleepChanged){person.history[6]=person.sleep;person.sleepSource='manual';}person.reportEdited=true;if(person.state!=='down')person.state='review';state.selected=person.id;addLog(`${person.name} submitted a check-in`,`${person.sleep} h sleep; fatigue ${person.fatigue}/10. ${person.state==='down'?'Stand-down remains in effect pending review.':'Queued for duty review.'}`);closeDialog();render();toast('Check-in saved. Ready for medical officer review.');});}
function openDuty(){const c=byId(state.selected);showDialog('Review duty status','CREW MEDICAL OFFICER / '+c.initials,`<p>Review ${c.name}’s report and confirm the appropriate duty status.</p><div class="review-summary"><div><span>Last night</span><b>${c.sleep.toFixed(2)} h</b></div><div><span>Usual sleep</span><b>${c.baseline.toFixed(2)} h</b></div><div><span>Fatigue</span><b>${c.fatigue}/10</b></div></div>${sleepEvidence(c, false)}<blockquote class="quote">“${escapeText(c.note)}”</blockquote><p>Standing down removes ${c.name} from available coverage. Existing assignments will be flagged for replanning.</p><div class="dialog-actions"><button class="button btn secondary" id="confirm-available">Confirm available</button><button class="button btn danger" id="confirm-down" ${c.state==='down'?'disabled':''}>Confirm stand-down →</button></div>`);document.getElementById('confirm-available').onclick=()=>{c.state='available';addLog(`${c.name} confirmed available`,'Duty status reviewed by May Thazin. Existing plan retained pending any reassignment.');closeDialog();render();toast(`${c.name} is available for assignment.`);};document.getElementById('confirm-down').onclick=()=>{c.state='down';addLog(`${c.name} stood down`,'May Thazin confirmed stand-down after reviewing the crew check-in.');render();openCoverage();};}
function candidateReason(c){if(c.id==='alvarez' && state.alvarezUnavailable)return 'Unavailable for the inspection window';if(c.state==='down')return 'Confirmed stand-down';if(c.state==='review')return 'Health review pending';if(!c.skills.includes('Cooling systems'))return 'Cooling systems qualification required';return '';}
function openCoverage(){const commanderDown=byId('ibarra').state!=='available';const eligible=state.crew.filter(c=>!candidateReason(c));const options=state.crew.filter(c=>c.id!=='ibarra');const selected=eligible.find(c=>c.id===state.assigned)||eligible[0];showDialog('Review coverage','MISSION PLAN / COOLING LOOP INSPECTION',`<p>09:30–11:00 UTC · Requires a cooling systems specialist and an EVA commander. Qualifications and assignments are sample mission inputs.</p>${commanderDown?'<div class="plan-notice">The EVA commander requires duty clearance. The inspection must be deferred until qualified coverage is available.</div>':''}<label class="availability-control"><input id="alvarez-available" type="checkbox" ${state.alvarezUnavailable?'':'checked'}> Kaung Htet available for this inspection <small>Scenario control · duty clearance is checked separately</small></label><form id="coverage-form">${options.map(c=>{const reason=commanderDown?'EVA commander unavailable':candidateReason(c);return `<label class="choice"><input type="radio" name="replacement" value="${c.id}" ${reason?'disabled':c.id===selected?.id?'checked':''}><strong>${c.name} · ${c.role}</strong><p>${c.skills.join(' · ')}</p>${reason?`<em>${reason}</em>`:c.id==='alvarez'?'<em>Moves plant growth experiment from 10:00 to 13:00 to avoid overlap.</em>':'<p>Available for the full inspection window.</p>'}</label>`;}).join('')}<label class="choice"><input type="radio" name="replacement" value="defer" ${commanderDown||!eligible.length?'checked':''}><strong>Defer the inspection</strong><p>Hold the task for crew review. Record the coverage gap in the Earth packet.</p></label><div class="dialog-actions"><button type="button" class="button btn secondary" data-close>Cancel</button><button type="submit" class="button btn primary">Confirm plan →</button></div></form>`);document.getElementById('alvarez-available').onchange=event=>{
  state.alvarezUnavailable = !event.target.checked;
  addLog('Inspection availability changed', 'Kaung Htet ' + (state.alvarezUnavailable ? 'unavailable' : 'available') + ' for the inspection window. Plan awaits confirmation.');
  render();
  openCoverage();
};document.getElementById('coverage-form').onsubmit=event=>{event.preventDefault();const choice=new FormData(event.target).get('replacement');if(!choice)return;if(choice!=='defer'&&(candidateReason(byId(choice))||byId('ibarra').state!=='available'))return openCoverage();state.inspectionDeferred=choice==='defer';if(choice!=='defer')state.assigned=choice;state.version++;const description=choice==='defer'?'Cooling loop inspection deferred. Crew review required before rescheduling.':`${byId(choice).name} assigned with Aung Min.${choice==='alvarez'?' Plant growth experiment moved to 13:00 to avoid overlap.':''}`;addLog(`Mission plan v${state.version} confirmed`,description);render();showDialog('Plan updated.','CONFIRMED BY MAY THAZIN',`<p>${escapeText(description)}</p><div class="plan-notice">${state.crew.filter(c=>c.state==='down').map(c=>c.name).join(', ')||'No crew'} ${state.crew.some(c=>c.state==='down')?'currently stood down. Review return to duty when appropriate.':'currently stood down.'}</div><div class="dialog-actions"><button class="button btn secondary" data-close>Back to overview</button><button class="button btn primary" id="show-packet">Review Earth packet →</button></div>`);document.getElementById('show-packet').onclick=openPacket;};}
function packetText(){return ['CREW SWAP / ARES / SOL 187',`MISSION PLAN VERSION ${state.version}`, 'Sample mission — see health evidence for active data source','',sleepEvidenceText(byId('chen')),'',`Duty review: ${state.crew.map(c=>`${c.name}: ${statusLabel(c)}`).join('; ')}`, '', ...tasks().map(t=>`${t.time} UTC | ${t.title} | ${t.status}\nCrew: ${t.crew.map(id=>byId(id).name).join(', ')||'Unassigned'}`),'','Latest decision:',state.log[0]?.detail||'No changes confirmed.','', 'Prepared onboard. One-way light time: 20 minutes (scenario assumption).','Transmission pending.'].join('\n');}
function download(name,content,type='text/plain'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function openPacket(){showDialog('Earth handoff','ONBOARD DECISION / READY TO REVIEW',`<p>The packet reflects current duty status and the latest mission plan.</p><pre class="packet">${escapeText(packetText())}</pre><div class="dialog-actions"><button class="button btn secondary" data-close>Close</button><button class="button btn primary" id="download-packet">Download packet ↓</button></div>`);document.getElementById('download-packet').onclick=()=>{download('crew-swap-earth-packet.txt',packetText());toast('Earth packet downloaded.');};}
function openSources(){showDialog('Data & references','PROTOTYPE / PROVENANCE',`<p>Thiri Htet’s measured replay uses seven recordings from BIDSleep participant Bidslab00, an Earth-based volunteer. Crew identities, initial fatigue reports, other crew histories, qualifications, and assignments are fictional. NASA publications supply mission context.</p><div class="source-item"><a href="https://www.nasa.gov/news-release/nasa-coverage-of-rescheduled-spacewalk-preparing-for-new-solar-array/" target="_blank" rel="noopener">NASA · A real crew reassignment ↗</a><p>In 2021, Thomas Pesquet replaced Mark Vande Hei on a rescheduled spacewalk while Vande Hei provided internal support.</p></div><div class="source-item"><a href="https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20140016946.pdf" target="_blank" rel="noopener">NASA · Fatigue in ISS astronauts ↗</a><p>Background on fatigue, sleep monitoring, and performance measures. Duty decisions in this preview are made by the operator.</p></div><div class="source-item"><strong>Measured sleep provenance</strong><p>${escapeText(sleepDataset.citation)}</p><p>${escapeText(sleepDataset.publication)}</p><p>${escapeText(sleepDataset.platformCitation)}</p><p>${escapeText(sleepDataset.method)}</p><p>${escapeText(sleepDataset.baselineMethod)}</p><p>${escapeText(sleepDataset.license)}</p><a href="${sleepDataset.url}" target="_blank" rel="noopener">View research dataset ↗</a> · <a href="data/sleep.json" download>Download evidence</a> · <a href="data/raw/bidsleep/LICENSE.txt">License</a></div><div class="dialog-actions"><button class="button btn primary" data-close>Got it</button></div>`);}
document.querySelector('nav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button)setView(button.dataset.view);});
document.querySelector('.brand').onclick=event=>{event.preventDefault();setView('overview');};
document.getElementById('crew-grid').onclick=event=>{const card=event.target.closest('[data-crew]');if(card){state.selected=card.dataset.crew;render();}};
document.getElementById('health-panel').onclick=event=>{const button=event.target.closest('[data-action]');if(button?.dataset.action==='checkin')openCheckin();if(button?.dataset.action==='status')openDuty();if(button?.dataset.action==='measured'){loadMeasuredSleep(byId('chen'));if(byId('chen').state!=='down')byId('chen').state='review';addLog('Measured sleep replay loaded','BIDSleep Bidslab00, all seven recordings; baseline from first three recordings.');render();}};
document.getElementById('new-checkin').onclick=openCheckin;
document.getElementById('review-checkin').onclick=()=>{if(tasks().some(t=>t.status==='Coverage gap'))return openCoverage();const c=state.crew.find(p=>p.state==='review');if(c){state.selected=c.id;render();openDuty();}else openPacket();};
document.getElementById('review-options').onclick=openCoverage;
document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>setView(button.dataset.go));
document.getElementById('overview-crew').onclick=event=>{const row=event.target.closest('[data-crew]');if(row){state.selected=row.dataset.crew;render();setView('health');}};
document.getElementById('earth-packet').onclick=openPacket;
document.getElementById('sources-button').onclick=openSources;
document.getElementById('export-log').onclick=()=>{download('crew-swap-decision-log.json',JSON.stringify(state.log,null,2),'application/json');toast('Decision log downloaded.');};
document.getElementById('reset-button').onclick=()=>{showDialog('Restart the preview?','SAMPLE MISSION',`<p>This restores the four sample crew records and clears locally saved decisions.</p><div class="dialog-actions"><button class="button btn secondary" data-close>Keep current plan</button><button class="button btn danger" id="confirm-reset">Reset preview</button></div>`);document.getElementById('confirm-reset').onclick=()=>{state=freshState();render();setView('overview');closeDialog();toast('Preview restored.');};};
dialog.addEventListener('click',event=>{if(event.target.closest('[data-close]'))closeDialog();if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
render();
setView(location.hash.slice(1));
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));

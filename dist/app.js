const sleepDataset = window.CREW_SLEEP_DATA;
/** Each crew member replays one BIDSleep PhysioNet subject (real measured nights). */
const CREW_SLEEP_SUBJECT = {
  ibarra: 'Bidslab01',
  chen: 'Bidslab00',
  alvarez: 'Bidslab02',
  okonkwo: 'Bidslab06'
};
function sleepSubject(person){
  const id=person.sleepSubject||CREW_SLEEP_SUBJECT[person.id];
  return sleepDataset.subjects.find(subject=>subject.id===id);
}
function sleepNights(person){
  return sleepSubject(person)?.nights||[];
}
/** Fatigue 0–10 derived from measured sleep (not invented survey data). */
function fatigueFromSleep(history, baseline, latest){
  const under6=(history||[]).filter(h=>h<6).length;
  const deficit=baseline-latest;
  let fatigue=1;
  if(deficit>=2) fatigue+=4;
  else if(deficit>=1) fatigue+=2;
  if(latest<5) fatigue+=3;
  else if(latest<6) fatigue+=2;
  if(under6>=3) fatigue+=2;
  else if(under6>=2) fatigue+=1;
  return Math.min(10, Math.max(0, Math.round(fatigue)));
}
function loadMeasuredSleep(person){
  const nights=sleepNights(person);
  if(!nights.length) return person;
  const baselineNights=nights.slice(0, Math.min(3, nights.length));
  person.sleepSubject=person.sleepSubject||CREW_SLEEP_SUBJECT[person.id];
  person.history=nights.map(night=>night.sleepMinutes/60);
  person.sleep=person.history.at(-1);
  person.baseline=baselineNights.reduce((sum,night)=>sum+night.sleepMinutes,0)/(baselineNights.length*60);
  person.sleepSource='bidsleep';
  if(!person.reportEdited) person.fatigue=fatigueFromSleep(person.history, person.baseline, person.sleep);
  return person;
}
const SKILL_CATALOG = [
  'EVA command',
  'Cooling systems',
  'EVA systems',
  'Medical operations',
  'Plant systems',
  'Logistics'
];
const DEFAULT_REQUIREMENTS = {
  coolingLoop: ['Cooling systems'],
  commander: ['EVA command']
};
const initialCrew = [
  {id:'ibarra',name:'Aung Min',fullName:'Aung Min',role:'Commander',initials:'AM',sleepSubject:'Bidslab01',state:'available',skills:['EVA command'],note:'Feeling rested. Ready for the inspection.',time:'08:15'},
  {id:'chen',name:'Thiri Htet',fullName:'Thiri Htet',role:'Systems specialist',initials:'TH',sleepSubject:'Bidslab00',state:'review',skills:['Cooling systems','EVA systems'],note:'Woke up several times. Having trouble concentrating this morning.',time:'08:32'},
  {id:'alvarez',name:'Kaung Htet',fullName:'Kaung Htet',role:'Flight engineer',initials:'KH',sleepSubject:'Bidslab02',state:'available',skills:['Cooling systems','EVA systems'],note:'Slept well. Available for systems work if needed.',time:'08:20'},
  {id:'okonkwo',name:'May Thazin',fullName:'May Thazin',role:'Crew medical officer',initials:'MT',sleepSubject:'Bidslab06',state:'available',skills:['Medical operations'],note:'No concerns at this morning’s check-in.',time:'08:10'}
];
initialCrew.forEach(loadMeasuredSleep);
const storageKey='crew-swap-ui-v2';
const freshState=()=>({
  crew:structuredClone(initialCrew),
  assigned:'chen',
  inspectionDeferred:false,
  version:1,
  log:[],
  selected:'chen',
  requirements:structuredClone(DEFAULT_REQUIREMENTS)
});
function normalizeSkills(list){
  if(!Array.isArray(list)) return [];
  const seen=new Set();
  const out=[];
  for(const raw of list){
    const skill=String(raw||'').trim();
    if(!skill||seen.has(skill)) continue;
    seen.add(skill);
    out.push(skill);
  }
  return out;
}
function normalizeRequirements(raw){
  const next=structuredClone(DEFAULT_REQUIREMENTS);
  if(raw&&typeof raw==='object'){
    if(Array.isArray(raw.coolingLoop)) next.coolingLoop=normalizeSkills(raw.coolingLoop);
    if(Array.isArray(raw.commander)) next.commander=normalizeSkills(raw.commander);
  }
  if(!next.coolingLoop.length) next.coolingLoop=DEFAULT_REQUIREMENTS.coolingLoop.slice();
  if(!next.commander.length) next.commander=DEFAULT_REQUIREMENTS.commander.slice();
  return next;
}
function readState(){
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey));
    if(saved?.crew?.length===4&&saved.crew.every(c=>initialCrew.some(i=>i.id===c.id)&&Array.isArray(c.history))&&Array.isArray(saved.log)){
      saved.requirements=normalizeRequirements(saved.requirements);
      for(const person of saved.crew){
        const identity=initialCrew.find(crew=>crew.id===person.id);
        person.skills=normalizeSkills(Array.isArray(person.skills)?person.skills:identity.skills);
      }
      return saved;
    }
  }catch{}
  return freshState();
}
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
  person.sleepSubject = identity.sleepSubject;
  person.skills = normalizeSkills(Array.isArray(person.skills) ? person.skills : identity.skills);
  if(person.sleepSource!=='manual') loadMeasuredSleep(person);
}
state.requirements = normalizeRequirements(state.requirements);
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
const statusLabel=c=>{
  if(c.state==='down') return 'Stand-down confirmed';
  const flag=c.flag||evaluateFatigueFlag(c);
  if(c.state==='review'&&flag.recommendStandDown) return 'Flagged';
  if(c.state==='review') return 'Needs review';
  if(flag.level==='watch') return 'Watch';
  return 'Available';
};
/** Medical officer reviews other crew; Commander reviews the medical officer (no self-clearance). */
function dutyReviewer(person){
  if(person.id==='okonkwo') return byId('ibarra'); // Commander reviews May Thazin
  return byId('okonkwo'); // Medical officer reviews everyone else
}
function dutyReviewerLabel(person){
  const reviewer=dutyReviewer(person);
  return reviewer.id==='ibarra'?'COMMANDER / '+reviewer.initials:'CREW MEDICAL OFFICER / '+person.initials;
}

/**
 * Auto-flag from BIDSleep measured nights + NASA-aligned short-sleep thresholds
 * (ISS RST / sleep-restriction literature: <6 h, especially 3+ nights).
 */
function evaluateFatigueFlag(person){
  const sleep=Number(person.sleep)||0;
  const baseline=Number(person.baseline)||0;
  const fatigue=Number(person.fatigue)||0;
  const deficit=baseline-sleep;
  const recent=(person.history||[]).slice(-3);
  const under6=recent.filter(n=>n<6).length;
  const reasons=[];
  let score=0;

  if(sleep>0&&sleep<5){ score+=3; reasons.push(`${sleep.toFixed(1)} h sleep`); }
  else if(sleep>0&&sleep<6){ score+=2; reasons.push(`${sleep.toFixed(1)} h (<6 h)`); }

  if(deficit>=2){ score+=2; reasons.push(`${deficit.toFixed(1)} h below baseline`); }
  else if(deficit>=1){ score+=1; reasons.push(`${deficit.toFixed(1)} h below baseline`); }

  if(under6>=3){ score+=3; reasons.push('3 nights <6 h'); }
  else if(under6>=2){ score+=2; reasons.push('2 nights <6 h'); }

  if(fatigue>=8){ score+=2; reasons.push(`Fatigue ${fatigue}/10`); }
  else if(fatigue>=6){ score+=1; reasons.push(`Fatigue ${fatigue}/10`); }

  const recommendStandDown=score>=4;
  const level=recommendStandDown?'stand-down':score>=2?'watch':'clear';
  return {
    score,
    level,
    recommendStandDown,
    deficit:Number(deficit.toFixed(2)),
    under6,
    source:person.sleepSubject||CREW_SLEEP_SUBJECT[person.id]||'manual',
    reasons:reasons.length?reasons:['Within range']
  };
}
function applyFatigueFlag(person,{queueReview=false}={}){
  person.flag=evaluateFatigueFlag(person);
  if(queueReview&&person.flag.recommendStandDown&&person.state!=='down') person.state='review';
  return person.flag;
}
function refreshCrewFlags({queueReview=false}={}){
  for(const person of state.crew) applyFatigueFlag(person,{queueReview});
}
function flagPanelHtml(person){
  const flag=person.flag||evaluateFatigueFlag(person);
  const title=flag.recommendStandDown?'Stand-down':flag.level==='watch'?'Watch':'Clear';
  const source=flag.source&&flag.source!=='manual'?flag.source:'manual';
  return `<aside class="flag-panel flag-${flag.level}">
    <div class="flag-heading"><strong>${title}</strong><span>${flag.score} · ${escapeText(source)}</span></div>
    <ul>${flag.reasons.map(r=>`<li>${escapeText(r)}</li>`).join('')}</ul>
  </aside>`;
}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{toast('Changes are available for this session.');}}
function addLog(title,detail){state.log.unshift({time:clock(),title,detail});}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function hasSkill(person,skill){return normalizeSkills(person?.skills).includes(skill);}
function missingSkills(person,required){return normalizeSkills(required).filter(skill=>!hasSkill(person,skill));}
function skillOptionsFor(person){
  const owned=normalizeSkills(person.skills);
  return [...new Set([...SKILL_CATALOG,...owned,(state.requirements?.coolingLoop||[]),(state.requirements?.commander||[])].flat())];
}
function skillsHtml(person){
  const skills=normalizeSkills(person.skills);
  if(!skills.length) return '<p class="skills-empty">No qualifications assigned.</p>';
  return `<ul class="skill-list">${skills.map(skill=>`<li>${escapeText(skill)}</li>`).join('')}</ul>`;
}

function sleepEvidenceText(person) {
  if (person.sleepSource !== 'bidsleep') return 'Manual sleep values.';
  const subject=person.sleepSubject||CREW_SLEEP_SUBJECT[person.id];
  return 'BIDSleep ' + subject + ' · ' + person.sleep.toFixed(2) + ' h · baseline ' + person.baseline.toFixed(2) + ' h · ' + sleepDataset.url;
}
function sleepEvidence(person, allowLoad = true) {
  const nights=sleepNights(person);
  if (person.sleepSource !== 'bidsleep') return '<div class="sleep-evidence">' + (allowLoad ? '<button class="button btn secondary" data-action="measured">Reload BIDSleep</button>' : '') + '</div>';
  return '<div class="sleep-evidence"><strong>BIDSleep · '+escapeText(person.sleepSubject||'')+'</strong><details><summary>Source</summary><ul>' +
    nights.map(n => '<li><a href="' + n.sourceUrl + '" target="_blank" rel="noopener">' + escapeText(n.recordingStart) + '</a> · ' + n.sleepMinutes + ' min</li>').join('') +
    '</ul></details></div>';
}

function renderCrew() {
  document.getElementById('crew-grid').innerHTML = state.crew.map(c => `<button class="crew-card ${state.selected===c.id?'selected':''}" data-crew="${c.id}" aria-pressed="${state.selected===c.id}"><strong>${c.name}</strong><span class="crew-role">${c.role}</span><span class="crew-status ${c.state}">${statusLabel(c)}</span></button>`).join('');
  document.getElementById('overview-crew').innerHTML = state.crew.map(c => `<button class="crew-row" data-crew="${c.id}"><span><strong>${c.name}</strong><span class="crew-role">${c.role}</span></span><span class="crew-status ${c.state}">${statusLabel(c)}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`).join('');
}
function renderHealth() {
  const c=byId(state.selected);
  const delta=c.sleep-c.baseline;
  const chartMax=Math.max(9, ...c.history, c.baseline);
  const nights=sleepNights(c);
  const dates=c.sleepSource==='bidsleep'&&nights.length ? nights.map(n=>n.date.slice(5)) : c.history.map((_,i)=>`N${i+1}`);
  document.getElementById('health-panel').innerHTML=`
    <div class="panel-header"><div><h2>${c.name}</h2><p>${c.role}</p></div><span class="crew-status ${c.state}">${statusLabel(c)}</span></div>
    <div class="detail-main">
      <div class="health-metrics"><div><span>Latest sleep</span><strong>${c.sleep.toFixed(2)} <small>hours</small></strong></div><div><span>Personal reference</span><strong>${c.baseline.toFixed(2)} <small>hours</small></strong></div><div><span>Fatigue</span><strong>${c.fatigue} <small>/ 10</small></strong></div></div>
      <figure class="sleep-figure" aria-label="Sleep recordings in hours: ${c.history.map(v=>v.toFixed(2)).join(', ')}. Reference ${c.baseline.toFixed(2)} hours.">
        <div class="chart-title"><h3>Sleep history</h3><span>${Math.abs(delta).toFixed(2)} h ${delta<0?'below':'above'} reference</span></div>
        <div class="chart-area"><div class="baseline" style="bottom:${c.baseline/chartMax*100}%"></div>${c.history.map(v=>`<div class="chart-column"><div class="chart-bar" style="height:${v/chartMax*100}%"><span>${v.toFixed(1)}</span></div></div>`).join('')}</div>
        <div class="chart-days">${dates.map(d=>`<span>${d}</span>`).join('')}</div>
      </figure>
      ${sleepEvidence(c)}
      ${flagPanelHtml(c)}
      <div class="report-heading"><h3>Qualifications</h3><button class="text-link" data-action="skills" type="button">Edit skills</button></div>
      ${skillsHtml(c)}
      <div class="report-heading"><h3>Latest check-in</h3><span>${escapeText(c.time)} UTC</span></div>
      <blockquote class="quote">“${escapeText(c.note)}”</blockquote>
      <div class="health-actions"><button class="button btn secondary" data-action="checkin">Update check-in</button><button class="button btn primary" data-action="status">${c.state==='down'?'Return to duty':(c.flag||evaluateFatigueFlag(c)).recommendStandDown?'Confirm flag':'Review duty'}</button></div>
    </div>`;
}
function inspectionStatus(){
  if(state.inspectionDeferred) return 'Deferred';
  const assignee=byId(state.assigned);
  if(commanderBlockedReason()||assignee?.state==='down'||missingSkills(assignee,coolingRequirements()).length||(state.assigned==='alvarez'&&state.alvarezUnavailable)) return 'Coverage gap';
  if(assignee?.state==='review'||byId('ibarra').state==='review') return 'Health review';
  return 'Scheduled';
}
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
  refreshCrewFlags();
  const needs=state.crew.filter(c=>c.state==='review');
  const flagged=needs.filter(c=>(c.flag||evaluateFatigueFlag(c)).recommendStandDown);
  const gaps=tasks().filter(t=>t.status==='Coverage gap');
  document.getElementById('alert-banner').classList.toggle('resolved',!needs.length&&!gaps.length);
  document.getElementById('alert-title').textContent=gaps.length?'Coverage gap':flagged.length?'Stand-down flag':needs.length?'Needs review':'Clear';
  document.getElementById('alert-description').textContent=gaps.length?'Reassign qualified coverage.':flagged.length?flagged.map(c=>c.name).join(', ')+' — confirm.':needs.length?needs.map(c=>c.name).join(', ')+' — review.':'Mission plan ready.';
  document.getElementById('review-checkin').textContent=gaps.length?'Review coverage':flagged.length?'Confirm flag':needs.length?'Review':'Earth packet';
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
function openCheckin(){const c=byId(state.selected);showDialog('Update check-in','CREW HEALTH / SELF-REPORT',`<p>Record how you slept and how you feel before your next task.</p><form id="checkin-form"><label class="field"><span>Crew member</span><select name="crew">${state.crew.map(p=>`<option value="${p.id}" ${p.id===c.id?'selected':''}>${p.name} — ${p.role}</option>`).join('')}</select></label><div class="field-row"><label class="field"><span>Last night’s sleep (hours)</span><input name="sleep" type="number" min="0" max="24" step="0.1" value="${c.sleep.toFixed(1)}" required></label><label class="field"><span>Fatigue <output id="fatigue-output">${c.fatigue}</output> / 10</span><input name="fatigue" type="range" min="0" max="10" value="${c.fatigue}"><small>0 · None &nbsp; 10 · Extreme</small></label></div><label class="field"><span>How are you feeling?</span><textarea name="note" maxlength="300" required>${escapeText(c.note)}</textarea></label><div class="dialog-actions"><button type="button" class="button btn secondary" data-close>Cancel</button><button class="button btn primary" type="submit">Save check-in →</button></div></form>`);const form=document.getElementById('checkin-form');form.elements.fatigue.addEventListener('input',()=>document.getElementById('fatigue-output').textContent=form.elements.fatigue.value);form.elements.crew.addEventListener('change',()=>{const person=byId(form.elements.crew.value);form.elements.sleep.value=person.sleep.toFixed(1);form.elements.fatigue.value=person.fatigue;form.elements.note.value=person.note;document.getElementById('fatigue-output').textContent=person.fatigue;});form.addEventListener('submit',event=>{event.preventDefault();const person=byId(form.elements.crew.value);const enteredSleep=Number(form.elements.sleep.value);const sleepChanged=enteredSleep!==Number(person.sleep.toFixed(1));if(sleepChanged)person.sleep=enteredSleep;person.fatigue=Number(form.elements.fatigue.value);person.note=form.elements.note.value.trim();person.time=clock();if(sleepChanged){person.history[person.history.length-1]=person.sleep;person.sleepSource='manual';}person.reportEdited=true;const flag=applyFatigueFlag(person,{queueReview:true});if(person.state!=='down'&&!flag.recommendStandDown)person.state='review';state.selected=person.id;const reviewer=dutyReviewer(person);addLog(`${person.name} check-in`,`${person.sleep} h · fatigue ${person.fatigue}/10 · flag ${flag.level} (${flag.score}) · ${reviewer.name}`);closeDialog();render();toast(flag.recommendStandDown?'Flagged — confirm.':'Check-in saved.');});}
function openDuty(){
  const c=byId(state.selected);
  const reviewer=dutyReviewer(c);
  const flag=applyFatigueFlag(c);
  const primaryDown=flag.recommendStandDown;
  showDialog(
    primaryDown?'Confirm flag':'Duty status',
    dutyReviewerLabel(c),
    `<p>Reviewer: <strong>${reviewer.name}</strong>${c.id==='okonkwo'?' (Commander)':''}</p>
    <div class="review-summary"><div><span>Last night</span><b>${c.sleep.toFixed(2)} h</b></div><div><span>Usual sleep</span><b>${c.baseline.toFixed(2)} h</b></div><div><span>Fatigue</span><b>${c.fatigue}/10</b></div></div>
    ${flagPanelHtml(c)}
    ${sleepEvidence(c, false)}
    <blockquote class="quote">“${escapeText(c.note)}”</blockquote>
    <div class="dialog-actions">
      <button class="button btn secondary" id="confirm-available">${primaryDown?'Keep available':'Available'}</button>
      <button class="button btn ${primaryDown?'danger':'primary'}" id="confirm-down" ${c.state==='down'?'disabled':''}>Stand down →</button>
    </div>`
  );
  document.getElementById('confirm-available').onclick=()=>{
    c.state='available';
    addLog(`${c.name} available`,`${reviewer.name}${flag.recommendStandDown?` · overrode flag ${flag.score}`:''}`);
    closeDialog();
    render();
    toast(`${c.name} available.`);
  };
  document.getElementById('confirm-down').onclick=()=>{
    c.state='down';
    addLog(`${c.name} stood down`,`${reviewer.name}${flag.recommendStandDown?` · confirmed flag ${flag.score}`:''}`);
    render();
    openCoverage();
  };
}
function coolingRequirements(){return normalizeSkills(state.requirements?.coolingLoop?.length?state.requirements.coolingLoop:DEFAULT_REQUIREMENTS.coolingLoop);}
function commanderRequirements(){return normalizeSkills(state.requirements?.commander?.length?state.requirements.commander:DEFAULT_REQUIREMENTS.commander);}
function commanderBlockedReason(){
  const commander=byId('ibarra');
  if(commander.state==='down') return 'EVA commander stood down';
  if(commander.state==='review') return 'EVA commander health review pending';
  if(commander.state!=='available') return 'EVA commander unavailable';
  const missing=missingSkills(commander,commanderRequirements());
  if(missing.length) return `Commander missing ${missing.join(', ')}`;
  return '';
}
function candidateReason(c){
  if(c.id==='alvarez' && state.alvarezUnavailable) return 'Unavailable for the inspection window';
  if(c.state==='down') return 'Confirmed stand-down';
  if(c.state==='review') return 'Health review pending';
  const missing=missingSkills(c,coolingRequirements());
  if(missing.length) return `${missing.join(', ')} qualification required`;
  return '';
}
function openQualifications(personId=state.selected){
  const selected=byId(personId)||byId(state.selected);
  const cooling=coolingRequirements();
  const command=commanderRequirements();
  const skillChoices=skillOptionsFor(selected);
  showDialog(
    'Edit qualifications',
    'CREW SKILLS / MISSION REQUIREMENTS',
    `<p>Skills are editable and drive cooling-loop coverage eligibility. Changes save on this device.</p>
    <form id="skills-form">
      <label class="field"><span>Crew member</span>
        <select name="crew">${state.crew.map(p=>`<option value="${p.id}" ${p.id===selected.id?'selected':''}>${escapeText(p.name)} — ${escapeText(p.role)}</option>`).join('')}</select>
      </label>
      <fieldset class="skill-fieldset">
        <legend>Skills for <span id="skills-crew-label">${escapeText(selected.name)}</span></legend>
        <div class="skill-checks" id="skills-checkboxes">
          ${skillChoices.map(skill=>`<label class="skill-check"><input type="checkbox" name="skill" value="${escapeText(skill)}" ${hasSkill(selected,skill)?'checked':''}> ${escapeText(skill)}</label>`).join('')}
        </div>
        <label class="field add-skill-field"><span>Add a custom skill</span>
          <div class="add-skill-row"><input name="customSkill" type="text" maxlength="40" placeholder="e.g. Power systems" autocomplete="off"><button type="button" class="button btn secondary" id="add-skill">Add</button></div>
        </label>
      </fieldset>
      <fieldset class="skill-fieldset">
        <legend>Cooling loop inspection requires</legend>
        <div class="skill-checks">
          ${[...new Set([...SKILL_CATALOG,...cooling,...command])].map(skill=>`
            <label class="skill-check"><input type="checkbox" name="reqCooling" value="${escapeText(skill)}" ${cooling.includes(skill)?'checked':''}> Specialist: ${escapeText(skill)}</label>
            <label class="skill-check"><input type="checkbox" name="reqCommander" value="${escapeText(skill)}" ${command.includes(skill)?'checked':''}> Commander: ${escapeText(skill)}</label>
          `).join('')}
        </div>
      </fieldset>
      <div class="dialog-actions">
        <button type="button" class="button btn secondary" data-close>Cancel</button>
        <button type="submit" class="button btn primary">Save qualifications →</button>
      </div>
    </form>`
  );
  const form=document.getElementById('skills-form');
  const boxes=document.getElementById('skills-checkboxes');
  const label=document.getElementById('skills-crew-label');
  const refreshCrewBoxes=()=>{
    const person=byId(form.elements.crew.value);
    label.textContent=person.name;
    const options=skillOptionsFor(person);
    boxes.innerHTML=options.map(skill=>`<label class="skill-check"><input type="checkbox" name="skill" value="${escapeText(skill)}" ${hasSkill(person,skill)?'checked':''}> ${escapeText(skill)}</label>`).join('');
  };
  form.elements.crew.addEventListener('change',refreshCrewBoxes);
  document.getElementById('add-skill').onclick=()=>{
    const value=String(form.elements.customSkill.value||'').trim();
    if(!value) return;
    const existing=[...boxes.querySelectorAll('input[name=skill]')].find(input=>input.value===value);
    if(existing){
      existing.checked=true;
    }else{
      boxes.insertAdjacentHTML('beforeend',`<label class="skill-check"><input type="checkbox" name="skill" value="${escapeText(value)}" checked> ${escapeText(value)}</label>`);
    }
    form.elements.customSkill.value='';
  };
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const person=byId(form.elements.crew.value);
    const nextSkills=normalizeSkills([...form.querySelectorAll('input[name=skill]:checked')].map(input=>input.value));
    const nextCooling=normalizeSkills([...form.querySelectorAll('input[name=reqCooling]:checked')].map(input=>input.value));
    const nextCommander=normalizeSkills([...form.querySelectorAll('input[name=reqCommander]:checked')].map(input=>input.value));
    person.skills=nextSkills;
    state.requirements={
      coolingLoop:nextCooling.length?nextCooling:DEFAULT_REQUIREMENTS.coolingLoop.slice(),
      commander:nextCommander.length?nextCommander:DEFAULT_REQUIREMENTS.commander.slice()
    };
    state.selected=person.id;
    addLog(
      `${person.name} qualifications updated`,
      `${person.skills.join(' · ')||'No skills'} · loop needs ${state.requirements.coolingLoop.join(', ')} · commander needs ${state.requirements.commander.join(', ')}`
    );
    closeDialog();
    render();
    toast('Qualifications saved.');
  });
}
function openCoverage(){
  const commanderBlock=commanderBlockedReason();
  const coolingNeed=coolingRequirements().join(', ')||'Cooling systems';
  const commanderNeed=commanderRequirements().join(', ')||'EVA command';
  const eligible=state.crew.filter(c=>!candidateReason(c));
  const options=state.crew.filter(c=>c.id!=='ibarra');
  const selected=eligible.find(c=>c.id===state.assigned)||eligible[0];
  showDialog(
    'Review coverage',
    'MISSION PLAN / COOLING LOOP INSPECTION',
    `<p>09:30–11:00 UTC · Requires <strong>${escapeText(coolingNeed)}</strong> plus a commander with <strong>${escapeText(commanderNeed)}</strong>. Skills are editable under Crew health.</p>
    ${commanderBlock?`<div class="plan-notice">${escapeText(commanderBlock)}. The inspection must be deferred until qualified coverage is available.</div>`:''}
    <div class="coverage-tools"><button type="button" class="button btn secondary" id="edit-skills-from-coverage">Edit qualifications</button></div>
    <label class="availability-control"><input id="alvarez-available" type="checkbox" ${state.alvarezUnavailable?'':'checked'}> Kaung Htet available for this inspection <small>Scenario control · duty clearance is checked separately</small></label>
    <form id="coverage-form">
      ${options.map(c=>{
        const reason=commanderBlock||candidateReason(c);
        const skills=normalizeSkills(c.skills).join(' · ')||'No qualifications';
        return `<label class="choice"><input type="radio" name="replacement" value="${c.id}" ${reason?'disabled':c.id===selected?.id?'checked':''}><strong>${escapeText(c.name)} · ${escapeText(c.role)}</strong><p>${escapeText(skills)}</p>${reason?`<em>${escapeText(reason)}</em>`:c.id==='alvarez'?'<em>Moves plant growth experiment from 10:00 to 13:00 to avoid overlap.</em>':'<p>Available for the full inspection window.</p>'}</label>`;
      }).join('')}
      <label class="choice"><input type="radio" name="replacement" value="defer" ${commanderBlock||!eligible.length?'checked':''}><strong>Defer the inspection</strong><p>Hold the task for crew review. Record the coverage gap in the Earth packet.</p></label>
      <div class="dialog-actions"><button type="button" class="button btn secondary" data-close>Cancel</button><button type="submit" class="button btn primary">Confirm plan →</button></div>
    </form>`
  );
  document.getElementById('edit-skills-from-coverage').onclick=()=>openQualifications(state.assigned);
  document.getElementById('alvarez-available').onchange=event=>{
    state.alvarezUnavailable = !event.target.checked;
    addLog('Inspection availability changed', 'Kaung Htet ' + (state.alvarezUnavailable ? 'unavailable' : 'available') + ' for the inspection window. Plan awaits confirmation.');
    render();
    openCoverage();
  };
  document.getElementById('coverage-form').onsubmit=event=>{
    event.preventDefault();
    const choice=new FormData(event.target).get('replacement');
    if(!choice) return;
    if(choice!=='defer'&&(candidateReason(byId(choice))||commanderBlockedReason())) return openCoverage();
    state.inspectionDeferred=choice==='defer';
    if(choice!=='defer') state.assigned=choice;
    state.version++;
    const description=choice==='defer'
      ?'Cooling loop inspection deferred. Crew review required before rescheduling.'
      :`${byId(choice).name} assigned with Aung Min.${choice==='alvarez'?' Plant growth experiment moved to 13:00 to avoid overlap.':''}`;
    addLog(`Mission plan v${state.version} confirmed`,description);
    render();
    showDialog(
      'Plan updated.',
      'CONFIRMED BY MAY THAZIN',
      `<p>${escapeText(description)}</p><div class="plan-notice">${state.crew.filter(c=>c.state==='down').map(c=>c.name).join(', ')||'No crew'} ${state.crew.some(c=>c.state==='down')?'currently stood down. Review return to duty when appropriate.':'currently stood down.'}</div><div class="dialog-actions"><button class="button btn secondary" data-close>Back to overview</button><button class="button btn primary" id="show-packet">Review Earth packet →</button></div>`
    );
    document.getElementById('show-packet').onclick=openPacket;
  };
}
function packetText(){
  refreshCrewFlags();
  const flags=state.crew.map(c=>{
    const f=c.flag||evaluateFatigueFlag(c);
    return `${c.name}: ${f.level} ${f.score} · ${statusLabel(c)}`;
  });
  return ['CREW SWAP / ARES / SOL 187',`MISSION PLAN VERSION ${state.version}`,'',sleepEvidenceText(byId('chen')),'','Flags:',...flags,'', ...tasks().map(t=>`${t.time} UTC | ${t.title} | ${t.status}\nCrew: ${t.crew.map(id=>byId(id).name).join(', ')||'Unassigned'}`),'','Latest:',state.log[0]?.detail||'None.','','One-way light time: 20 min. Transmission pending.'].join('\n');
}
function download(name,content,type='text/plain'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function openPacket(){showDialog('Earth handoff','ONBOARD DECISION / READY TO REVIEW',`<p>The packet reflects current duty status and the latest mission plan.</p><pre class="packet">${escapeText(packetText())}</pre><div class="dialog-actions"><button class="button btn secondary" data-close>Close</button><button class="button btn primary" id="download-packet">Download packet ↓</button></div>`);document.getElementById('download-packet').onclick=()=>{download('crew-swap-earth-packet.txt',packetText());toast('Earth packet downloaded.');};}
function openSources(){showDialog('Data & references','PROTOTYPE',`<p>All crew sleep: PhysioNet BIDSleep (Earth volunteers). Names/roles fictional.</p><div class="source-item"><strong>Auto-flag</strong><p>BIDSleep nights + &lt;6 h / 3+ night rules (NASA RST sleep-restriction). ≥4 stand-down. Human confirms.</p></div><div class="source-item"><strong>Crew ↔ subject</strong><p>Aung Min · Bidslab01 · Thiri Htet · Bidslab00 · Kaung Htet · Bidslab02 · May Thazin · Bidslab06</p></div><div class="source-item"><a href="https://www.nasa.gov/news-release/nasa-coverage-of-rescheduled-spacewalk-preparing-for-new-solar-array/" target="_blank" rel="noopener">NASA · crew reassignment ↗</a></div><div class="source-item"><a href="https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20140016946.pdf" target="_blank" rel="noopener">NASA · ISS fatigue ↗</a></div><div class="source-item"><strong>BIDSleep</strong><p>${escapeText(sleepDataset.citation)}</p><a href="${sleepDataset.url}" target="_blank" rel="noopener">Dataset ↗</a> · <a href="data/sleep.json" download>Download</a></div><div class="dialog-actions"><button class="button btn primary" data-close>Close</button></div>`);}
document.querySelector('nav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button)setView(button.dataset.view);});
document.querySelector('.brand').onclick=event=>{event.preventDefault();setView('overview');};
document.getElementById('crew-grid').onclick=event=>{const card=event.target.closest('[data-crew]');if(card){state.selected=card.dataset.crew;render();}};
document.getElementById('health-panel').onclick=event=>{const button=event.target.closest('[data-action]');if(button?.dataset.action==='checkin')openCheckin();if(button?.dataset.action==='status')openDuty();if(button?.dataset.action==='skills')openQualifications(state.selected);if(button?.dataset.action==='measured'){const person=byId(state.selected);person.reportEdited=false;loadMeasuredSleep(person);const flag=applyFatigueFlag(person,{queueReview:true});addLog('BIDSleep reloaded',`${person.sleepSubject} · flag ${flag.level} ${flag.score}`);render();}};
document.getElementById('new-checkin').onclick=openCheckin;
document.getElementById('review-checkin').onclick=()=>{if(tasks().some(t=>t.status==='Coverage gap'))return openCoverage();const flagged=state.crew.find(p=>p.state==='review'&&(p.flag||evaluateFatigueFlag(p)).recommendStandDown);const c=flagged||state.crew.find(p=>p.state==='review');if(c){state.selected=c.id;render();openDuty();}else openPacket();};
document.getElementById('review-options').onclick=openCoverage;
document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>setView(button.dataset.go));
document.getElementById('overview-crew').onclick=event=>{const row=event.target.closest('[data-crew]');if(row){state.selected=row.dataset.crew;render();setView('health');}};
document.getElementById('earth-packet').onclick=openPacket;
document.getElementById('sources-button').onclick=openSources;
document.getElementById('export-log').onclick=()=>{download('crew-swap-decision-log.json',JSON.stringify(state.log,null,2),'application/json');toast('Decision log downloaded.');};
document.getElementById('reset-button').onclick=()=>{showDialog('Restart the preview?','SAMPLE MISSION',`<p>This restores the four sample crew records and clears locally saved decisions.</p><div class="dialog-actions"><button class="button btn secondary" data-close>Keep current plan</button><button class="button btn danger" id="confirm-reset">Reset preview</button></div>`);document.getElementById('confirm-reset').onclick=()=>{state=freshState();render();setView('overview');closeDialog();toast('Preview restored.');};};
dialog.addEventListener('click',event=>{if(event.target.closest('[data-close]'))closeDialog();if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
refreshCrewFlags(); // recompute scores; do not re-queue after a human override
render();
setView(location.hash.slice(1));
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));

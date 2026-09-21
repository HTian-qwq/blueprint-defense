// Historical combat/balance fixture: isolates unchanged attack, voice, facing and wave timing contracts.
// Current research, costs, magazines and campaign are covered by economy*.test.cjs.
const {unitCombatData}=require('./helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Game}=require('../src/engine.js');
const data=require('./fixtures/v11_balance.json');
const profiles=require('../assets/audio/profiles.json');
const manifest=require('../assets/audio/manifest.json');
const provenance=require('../sources/audio_provenance.json');
const buildTable=require('../sources/audio/tables/AudioBattleBuildings.json');
const trace=require('../sources/audio/event_trace.json');
const checks=[];
function test(name,fn){fn();checks.push(name);}
function setup(type){const g=new Game(unitCombatData(data));g.dp=99;const t=g.deploy(type,1,4).tower;g.spawn(0,1000);g.drainAudioEvents();return {g,t,e:g.enemies[0]};}

test('all 14 original forms use verified tower events; shared deployment cues agree with the current game table',()=>{
  const forms=new Map(data.towers.flatMap(t=>[t,...t.upgrades].filter(s=>!s.easterEgg).map(s=>[s.id,s])));
  assert.equal(forms.size,14);assert.equal(Object.keys(profiles).length,14);
  for(const [id,form] of forms){
    assert.deepEqual(form.audio,profiles[id]);
    for(const key of Object.values(form.audio))assert(manifest[key]?.length);
    const deploy=provenance.clips.find(c=>c.key===form.audio.deploy);
    assert.equal(deploy.eventId,buildTable[id].audioBuildUp>>>0);
  }
  for(const clip of provenance.clips){
    assert(clip.event.startsWith(clip.key.startsWith('rodin.')?'au_eny_0051_rodin_':'au_int_fac_battle_'));
    const event=trace.events.find(e=>e.event===clip.event);assert(event);
    assert.equal(clip.eventId,event.eventId);
    for(const media of clip.mediaIds)assert(event.sounds.some(s=>s.mediaId===media));
  }
  for(const name of ['au_int_fac_battle_trap1_blast_start','au_int_fac_battle_trap1_blast_end','au_int_fac_battle_turret_3_skill_hit_bomb'])
    assert(trace.skillReferences.some(r=>r.event===name&&r.source?.startsWith('current')));
});
test('a projectile launched before a refit retains its old hit audio; subsequent attacks use the new form',()=>{
  const {g,t,e}=setup(0);g.fire(t,g.stats(t),e);assert(g.upgrade(t.id));g.drainAudioEvents();
  g.updateProjectiles(.5);const old=g.drainAudioEvents().map(a=>a.key);
  assert.equal(old.filter(k=>k==='turret.hit').length,2);assert(old.every(k=>k.startsWith('turret.')));
  g.fire(t,g.stats(t),e);g.updateProjectiles(.5);const next=g.drainAudioEvents().map(a=>a.key);
  assert.equal(next.filter(k=>k==='turret2.fire').length,4);assert.equal(next.filter(k=>k==='turret2.hit').length,4);
  g.dp=99;assert(g.upgrade(t.id));g.drainAudioEvents();
  g.fire(t,g.stats(t),e);g.updateProjectiles(.6);
  const cues=g.drainAudioEvents().map(a=>a.key);
  assert.equal(cues.filter(k=>k==='turret3.hit').length,5);
  assert.equal(cues.filter(k=>k==='turret3.hitBomb').length,1);
  assert.equal(cues.filter(k=>k==='turret3.fire').length,3);
});
test('beam and electric refits keep charge, fire and impact in order, including a mid-charge upgrade',()=>{
  for(const type of [3,4]){
    const {g,t,e}=setup(type),base=g.stats(t).audio;
    g.fire(t,g.stats(t),e);assert.deepEqual(g.drainAudioEvents().map(a=>a.key),[base.charge]);
    assert(g.upgrade(t.id));g.drainAudioEvents();g.updateProjectiles(.6);
    assert.deepEqual(g.drainAudioEvents().map(a=>a.key),[base.fire,base.hit]);
    const refit=g.stats(t).audio;g.fire(t,g.stats(t),e);g.updateProjectiles(.6);
    assert.deepEqual(g.drainAudioEvents().map(a=>a.key),[refit.charge,refit.fire,refit.hit]);
  }
});
test('flame stop follows its own zone lifetime and survives owner withdrawal without repeating the ending',()=>{
  const {g,t,e}=setup(7);g.fire(t,g.stats(t),e);const start=g.drainAudioEvents()[0];
  assert.equal(start.key,'trap.fire');g.updateProjectiles(.2);g.withdraw(t.id);
  g.updateZones(2.95);assert.deepEqual(g.drainAudioEvents(),[]);
  g.updateZones(.05);const end=g.drainAudioEvents();assert.equal(end.length,1);
  assert.equal(end[0].key,'trap.end');assert.equal(end[0].stopVoiceId,start.voiceId);
  g.updateZones(1);assert.deepEqual(g.drainAudioEvents(),[]);
});
test('cannon and acid have verified launch audio and never dispatch a substituted impact',()=>{
  for(const type of [1,6]){
    const {g,t,e}=setup(type);g.fire(t,g.stats(t),e);g.updateProjectiles(.6);
    assert.deepEqual(g.drainAudioEvents().map(a=>a.key),[g.stats(t).audio.fire]);
  }
  for(const key of ['cannon.hit','debuff.hit','trap.hit'])assert(!manifest[key]);
});
fs.writeFileSync(path.join(__dirname,'../reports/audio_mapping_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));
console.log(JSON.stringify({passed:checks.length,checks},null,2));

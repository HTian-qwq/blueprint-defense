const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),checks=[];
async function test(name,fn){await fn();checks.push(name);}
class FakeAudio{
 constructor(){this.paused=true;this.currentTime=0;this.volume=1;this.playbackRate=1;this.calls=0;this.events={};this.jobs=[];}
 addEventListener(key,fn){this.events[key]=fn;}
 play(){this.calls++;this.paused=false;return new Promise((resolve,reject)=>this.jobs.push({resolve,reject:error=>{this.paused=true;reject(error);}}));}
 pause(){this.paused=true;}
 load(){this.loads=(this.loads||0)+1;}
}
const prefs=new Map(),ctx={Audio:FakeAudio,document:{hidden:false},localStorage:{getItem:k=>prefs.get(k),setItem:(k,v)=>prefs.set(k,v)}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/music.js'),'utf8'),ctx);
const tracks=[{id:'battle-1',src:'one.mp3'},{id:'battle-2',src:'two.mp3'}],Player=ctx.BlueprintMusic;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await test('retained WEMs and MP3s match verified combat-state single-track loop evidence',()=>{
  const p=require('../sources/music_provenance.json'),m=require('../assets/music/manifest.json');assert.equal(m.tracks.length,2);
  for(const rec of p.tracks){
   const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');assert.equal(hash(rec.file),rec.mp3Sha256);assert.equal(hash(`sources/music/${rec.media.mediaId}.wem`),rec.wemSha256);
   const sw=Buffer.from(rec.objects.find(o=>o.id===rec.switch).dataHex,'hex');assert.equal(sw.readUInt32LE(rec.conditionOffset),p.stateValue);assert.equal(sw.readUInt32LE(rec.conditionOffset+4),rec.playlist);
   assert.equal(rec.tracks.length,1);assert.deepEqual(rec.tracks[0].timing.slice(0,3),[0,0,0]);assert(rec.duration>90&&rec.duration<180);
  }
 });
 await test('no eager load before battle/gesture; paused music retains position and only one play can be pending',async()=>{
  const p=new Player(tracks);p.sync('battle-1',false);assert.equal(p.audio.src,undefined);p.sync('battle-1',true);assert.equal(p.audio.calls,0);p.gesture();p.sync('battle-1',true);assert.equal(p.audio.calls,1);
  p.audio.jobs[0].resolve();await settle();assert.equal(p.state,'playing');p.audio.currentTime=19;p.sync('battle-1',false);assert(p.audio.paused);assert.equal(p.audio.currentTime,19);
  p.sync('battle-1',true);assert.equal(p.audio.calls,2);assert.equal(p.audio.currentTime,19);assert.equal(p.audio.loop,true);
 });
 await test('late play callbacks after pausing or switching cannot restart a stale track',async()=>{
  const p=new Player(tracks);p.gesture();p.sync('battle-1',true);const old=p.audio.jobs[0];p.sync('battle-1',false);old.resolve();await settle();assert(p.audio.paused);assert.notEqual(p.state,'playing');
  p.sync('battle-2',true);p.audio.jobs[1].resolve();await settle();assert.equal(p.track.id,'battle-2');assert.equal(p.audio.src,'two.mp3');assert.equal(p.state,'playing');
 });
 await test('separate preferences, preparation attenuation and normal playback rate survive toggles',async()=>{
  const p=new Player(tracks);p.gesture();p.sync('battle-1',true);p.audio.jobs[0].resolve();await settle();p.setVolume(.4);p.sync('battle-1',true,true);assert.equal(p.audio.volume,.2);assert.equal(p.audio.playbackRate,1);
  p.setEnabled(false);assert(p.audio.paused);p.setSelection('battle-2');const restored=new Player(tracks);assert.equal(restored.volume,.4);assert.equal(restored.enabled,false);assert.equal(restored.selection,'battle-2');p.reset();assert.equal(p.audio.currentTime,0);
 });
 await test('network and autoplay failures stay quiet until explicit recovery',async()=>{
  prefs.clear();const p=new Player(tracks);p.gesture();p.sync('battle-1',true);p.audio.jobs[0].reject(Object.assign(Error('blocked'),{name:'NotAllowedError'}));await settle();assert.equal(p.state,'blocked');p.sync('battle-1',true);assert.equal(p.audio.calls,1);
  p.gesture();p.audio.jobs[1].reject(Error('network'));await settle();assert.equal(p.failed,true);p.sync('battle-1',true);assert.equal(p.audio.calls,2);
  p.retry();assert.equal(p.audio.calls,3);p.audio.jobs[2].resolve();await settle();assert.equal(p.state,'playing');
 });
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

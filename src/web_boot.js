/* A small entry point remains usable while the game resources are loading. */
(async function(){
  const options=__WEB_OPTIONS__;
  const screen=document.getElementById('loadingScreen'),label=document.getElementById('loadingLabel'),progress=document.getElementById('loadingProgress'),count=document.getElementById('loadingCount');
  screen.hidden=false;
  const report=(value,message)=>{progress.value=value;count.textContent=Math.round(value)+'%';label.textContent=message;};
  window.BlueprintBoot={reportImages(done,total){report(40+55*done/total,`准备设备图像 ${done} / ${total}`);}};
  window.BlueprintBuild={web:true,version:options.version,rulesId:options.rulesId};
  try{
    report(5,'正在读取演练配置…');
    const read=async path=>{const response=await fetch(path);if(!response.ok)throw Error(`资源请求失败（${response.status}），请重试`);return response.json();};
    [window.BlueprintPayload,window.BlueprintSounds]=await Promise.all([read(options.data),read(options.sounds)]);
    report(25,'正在载入演练界面…');
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=options.script;script.onload=resolve;script.onerror=()=>reject(Error('演练程序加载失败，请检查网络后重试'));document.body.append(script);});
    if(!window.BlueprintDefense)throw Error('演练程序未能启动，请重试');
    await window.BlueprintDefense.ready;
    await window.BlueprintDefense.session.ready;
    report(100,'准备完成');screen.hidden=true;
  }catch(error){label.textContent=error.message;document.getElementById('loadingRetry').hidden=false;count.textContent='';}
})();

(function(root){
  'use strict';
  class LocalStore{
    constructor(){this.database=null;this.tail=Promise.resolve();this.error='';}
    open(){
      if(!this.database)this.database=new Promise((resolve,reject)=>{
        const request=indexedDB.open('blueprint-defense',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('slots');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('请关闭其他旧版游戏标签后重试'));
      }).catch(error=>{this.database=null;throw error;});
      return this.database;
    }
    async operation(key,value){
      const db=await this.open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('slots',value===undefined?'readonly':'readwrite'),store=tx.objectStore('slots');
        const request=value===undefined?store.get(key):store.put(value,key);let result;
        request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('存档写入中止'));
      });
    }
    emergency(key,value){
      try{localStorage.setItem('blueprint-defense-save-'+key,JSON.stringify(value));return true;}catch{return false;}
    }
    async read(key){
      let fallback=null,value=null,error=null;
      try{fallback=JSON.parse(localStorage.getItem('blueprint-defense-save-'+key)||'null');}catch{}
      try{value=await this.operation(key);}catch(e){error=e;}
      if(error&&!fallback)this.error='本地存储不可用，请使用导出存档备份';
      return !value||fallback?.savedAt>value.savedAt?fallback:value;
    }
    write(key,value){
      const fallback=this.emergency(key,value);
      const task=this.tail.catch(()=>{}).then(async()=>{
        try{await this.operation(key,value);this.error='';return true;}
        catch(error){this.error=fallback?'存档已保存在浏览器备用存储':'无法保存，请导出存档备份';if(!fallback)throw error;return true;}
      });this.tail=task;return task;
    }
  }
  root.BlueprintLocalStore=LocalStore;
})(globalThis);

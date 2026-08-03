// Generates tests/fixtures/widget-defaults.snapshot.json from the pre-factory media.js in git.
// Run once, by hand, when a catalog default legitimately changes. The permanent suite reads the
// snapshot and never touches git.
const fs=require('fs'),path=require('path'),vm=require('vm'),{execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..');
const {CONTRACT}=require(path.join(ROOT,'tests/fixtures/catalog-variants.js'));
const rev=process.argv[2]||'feature/event-deduplication:media.js';
const source=execFileSync('git',['show',rev],{cwd:ROOT,encoding:'utf8',maxBuffer:32*1024*1024});
function literalContaining(marker){
  let from=0;
  for(;;){
    const at=source.indexOf('state.widgets.push({',from);
    if(at===-1)throw new Error('hittade ingen literal för '+marker);
    const open=source.indexOf('{',at);
    let d=0,i=open;
    for(;i<source.length;i++){if(source[i]==='{')d++;else if(source[i]==='}'){d--;if(!d)break}}
    const lit=source.slice(open,i+1);
    if(lit.includes(marker))return lit;
    from=i;
  }
}
const out={};
for(const row of CONTRACT){
  const sandbox=Object.assign({Math,Number,String,Object,Array,JSON,Date},row.bindings);
  const obj=vm.runInNewContext('('+literalContaining(row.marker)+')',sandbox);
  delete obj.id;
  out[row.key]=obj;
}
const target=path.join(ROOT,'tests/fixtures/widget-defaults.snapshot.json');
fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n');
console.log('skrev '+Object.keys(out).length+' konfigurationer till '+target);

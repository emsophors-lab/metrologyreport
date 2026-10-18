/** Fill the consolidated report template with a ready data object (all values already computed). */
const fs=require('fs'), PizZip=require('pizzip'), Docxtemplater=require('docxtemplater');
function renderConsolidated(templateBuf, data){
  const doc=new Docxtemplater(new PizZip(templateBuf),{paragraphLoop:true,linebreaks:true,nullGetter:()=>''});
  doc.render(data); return doc.getZip().generate({type:'nodebuffer',compression:'DEFLATE'});
}
function listTags(buf){
  const zip=new PizZip(buf); const xml=zip.file('word/document.xml').asText().replace(/<[^>]+>/g,'');
  return [...new Set([...xml.matchAll(/\{([#^/]?)([a-z0-9_]+)\}/gi)].map(m=>m[1]+m[2]))];
}
module.exports={renderConsolidated,listTags};
if(require.main===module){
  const [tpl,json,out]=process.argv.slice(2); const buf=fs.readFileSync(tpl); const data=JSON.parse(fs.readFileSync(json,'utf8'));
  const loopKeys=new Set(Object.values(data).filter(Array.isArray).flatMap(a=>a.flatMap(o=>Object.keys(o))));
  const missing=listTags(buf).filter(t=>!/^[#^/]/.test(t)).filter(t=>!(t in data)&&!loopKeys.has(t));
  if(missing.length) console.warn('Tags with no data:',[...new Set(missing)]);
  fs.writeFileSync(out,renderConsolidated(buf,data)); console.log('Written',out);
}

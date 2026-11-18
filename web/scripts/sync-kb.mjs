import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const root=path.resolve(web,"..");
for(const script of ["validate.py","build.py"]){
  const result=spawnSync(process.env.PYTHON??"python",[path.join(root,"scripts",script)],{cwd:root,stdio:"inherit"});
  if(result.status!==0)process.exit(result.status??1);
}
const version=readFileSync(path.join(root,"kb.yaml"),"utf8").match(/^version:\s*(\S+)/m)?.[1];
if(!version)throw new Error("知识库缺少版本号");
const raw=readFileSync(path.join(root,"dist",`kb-${version}.json`),"utf8");
const kb=JSON.parse(raw),hash=createHash("sha256").update(raw).digest("hex");
mkdirSync(path.join(web,"generated"),{recursive:true});
writeFileSync(path.join(web,"generated","kb.json"),JSON.stringify({version:kb.version,hash,nodes:kb.nodes},null,2));
console.log(`Pinned ${Object.keys(kb.nodes).length} nodes, sha256 ${hash.slice(0,12)}`);

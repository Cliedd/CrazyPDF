import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('frontend/src');
const layers=['shared','entities','features','widgets','pages','app'];
let count=0;
function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.ts')){const rel=path.relative(root,file).split(path.sep),layer=rel[0];for(const match of fs.readFileSync(file,'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)){const spec=match[1];if(!spec.startsWith('.'))continue;const target=path.relative(root,path.resolve(path.dirname(file),spec)).split(path.sep);if(!layers.includes(layer)||!layers.includes(target[0]))continue;if(layers.indexOf(target[0])>layers.indexOf(layer))throw new Error(`${file} imports a higher layer: ${spec}`);if(layer===target[0]&&['features','entities','widgets','pages'].includes(layer)&&rel[1]!==target[1])throw new Error(`${file} crosses slices in the same layer: ${spec}`);count++}}}}
walk(root);console.log(`FSD boundaries verified (${count} imports).`);

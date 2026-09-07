import { ESLint } from 'eslint';
const eslint=new ESLint();
const cases=[
 ['apps/server/src/transport/map.ts',"import {pool} from '../../../../packages/db'; export const leaked=pool;"],
 ['apps/server/src/domain/events/types.ts',"import {pool} from '../../../../../packages/db'; export const leaked=pool;"],
 ['apps/server/src/domain/events/types.ts',"import {readFile} from 'node:fs'; export const leaked=readFile;"],
];
for (const [filePath,code] of cases) {
 const [result]=await eslint.lintText(code,{filePath});
 const violations=result.messages.filter(m=>m.severity===2);
 if(!violations.length)throw new Error('Layer boundary failed to reject forbidden import: '+filePath);
 console.log(JSON.stringify({filePath,rules:violations.map(m=>m.ruleId)}));
}


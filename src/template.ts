import { readFileSync, readdirSync, watch, existsSync } from 'fs';
import path from 'path';

import global from './global';
import { strSplice } from './utilities';


export const templates = new Map<string, string>();


export function watchTemplates() {
   watch(global.templateDir, { recursive: false }, (eventType, filename) => {
      if(filename) {
         if(!filename.endsWith('.html')) return;

         if(eventType == 'change'){
            const filePath = path.join(global.templateDir, filename);
            if(!existsSync(filePath)) {
               templates.delete(path.basename(filename));
               return;
            }

            loadTemplate(filename);
            return;
         }
      }

      loadTemplate();
   });
}


export function loadTemplate(templateFile?: string) {
   if(templateFile) {
      const filePath = path.join(global.templateDir, templateFile);
      if(existsSync(filePath)) {
         const templateName = templateFile.slice(0, templateFile.lastIndexOf('.'));;
         templates.set(templateName, readFileSync(filePath, 'utf-8'));
         console.log(`Template "${templateName}" loaded.`);
      }
      return;
   }

   for(const file of readdirSync(global.templateDir)) {
      if(!file.endsWith('.html')) continue;

      const filePath = path.join(global.templateDir, file);
      const templateName = file.slice(0, file.lastIndexOf('.'));;
      templates.set(templateName, readFileSync(filePath, 'utf-8'));
      console.log(`Template "${templateName}" loaded.`);
   }
}

export function resolveTemplate(templateName: string, data: Record<string, any>, ignoreUnsolvedVars = false) {
   let template = templates.get(templateName);
   if(!template)
      throw new Error(`Template ${templateName}.html is missing or not loaded!`);

   return resolve(template, data, ignoreUnsolvedVars);
}


export function resolve(
   template: string,
   data: Record<string, any>,
   ignoreUnsolvedVars: boolean | string[] = false,
   originalTemplate?: string,
   globalIndexOffset = 0
) {
   const templateBackup = originalTemplate ?? template;

   const matchedCommands = [...template.matchAll(/{{(.*?)}}/g)];
   let lastCtrlFlowRes: boolean[] = [];
   let blockStartIndexes: number[] = [];
   let blockStartLengths: number[] = [];
   let elseIfFallthrough = false;
   let forIterables: any[][] = [];
   let forVariables: string[] = [];
   let forFallthrough = false;
   let blockIndex = -1;
   let indexOffset = 0;

   for(const match of matchedCommands) {
      if(!match[1]) continue;
      let [cmd, ...args] = match[1].trim().split(/\s+/);

      if(cmd !== 'end' && forFallthrough) continue;

      if(cmd.startsWith('$')) {
         let value: string | undefined = data[cmd.slice(1)]?.toString();
         if(value === undefined) {
            if(ignoreUnsolvedVars === true) continue;
            if(Array.isArray(ignoreUnsolvedVars)&&ignoreUnsolvedVars.includes(cmd.slice(1))) continue;
            throw new Error(`Variable ${cmd.slice(1)} not found! at line ${getLineNumber(match.index)}`);
         }

         template = strSplice(template, match.index + indexOffset, match[0].length, value);
         indexOffset += value.length - match[0].length;
         continue;
      }

      switch(cmd) {
         case 'if': {
            blockIndex++;
            blockStartIndexes[blockIndex] = match.index + indexOffset;
            blockStartLengths[blockIndex] = match[0].length;

            if(args.length < 2)
               throw new Error(`Invalid if statement at line ${getLineNumber(match.index)}: ${match[0]}`);

            const predicate = makeIFPredicate(args, data);

            try {
               lastCtrlFlowRes[blockIndex] = predicate();
            }
            catch(error) {
               throw new Error(`Error in if statement at line ${getLineNumber(match.index)}: ${error}`);
            }
            break;
         }
         case 'else': {
            if(elseIfFallthrough) continue;

            const lastStartIndex = blockStartIndexes[blockIndex];
            const lastStartLength = blockStartLengths[blockIndex];
            blockStartLengths[blockIndex] = match[0].length;

            if(blockIndex < 0 || lastCtrlFlowRes[blockIndex] === undefined)
               throw new Error(`else statement without if at line ${getLineNumber(match.index)}`);
            if(args.length > 0)
               throw new Error(`Invalid else statement at line ${getLineNumber(match.index)}: ${match[0]}`);

            if(lastCtrlFlowRes[blockIndex]) { // above statement was true, keep it & remove current block
               template = strSplice(template, lastStartIndex, lastStartLength, '');
               indexOffset -= lastStartLength;
               lastCtrlFlowRes[blockIndex] = false;
            }
            else { // above statement was false, remove it & keep current block
               const delLength = match.index + indexOffset - lastStartIndex;
               template = strSplice(template, lastStartIndex, delLength, '');
               indexOffset -= delLength;
               lastCtrlFlowRes[blockIndex] = true;
            }
            blockStartIndexes[blockIndex] = match.index + indexOffset;
            break;
         }
         case 'elseif': {
            if(elseIfFallthrough) continue;

            const lastStartIndex = blockStartIndexes[blockIndex];
            const lastStartLength = blockStartLengths[blockIndex];
            blockStartLengths[blockIndex] = match[0].length;

            if(blockIndex < 0 || lastCtrlFlowRes[blockIndex] === undefined)
               throw new Error(`elseif statement without if at line ${getLineNumber(match.index)}`);
            if(args.length < 2)
               throw new Error(`Invalid elseif statement at line ${getLineNumber(match.index)}: ${match[0]}`);

            if(lastCtrlFlowRes[blockIndex]) { // above statement was true, keep it & remove current block
               template = strSplice(template, lastStartIndex, lastStartLength, '');
               indexOffset -= lastStartLength;
               elseIfFallthrough = true;
            }
            else { // above statement was false, remove it & keep current block
               const delLength = match.index + indexOffset - lastStartIndex;
               template = strSplice(template, lastStartIndex, delLength, '');
               indexOffset -= delLength;
            }
            blockStartIndexes[blockIndex] = match.index + indexOffset;

            const predicate = makeIFPredicate(args, data);

            try {
               lastCtrlFlowRes[blockIndex] = predicate();
            }
            catch(error) {
               throw new Error(`Error in elseif statement at line ${getLineNumber(match.index)}: ${error}`);
            }
            break;
         }
         case 'endif': {
            if(blockIndex < 0 || lastCtrlFlowRes[blockIndex] === undefined)
               throw new Error(`endif statement without if at line ${getLineNumber(match.index)}`);

            const lastStartIndex = blockStartIndexes[blockIndex];
            const lastStartLength = blockStartLengths[blockIndex];

            if(lastCtrlFlowRes[blockIndex]) { // above statement was true, keep it
               template = strSplice(template, lastStartIndex, lastStartLength, '');
               template = strSplice(template, match.index + indexOffset - lastStartLength, match[0].length, '');
               indexOffset -= lastStartLength + match[0].length;
            }
            else { // above statement was false, remove it
               const delLength = match.index + indexOffset - lastStartIndex + match[0].length;
               template = strSplice(template, lastStartIndex, delLength, '');
               indexOffset -= delLength;
            }

            blockStartIndexes.pop();
            blockStartLengths.pop();
            lastCtrlFlowRes.pop();
            elseIfFallthrough = false;
            blockIndex--;
            break;
         }
         case 'for': {
            blockIndex++;
            blockStartIndexes[blockIndex] = match.index + indexOffset;
            blockStartLengths[blockIndex] = match[0].length;

            if(args.length < 3)
               throw new Error(`Invalid for statement at line ${getLineNumber(match.index)}: ${match[0]}`);

            const [varName, operator, iterable] = args;
            let iterableValue: any; // should be an array, but we don't know the type... yet

            if(operator !== 'in')
               throw new Error(`Invalid operator in for statement at line ${getLineNumber(match.index)}: ${match[0]}`);

            if(iterable.startsWith('$')) iterableValue = data[iterable.slice(1)];
            else {
               try {
                  iterableValue = JSON.parse(iterable);
               }
               catch(error) {
                  throw new Error(`Invalid iterable in for statement at line ${getLineNumber(match.index)}: ${match[0]}`);
               }
            }

            if(!Array.isArray(iterableValue))
               throw new Error(`Iterable must be a type of Array, instead got ${typeof iterableValue} at line ${getLineNumber(match.index)}: ${match[0]}`);

            forIterables[blockIndex] = iterableValue;
            forVariables[blockIndex] = varName;

            if(iterableValue.length === 0){
               forFallthrough = true;
               continue;
            }

            ignoreUnsolvedVars = ignoreUnsolvedVars || (
               Array.isArray(ignoreUnsolvedVars)
                  ? ignoreUnsolvedVars.concat(varName)
                  : [varName]
            );
            break;
         }
         case 'end': {
            if(blockIndex < 0 || forVariables[blockIndex] === undefined)
               throw new Error(`end statement without for at line ${getLineNumber(match.index)}`);

            const lastStartIndex = blockStartIndexes[blockIndex];
            const lastStartLength = blockStartLengths[blockIndex];

            if(args.length > 0)
               throw new Error(`Invalid end statement at line ${getLineNumber(match.index)}: ${match[0]}`);

            const iterableValue = forIterables[blockIndex];
            const varName = forVariables[blockIndex];
            let blockTemplate = template.slice(lastStartIndex + lastStartLength, match.index + indexOffset);

            let resolvedBlock = '';
            for(const item of iterableValue) {
               resolvedBlock += resolve(
                  blockTemplate,
                  { [varName]: item },
                  false,
                  templateBackup,
                  globalIndexOffset + lastStartIndex + lastStartLength
               );
            }

            const delLength = lastStartLength + blockTemplate.length + match[0].length;
            template = strSplice(template, lastStartIndex, delLength, resolvedBlock);
            indexOffset += resolvedBlock.length - delLength;

            blockStartIndexes.pop();
            blockStartLengths.pop();
            forIterables.pop();
            forVariables.pop();
            blockIndex--;
            break;
         }

         default:
            throw new Error(`Unknown command: ${cmd}`);
      }
   }

   if(forFallthrough) {
      throw new Error(`for statement without end`);
   }

   return template;

   function getLineNumber(index: number) {
      const sliced = templateBackup.slice(0, index + globalIndexOffset);
      return sliced.length - sliced.replace(/\n/g, '').length + 1;
   }
}


function resolveVar(template: string, data: Record<string, any>, keepDataType = false) {
   const matchedVars = [...template.matchAll(/\$([a-zA-Z0-9_.]+)/g)];
   for (const match of matchedVars) {
      if(!match[1]) continue;
      let value = data[match[1]];
      if(!keepDataType)
         value = value.toString();
      else {
         switch(typeof value) {
            case 'string':
               value = `"${value}"`;
               break;
            case 'number':
            case 'boolean':
            case 'object':
               if(value === null)
                  value = 'null';
               else if(Array.isArray(value))
                  value = `[${value.map(v => v.toString()).join(',')}]`;
               else
                  value = JSON.stringify(value);
               break;
            default:
               value = value.toString();
         }
      }

      template = template.replace(match[0], value);
   }

   return template;
}

function makeIFPredicate(args: string[], data: Record<string, any>) {
   args = args.map(arg => resolveVar(arg, data, true));
   const predicate = new Function(`if(${args.join(' ')}) return true; return false;`);

   return predicate;
}
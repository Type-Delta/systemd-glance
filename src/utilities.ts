
type ParseArg_Type = 'int' | 'float' | 'string' | 'choice' | 'flag' | undefined;
type ParseArg_Parsed = { _unmatched: ParseArg_Arg[], [key: string]: ParseArg_Arg | ParseArg_Arg[] };

interface ParseArg_TemplateObj {
   pattern: string[];
   default?: any;
   type?: ParseArg_Type;
   isFlag?: boolean;
   required?: boolean;
   choices?: string[];
}
export interface ParseArg_Template {
   [key: string]: ParseArg_TemplateObj;
}

class ParseArg_Arg {
   value;
   index;
   type: ParseArg_Type;
   constructor(value: any, type: ParseArg_Type, index = -1) {
      this.value = value;
      this.type = type;
      this.index = index;
   }

   valueOf() {
      return this.value;
   }

   toString() {
      return this.value.toString();
   }
}


/**Splice but with string, **Note That: Unlike Array.splice() this method doesn't Overwrite
 * the original var**
 * @param str
 * @param index
 * @param removeCount number of Chars to remove
 * @param strToInsert
 */
export function strSplice(str: string, index: number, removeCount: number, strToInsert?: string | undefined) {
   if (removeCount < 0) removeCount = 0;
   if (index < str.length * -1) index = 0; // prevent negative index out of bounds

   if (strToInsert) {
      return str.slice(0, index) +
         strToInsert +
         (index < 0 && removeCount + index >= 0 ? '' : str.slice(index + removeCount));
   } else return str.slice(0, index) +
      (index < 0 && removeCount + index >= 0 ? '' : str.slice(index + removeCount));
}



/**parse command line arguments
 * @example
 * let myParams = {
      name: {
         pattern: ['--name', '-n'], // <- required
         default: 'Timmy',
         type: 'string', // <- default to 'string' unless `isFlag` is true
         isFlag: false,
         required: true // <- force user to include this argument (default to false)
      },
      age: {
         pattern: ['--age'],
         type: 'int' // <- type can be 'int', 'let ', 'string', 'choice', 'flag'
      },
      hasCar: {
         pattern: ['--hascar', '--car'],
         isFlag: true // <- required (only for Flags that doesn't need any Value)
      },
      gender: {
         pattern: ['-g'],
         type: 'choice', // <- force user to choose one of the choice if `default` is undefined
         choices: ['f', 'm'], // <- required for type 'choice'
         default: 'f'
      }
   }

   let a = ['myapp', 'bla bla', '-n', 'Jim', '--hascar', '--age', '34'];
   console.log(parseArgs(a, myParams));
   // Prints:
   // { _unmatched:
   //   [ Arg { value: 'myapp', index: 0, type: undefined },
   //      Arg { value: 'bla bla', index: 1, type: undefined } ],
   // name: Arg { value: 'Jim', index: 3, type: 'string' },
   // hasCar: Arg { value: true, index: 4, type: 'flag' },
   // age: Arg { value: 34, index: 6, type: 'int' },
   // gender: Arg { value: 'f', index: -1, type: 'choice' } }
 * @param args commandline args
 * @param template Paramiter rules object
 * @param caseSensitive
 * @returns
 */
export function parseArgs(
   args: string[],
   template: ParseArg_Template,
   caseSensitive = false
): ParseArg_Parsed {
   let parsed: ParseArg_Parsed = {
      _unmatched: []
   };
   const requiredList = new Set();
      for(const pName in template){
         if(template[pName]?.required)
            requiredList.add(pName);
      }

      for(let i = 0; i < args.length; i++){
         let matched = false;
         for(const pName in template){
            if(!template[pName]?.pattern)
               throw new Error('invalid template: Object structure missmatched. every entries requires `pattern` property');

            if (!isKeyMatched(args[i], template[pName].pattern)) continue;
            requiredList.delete(pName);

            // Value Checking and Parsing
            if (template[pName]?.isFlag || template[pName]?.type == 'flag') {
               matched = true;
               parsed[pName] = new ParseArg_Arg(true, 'flag', i);
               continue;
            }

            let nextArgNotAValue = false;
            if(i + 1 < args.length){
               for (const p in template) {
                  if (isKeyMatched(args[i + 1], template[p].pattern))
                     nextArgNotAValue = true;
               }
            }

            if (i + 1 >= args.length || nextArgNotAValue)
               throw new Error(`argument '${args[i]}' requires a Value`);

            switch (template[pName]?.type) {
               case 'int':
                  if (
                     isNaN((
                        parsed[pName] = new ParseArg_Arg(parseInt(args[++i]), template[pName]?.type, i)
                     ).value)
                  ) throw new Error(`argument '${args[i - 1]}' requires a Value of type '${template[pName]?.type}'`);
                  break;
               case 'float':
                  if (
                     isNaN((
                        parsed[pName] = new ParseArg_Arg(parseFloat(args[++i]), template[pName]?.type, i)
                     ).value)
                  ) throw new Error(`argument '${args[i - 1]}' requires a Value of type '${template[pName]?.type}'`);
                  break;
               case 'choice':
                  if (!template[pName]?.choices?.length)
                     throw new Error('invalid template: Object structure missmatched. entry of type \'choice\' requires `choices` property');

                  if (!isKeyMatched(args[++i], template[pName].choices) &&
                     template[pName]?.default == undefined
                  ) {
                     throw new Error(`invalid value for '${args[i - 1]}' argument, requires any of these Choices: ${template[pName].choices}`);
                  }

                  parsed[pName] = new ParseArg_Arg(args[i], template[pName]?.type, i);
                  break;
               case 'string':
               case undefined:
                  parsed[pName] = new ParseArg_Arg(args[++i], template[pName]?.type, i);
                  break;
               default:
                  throw new Error(`invalid template: entry of type '${template[pName]?.type}' is not supported`);
            }

            matched = true;
         }

         if(!matched)
            parsed._unmatched.push(new ParseArg_Arg(args[i], undefined, i));
      }


      // check for required arguments
      if(requiredList.size > 0)
         throw new Error(`argument(s) '${[...requiredList]}' is required.`);

      // fill default value
      for(const pName in template){
         if(template[pName]?.isFlag||template[pName]?.type == 'flag'){
            if(!parsed[pName]) parsed[pName] = new ParseArg_Arg(false, 'flag');
            continue;
         }

         if(!parsed[pName]){
            parsed[pName] = new ParseArg_Arg(
               template[pName]?.default?template[pName]?.default:null, template[pName]?.type
            );
         }
      }

      return parsed;



      /**
       * @param {string} value
       * @param {string[]} keys
       */
      function isKeyMatched(value, keys){
         for(const k of keys){
            if(!caseSensitive){
               if(value.toLowerCase() == k.toLowerCase()) return true;
               continue;
            }

            if(value == k) return true;
         }
         return false;
      }
   }
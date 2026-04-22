## Code Style
 Focus on completing "Beautiful Programs." Stack up "Beautiful Code Snippets."
- Value "Minimalism" over "Robustness."
- Write similar logic in similar ways. Aim for symmetric structural design.
- Avoid redundant TypeScript/Type definitions and strive for concise code.
- Maintain a width of ~80 characters. Add frequent line breaks to keep the code **vertically long** (minimizing eye movement).
- Normalize logic by extracting reusable parts into functions.
- Ignore minor lint errors; they are automatically corrected.
- YAGNI (You Ain't Gonna Need It). Do not implement low-necessity code or features.

### ■ Non-Defensive Programming (Fail Fast)
- **Avoid hiding bugs; trigger errors immediately.**
  - NG❌: `if (obj && obj.prop) { ... }` / `obj?.prop` (where the value must exist)
  - OK✅: `obj.prop` (crash immediately to expose the bug)

- **Drop excessive safety in favor of code brevity and instant error detection.**
  - NG❌: `const value = arg || 'default';` (when arg is mandatory)
  - OK✅: `const value = arg;`

- **Do not perform meaningless exception handling.**
  - NG❌: `try { doSomething(); } catch (e) { console.error(e); }` (when there is no strategy other than logging)
  - OK✅: `doSomething();` (let the error throw naturally)

- **Never use "use strict".**
  - NG❌: `'use strict';`

### ■ Variable Usage
- **Represent values that change over time with "let" to reduce variable names.**
  - NG❌: `const html = "<html/>"; const cleanedHTML = clean(html);`
  - OK✅: `let html = "<html/>"; html = clean(html);`
	- NG❌: `const rows = db.query(); const urls = new Set(rows.map(r => r.url));`
	- OK✅: `let rows = db.query(); rows = new Set(rows.map(r => r.url));` (Type change is acceptable; it remains a collection)

- **Avoid temporary variables that consume the reader's working memory.**
  - NG❌: `const data = fetchData(); process(data);`
  - OK✅: `process(fetchData());`

- **Avoid unnecessary variable initialization.**
  - NG❌: `abortController.abort(); abortController = null;` (forces checking if it is used as a flag)

- **Leverage method chains and ternary operators for inlining (avoid excessive chaining).**
  - NG❌: `let result; if (a) { result = 1; } else { result = 2; }`
  - OK✅: `const result = a ? 1 : 2;`
  - NG❌: `const id = (await (await fetch(url)).json()).data.items[0].id;` (excessive chaining obscures intent)
  - OK✅: `const res = await fetch(url); const json = await res.json(); const id = json.data.items[0].id;`

- **Label complex logic with temporary variables to improve readability.**
  - NG❌: `if (!start || /[...].test(value.slice(start - 1, start))) { ... }` (inline logic is too obscure)
  - OK✅: `const noBefore = !start || /[...].test(value.slice(start - 1));` (labeling)

### ■ Utility Functions / Libraries
- **Use the "bench" function from util.js for benchmarking without breaking original code.**
  - NG❌: `start = Date.now();store.save(b);elapsed = Date.now() - start`;
  - OK✅: `bench(() => {store.save(b)})`

### ■ Comments
- **Omit comments when the code's intent is clear.**
  - NG❌: `// Get username` `const name = user.getName();`
  - OK✅: `const name = user.getName();`

- **Do not use step numbers in comments.**
  - NG❌: `// 1. Fetch data`, `// 2. Save data`
  - OK✅: `// Fetch data`, `// Save data`

- **Never use JSDoc or multi-line comment blocks (/* ... */).**
  - NG❌: `/**\n * Utility Methods\n */`
  - OK✅: (Express intent through naming and concise code)

- **Respect and do not alter existing comments.**
  - NG❌: (deleting or modifying existing comments)
  - OK✅: (leave comments intact when revising existing code)

### ■ Simple UI
- **Prioritize code brevity and skip decorations in initial implementations.**
  - NG❌: (including animations, complex colors, or font styles from the start)
  - OK✅: (implement with barebones HTML/CSS to achieve functionality with minimal code)

The Javascript powered, pluggable Muschcode engine.

- [Installation](#installation)
- [Basic Usage](#basic-usage)
  - [`string(lists: string, ctx: Context) => Promise<string>`](#stringlists-string-ctx-context--promisestring)
  - [**Functions**](#functions)
    - [`add(name: string, (args: string[], data = {}) => {})`](#addname-string-args-string-data----)
  - [**Substitutions**](#substitutions)
    - [`addSubs(list: string, ...subs: Sub[])`](#addsubslist-string-subs-sub)
    - [`substitute(lists: string, msg: string)`](#substitutelists-string-msg-string)
- [Plugins](#plugins)
- [Development](#development)

## Installation

install the parser with your favorite package manager:

```
npm install @ursamu/parser
yarn add @ursamu/parser
```

## Basic Usage

```js
import { Parser } from "@ursamu/parser";

// Create a new parser.
const parser = new Parser();

// add a function
parser.add("div", (args) => parseInt(args[0]) / parseInt(args[1]));

// Add some substitutions
parser.addSub(
  "telnet",
  { before: /%r/g, after: "\n" },
  { before: /%b/g, after: " " },
  { before: /%t/g, after: "\t" }
);

// run the parser!
parser
  .string("telnet", {
    msg: "Hello %0!! [div(6,2)]",
    scope: { "%0": "World!" },
    data: {},
  })
  .then((results) => console.log(results)); // => Hello World!!! 3
```

#### `string(lists: string, ctx: Context) => Promise<string>`

### **Functions**

Functions are the basis of mushcode, and through the parser you are able to represent whatever codebase you wish!

#### `add(name: string, (args: string[], data = {}) => {})`

Add a new function to the parser.

```js
parser.add("hello", (args) => `hello ${args[0]}!`);
// hello(Dave) => hello Dave!

parser.add("add", (args) => args.reduce((a, b) => a + parseInt(b), 0));
// add(2,3) => 5
```

- **`args`** The following args are available to the add method:
  - `args: any[]` An array of arguments given the function in a comma seperated list.
  - `data: {}` An object where any data needed by the run of the parser is kept. enactor, target, location, etc.

### **Substitutions**

The parser comes with a customisable substitution system that can take stand in expressions. In a Mux-like example `%crWARNING!!%cn`. To customize what substitutisns are available through the parser:

#### `addSubs(list: string, ...subs: Sub[])`

Add a new subsitution to the parser. There are two lists that are pre-determined. `pre` and `post`. `pre` substitutions happen before the code is run through the eval process. `post` happens after all of the other substitutions have been run.

- `list` is the list of substitutions that this range should be added too.
- `subs` A comma seperated list of substitutions to be added to the particular label.
  - `before` The starting string or regular expression to search for.
  - `after` What the matched regular expression or text should be substituted for. If you've ised a regi;ar expression for your before, then you can use wildcard matches `$1`.
  - `strip?` When a function strips the substitutions from your string, what characters should it be substituted with? With most you can get away with a space, or leaving the field blank.

```js
parser.addSubs("telnet", [
  {
    before: /%r/g,
    after: "\n",
  }.
  {
    before: /%t/g,
    after: "\t",
    strip: "    "
  }
]);
```

#### `substitute(lists: string, msg: string)`

Make substitutions from the provided apace seperated list string omto the message.

```js
const results = parser.substitute("telnet", "This is a %rtest.");
```

## Plugins

The parser is customizable through a rogbust plugin system.

`parser.plugin(myPlugin)`

The syntax for creating a plugin is simple:

```js
export const plugin = (parser) => {
  parser.add("add", (args) => args.reduce((a, b) => a + b, 0));
};
```

## Development

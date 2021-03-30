import peg from "pegjs";
import grammar from "../grammar";
import { Middleware, Pipe, pipeline } from "@digibear/middleware";

export interface Context {
  id: string;
  enactor: string;
  targets: string[];
  scope: { [key: string]: any };
  data: { [key: string]: any; expr?: Expression; message?: string };
}

export type MuFunction = (ctx: Context) => Promise<any>;

export type Scope = { [key: string]: any };

export interface Expression {
  type: string;
  value: string;
  list?: Expression[];
  operator: {
    type: string;
    value: string;
  };
  location?: {
    start: {
      offset: number;
      line: number;
      column: number;
    };
    end: {
      offset: number;
      line: number;
      column: number;
    };
  };
  args: Array<Expression>;
}

export interface Context {
  [key: string]: any;
}

export class Parser {
  private parser: peg.Parser;
  fns: Map<string, MuFunction>;
  middleware: Pipe<Context>;

  private constructor() {
    this.parser = peg.generate(grammar);
    this.middleware = pipeline<Context>();
    this.fns = new Map();
  }

  /**
   * Register new middleware to the parser
   * @param middleware The middleware to register with the pipeline.
   */
  use(...middleware: Middleware<Context>[]) {
    this.middleware.use(...middleware);
  }

  /**
   *
   * @param ctx The request object.
   */
  async process(ctx: Context): Promise<Context | void> {
    return this.middleware.execute(ctx);
  }

  /**
   * Strip ansi substitutions from a string.
   * @param string The string to remove the substitution characters from
   */
  stripSubs(string: string) {
    // Remove color codes
    return string
      .replace(/%c[\w\d]+;/g, "")
      .replace(/&lt;/g, " ")
      .replace(/&gt;/g, " ")
      .replace(/&lpar;/g, " ")
      .replace(/&rpar;/g, " ")
      .replace(/<span.*>/, "")
      .replace(/<\span>/, "");
  }

  colorSub(text: string) {
    return (
      text
        .replace(/%[cx]([\w\d]+);/g, "<span style='color: $1'>")
        .replace(/%[cx]n;/g, "</span>")

        // Backgrounds
        .replace(/%[CX](.*);/g, "<span style = 'background-color: $1'>")

        .replace(/%b;/g, "<span style = 'font-weight: bold'>")

        // Other substitutions
        .replace(/%t;/gi, "&nbsp;".repeat(4))
        .replace(/%b;/gi, "&nbsp;")
        .replace(/%r;/gi, "</br>")

        // HTML escape codes!
        .replace(/%</g, "&lt;")
        .replace(/%>/g, "&gt;")
    );
  }

  /**
   * Parse a string for syntax
   * @param code
   */
  parse(code: string) {
    try {
      return this.parser.parse(code);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Add a new softcode function to the system
   * @param name The name of the function
   * @param func The code to be called when the function
   * name is matched.
   */
  add(name: string, func: MuFunction) {
    this.fns.set(name.toLowerCase(), func);
  }

  /**
   * Evaluate a mushcode expression AST.
   * @param en The enacting DBObj
   * @param expr The expression to be evaluated
   * @param scope Any variables, substitutions or special forms
   * that affect the lifetime of the expression.
   */
  async evaluate(ctx: Context) {
    // First we need to see what kind of expression we're working with.
    // If it's a word, then check to see if it has special value in
    // scope, or if it's just a word.
    if (ctx.type === "word") {
      ctx.value = ctx.value || "";
      if (ctx.scope[ctx.value]) {
        return ctx.scope[ctx.value];
      } else {
        let output = ctx.value;
        for (const key in ctx.scope) {
          output = output.replace(new RegExp(key, "gi"), ctx.scope[key]);
        }
        return output;
      }
      // If the expession is a function...
    } else if (ctx.expr.type === "function") {
      const operator = ctx.expr.operator;

      // Make sure it's operator exists in the Map...
      if (operator.type === "word" && this.fns.has(operator.value)) {
        const func = this.fns.get(operator.value);
        if (func) {
          // Execute it and return the results.
          return await func(ctx);
        }
      } else {
        throw new Error("Unknown function.");
      }

      // If it's a list (operations seperated by square brackets)
      // Process each item in the list.
    } else if (ctx.expr.type === "list") {
      return ctx.expr.list;
      // let output;
      // for (let i = 0; i < expr.list!.length; i++) {
      //   output += await this.evaluate(en, expr.list![i], scope);
      // }
      // return output;
      // Else throw an error, unknown operation!
    } else {
      throw new Error("Unknown Expression.");
    }
  }

  async string(ctx: Context) {
    let parens = -1;
    let brackets = -1;
    let match = false;
    let workStr = "";
    let output = "";
    let end = -1;
    let { enactor, text, scope } = ctx;
    // replace out any scoped variables:
    for (const sub in scope) {
      text = text.replace(sub, scope[sub]);
    }

    // Loop through the text looking for brackets.
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "[") {
        brackets = brackets > 0 ? brackets + 1 : 1;
        match = true;
      } else if (text[i] === "]") {
        brackets = brackets - 1;
      } else if (text[i] === "(") {
        parens = parens > 0 ? parens + 1 : 1;
      } else if (text[i] === ")") {
        parens = parens - 1;
      }

      // Check to see if brackets are evenly matched.
      // If so process that portion of the string and
      // replace it.
      if (match && brackets !== 0 && parens !== 0) {
        workStr += text[i];
      } else if (match && brackets === 0 && parens === 0) {
        // If the brackets are zeroed out, replace the portion of
        // the string with evaluated code.
        workStr += text[i];
        end = i;

        // If end is actually set (We made it past the first characracter),
        // then try to parse `workStr`.  If it won't parse (not an expression)
        // then run it through string again just to make sure.  If /that/ fails
        // error.
        if (end) {
          // let results = await this.evaluate(
          //   enactor,
          //   this.parse(workStr),
          //   scope
          // ).catch((err) => workStr);
          // // Add the results to the rest of the processed string.
          // output += results;
        }

        // Reset the count variables.
        parens = -1;
        brackets = -1;
        match = false;
        workStr = "";
        end = -1;
      } else {
        // If stray paren or bracket slips through, add it to `workStr`
        // else add it right to the output.  There's no code there.
        if (text[i].match(/[\[\]\(\)]/)) {
          workStr += text[i];
        } else {
          output += text[i];
        }
      }
    }
    // Return the evaluated text
    return output ? output : workStr;
  }
}

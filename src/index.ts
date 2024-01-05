import peg from "pegjs";
import grammar from "./grammar";

export interface Context {
  scope: { [key: string]: any };
  expr?: Expression[];
  msg?: string;
  data: { [key: string]: any };
}

export type MuFunction = (
  args: any[],
  data: { [key: string]: any },
  scope: Scope,
) => Promise<any>;

export type Scope = { [key: string]: any };

export interface Expression {
  type: string;
  value: string;
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

export type Plugin = (parser: Parser) => void | Promise<void>;

export interface Sub {
  before: string | RegExp;
  after: string;
  strip?: string;
}

export class Parser {
  private parser: peg.Parser;
  fns: Map<string, MuFunction>;

  subs: Map<string, Sub[]>;
  plugins: Plugin[];

  constructor(options?: peg.ParserBuildOptions) {
    this.parser = peg.generate(grammar, options);
    this.fns = new Map();
    this.subs = new Map();
    this.subs.set("pre", []);
    this.subs.set("post", []);
    this.plugins = [];
  }

  /**
   * Add a list of plugins to the parser.
   * @param plugins A comma seperated list of plugins to add to the parser
   * @returns
   */
  plugin(...plugins: Plugin[]) {
    plugins.forEach((plugin) => plugin(this));
    return this;
  }

  /**
   * Add a list of substitutions to the parser
   * @param subs A list of substitutions to add to the parser
   * @returns
   */
  addSubs(label: string, ...subs: Sub[]) {
    label = label.toLowerCase();
    let subArray: Sub[] = [];

    if (this.subs.has(label)) {
      subArray = this.subs.get(label) || [];
      this.subs.set(label, [...subArray, ...subs]);
    } else {
      this.subs.set(label, [...subs]);
    }

    return this;
  }

  /**
   * Remove any subs in a string.
   * @param string The string to strip substitutions from
   * @returns
   */
  stripSubs(list: string, string: string) {
    const listArray = list.toLowerCase().split(" ");
    listArray.forEach((l) => {
      this.subs
        .get(l)
        ?.forEach(
          (sub) => (string = string.replace(sub.before, sub.strip || "")),
        );
    });
    return string;
  }

  /**
   * Perform  substitutions on a string.
   * @param string The string to substitute
   * @returns
   */
  substitute(list: string, string: string) {
    const listArray = list.toLowerCase().split(" ");
    listArray.forEach((l) => {
      this.subs
        .get(l)
        ?.forEach(
          (
            sub,
          ) => (string = string.replace(
            new RegExp(sub.before, "g"),
            sub.after,
          )),
        );
    });
    return string;
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
   * Evaluate a mushcode AST into a string result.
   * @param ctx The context object to be passed to th eval function
   * @returns
   */
  async eval(ctx: Context): Promise<string> {
    // First we need to see what kind of expression we're working with.
    // If it's a word, then check to see if it has special value in
    // scope, or if it's just a word.

    const results = [];
    if (ctx.expr) {
      for (const expr of [...ctx.expr]) {
        if (expr.type === "word") {
          expr.value = expr.value || "";
          if (ctx.scope[expr.value]) {
            results.push(ctx.scope[expr.value]);
          } else {
            let output = expr.value ? expr.value : ",";
            for (const key in ctx.scope) {
              output = output.replace(new RegExp(key, "gi"), ctx.scope[key]);
            }
            results.push(output);
          }
          // If the expession is a function...
        } else if (expr.type === "function") {
          const operator = expr.operator;

          // Make sure it's operator exists in the Map...
          if (operator.type === "word" && this.fns.has(operator.value)) {
            const func = this.fns.get(operator.value);
            if (func) {
              // evaluate any args
              const args = [];
              for (let arg of expr.args) {
                args.push(
                  await this.eval({
                    data: ctx.data || {},
                    scope: ctx.scope,
                    msg: ctx.msg,
                    expr: [arg],
                  }),
                );
              }
              // Execute it and return the results.
              results.push(
                await func(
                  args.map((arg) => (arg === "," ? null : arg)),
                  ctx.data,
                  ctx.scope,
                ),
              );
            }
          } else {
            throw new Error("Unknown function.");
          }
        } else {
          throw new Error("Unknown Expression.");
        }
      }

      return results.join("");
    }

    return "";
  }

  async run(ctx: Context) {
    let brackets = 0;
    let workingStr = "";
    let expr = "";
    let str = ctx.msg;
    let start = 0;

    if (str) {
      str = this.substitute("pre", str);
      for (let i = 0; i < str.length; i++) {
        if (str[i] === "[") {
          brackets++;
          start = start ? start : i;
          expr += str[i];
        } else if (str[i] === "]") {
          if (brackets) brackets--;
          expr += str[i];
          // If brackets have zeroed out (No more brackets) and the
          // iterator have already started - process the
          if (brackets === 0 && i > 0) {
            start = i;
            try {
              const res = await this.eval({
                expr: this.parse(expr),
                scope: ctx.scope,
                data: ctx.data || {},
              });
              workingStr += res;
              expr = "";
              // If there's an error, just add the expression to
              // our output string un-affected.
            } catch (error) {
              workingStr += expr;
              expr = "";
            }
          }
        } else {
          if (brackets) {
            expr += [str[i]];
          } else {
            workingStr += str[i];
          }
        }
      }
      return this.substitute("post", workingStr);
    }
  }

  async string(list: string, ctx: Context) {
    for (let k in ctx.scope) {
      ctx.msg = ctx.msg?.replace(new RegExp(k, "g"), ctx.scope[k]);
    }

    let res = "";

    try {
      res = await this.eval({
        msg: ctx.msg,
        data: ctx.data,
        scope: ctx.scope,
        expr: ctx.expr ? ctx.expr : this.parse(ctx.msg || ""),
      });
    } catch (error) {
      res = (await this.run(ctx)) || "";
    }

    res = this.substitute(list, res || "");
    return this.substitute("post", res);
  }
}

export default new Parser();

import { readFileSync } from "fs";
import { join } from "path";
import peg from "peggy";
import { LocationRange } from "peggy";


class MUSHcodeError extends Error {
  location: LocationRange;
  constructor(message: string, location: LocationRange) {
    super(message);
    this.name = "MUSHcodeError";
    this.location = location;
  }
}

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
  value?: string;
  operator?: {
    type: string;
    value: {
      type: string;
      value: string;
    };
  };
  location?: LocationRange;
  args: Array<Expression>;
}

export type Plugin = (parser: Parser) => void | Promise<void>;

export interface Sub {
  before: string | RegExp;
  after: string | SubFunction;
  strip?: string;
}

export type SubFunction = (substring: string, ...args: any[]) => string;

export class Parser {
  private grammar: string;
  private parser: peg.Parser;
  private fns: Map<string, MuFunction>;
  private subs: Map<string, Sub[]>;
  private plugins: Plugin[];

  constructor(options?: peg.ParserBuildOptions) {
    this.grammar = readFileSync(join(__dirname, "grammar.peg"), "utf8");
    this.parser = peg.generate(this.grammar, {
      ...options
    });
    this.fns = new Map();
    this.subs = new Map([["pre", []], ["post", []]]);
    this.plugins = [];
  }

  private generateErrorPointer(code: string, line: number, column: number): string {
    const lines = code.split('\n');
    const errorLine = lines[line - 1];
    const pointer = ' '.repeat(column - 1) + '^';
    return `${errorLine}\n${pointer}`;
  }

  plugin(...plugins: Plugin[]) {
    plugins.forEach((plugin) => plugin(this));
    return this;
  }

  addSubs(label: string, ...subs: Sub[]) {
    label = label.toLowerCase();
    this.subs.set(label, [...(this.subs.get(label) || []), ...subs]);
    return this;
  }

  stripSubs(list: string, string: string): string {
    return list.toLowerCase().split(" ").reduce((str, l) => {
      const subList = this.subs.get(l) || [];
      return subList.reduce((s, sub) => 
        s.replace(sub.before, sub.strip || ""), str);
    }, string);
  }

  substitute(list: string, stringToSubstitute: string): string {
    return list.toLowerCase().split(" ").reduce((str, l) => {
      const subList = this.subs.get(l) || [];
      return subList.reduce((s, sub) => {
        const regex = sub.before instanceof RegExp ? sub.before : new RegExp(sub.before, "g");
        if (typeof sub.after === "function") {
          return s.replace(regex, (...args: any[]) => {
            if (typeof sub.after === "function") {
              return sub.after(args[0], ...args.slice(1));
            } else {
              return sub.after;
            }
          });
        } else {
          return s.replace(regex, sub.after);
        }
      }, str);
    }, stringToSubstitute);
  }

  parse(code: string): Expression[] {
    try {
      return this.parser.parse(code);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'location' in error && 'message' in error) {
        const pegError = error as { location: LocationRange; message: string };
        const errorMessage = `${pegError.message} at line ${pegError.location.start.line}, column ${pegError.location.start.column}`;
        console.error(errorMessage);
        console.error(this.generateErrorPointer(code, pegError.location.start.line, pegError.location.start.column));
      }
      throw error;
    }
  }

  add(name: string, func: MuFunction) {
    this.fns.set(name.toLowerCase(), func);
  }

  async evaluate(ctx: Context): Promise<string> {
    if (!ctx.expr) return "";

    const results = await Promise.all(ctx.expr.map(async (expr) => {
      try {
        switch (expr.type) {
          case "word":
            return this.evaluateWord(expr, ctx);
          case "function":
            return this.evaluateFunction(expr, ctx);
          case "substitution":
            return this.evaluateSubstitution(expr, ctx);
          case "string":
            return expr.value;
          default:
            throw new MUSHcodeError(`Unknown expression type: ${expr.type}`, expr.location!);
        }
      } catch (error) {
        if (error instanceof MUSHcodeError) {
          const { start } = error.location;
          console.error(`Error in expression at line ${start.line}, column ${start.column}: ${error.message}`);
        }
        throw error;
      }
    }));

    return results.join("");
  }

  private evaluateWord(expr: Expression, ctx: Context): string {
    const value = expr.value || "";
    if (ctx.scope[value]) return ctx.scope[value];
    return Object.entries(ctx.scope).reduce(
      (output, [key, val]) => output.replace(new RegExp(key, "gi"), val),
      value
    );
  }

  private async evaluateFunction(expr: Expression, ctx: Context): Promise<string> {
    const { operator } = expr;
    if (operator && operator.type === "word") {
      const funcName = (typeof operator.value === "string" ? operator.value : operator.value.value).toLowerCase();
      if (this.fns.has(funcName)) {
        const func = this.fns.get(funcName);
        if (func) {
          const args = await Promise.all((expr.args || []).map(async arg => 
            arg === null ? null : await this.evaluate({ ...ctx, expr: [arg] })
          ));
          const result = await func(args, ctx.data, ctx.scope);
          return result.toString();
        }
      }
    }
    throw new MUSHcodeError("Unknown function.", expr.location!);
  }

  private evaluateSubstitution(expr: Expression, ctx: Context): string {
    const value = `%${expr.value}`;
    return ctx.scope[value] || value;
  }

  async run(ctx: Context): Promise<string | undefined> {
    if (!ctx.msg) return;

    const str = this.substitute("pre", ctx.msg);
    let result = "";
    let expr = "";
    let brackets = 0;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === "[") {
        if (brackets === 0) {
          result += await this.evaluateUnbracketed(expr, ctx);
          expr = "";
        }
        brackets++;
        expr += str[i];
      } else if (str[i] === "]") {
        expr += str[i];
        brackets--;
        if (brackets === 0) {
          result += await this.evaluateExpression(expr, ctx);
          expr = "";
        }
      } else {
        expr += str[i];
      }
    }

    if (expr) {
      result += await this.evaluateUnbracketed(expr, ctx);
    }

    return this.substitute("post", result);
  }

  private async evaluateExpression(expr: string, ctx: Context): Promise<string> {
    try {
      const parsed = this.parse(expr.slice(1, -1)); // Remove brackets
      const evaluated = await this.evaluate({
        ...ctx,
        expr: parsed,
      });
      return evaluated;
    } catch (error) {
      console.error(`Error evaluating expression: ${expr}`);
      console.error(error);
      return expr;
    }
  }

  private async evaluateUnbracketed(str: string, ctx: Context): Promise<string> {
    const functionRegex = /(\w+)\((.*?)\)/g;
    let lastIndex = 0;
    let match;
    let result = "";

    while ((match = functionRegex.exec(str)) !== null) {
      result += str.slice(lastIndex, match.index);
      const [fullMatch, funcName, argsString] = match;
      const args = argsString.split(',').map(arg => arg.trim());
      
      if (this.fns.has(funcName.toLowerCase())) {
        const func = this.fns.get(funcName.toLowerCase());
        if (func) {
          const evaluated = await func(args, ctx.data, ctx.scope);
          result += evaluated.toString();
        } else {
          result += fullMatch;
        }
      } else {
        result += fullMatch;
      }

      lastIndex = functionRegex.lastIndex;
    }

    result += str.slice(lastIndex);
    return this.applyScope(result, ctx.scope);
  }

  private applyScope(str: string, scope: { [key: string]: any }): string {
    return Object.entries(scope).reduce(
      (output, [key, val]) => output.replace(new RegExp(key, "g"), val.toString()),
      str
    );
  }
}

export default new Parser();

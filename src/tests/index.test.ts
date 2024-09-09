import { Context, Parser } from "../index";
const parser = new Parser();

describe("Parser", () => {
  beforeEach(() => {
    parser.add("add", async (args) => {
      return args.reduce((prev, curr) => {
        return prev + (typeof curr === 'number' ? curr : parseInt(curr, 10) || 0);
      }, 0);
    });

    parser.add("width", async (args, data) => {
      return "FOOOOOO!";
    });
  });

  test("Create a function and execute an expression", async () => {
    const res = await parser.evaluate({
      expr: parser.parse("add(5,6)"),
      data: {},
      scope: {},
    });

    expect(res).toEqual("11");
  });

  test("Evaluate a function with no args", async () => {
    const res = await parser.evaluate({
      expr: parser.parse("width()"),
      data: {},
      scope: {},
    });

    expect(res).toEqual("FOOOOOO!");
  });

  test("Format a string.", async () => {
    const res = await parser.run({
      msg: "this should equal: [add(5,6)]",
      data: {},
      scope: {},
    });

    expect(res).toEqual("this should equal: 11");
  });

  test("variable scope works.", async () => {
    const res = await parser.run({ 
      msg: "Hello %#!",
      data: {},
      scope: { "%#": "bar" },
    });

    expect(res).toEqual("Hello bar!");
  });

  test("Can handle adjacent expressions", () => {
    parser.add("add", async (args) => {
      return args.reduce((prev, curr) => {
        return prev + (typeof curr === 'number' ? curr : parseInt(curr, 10) || 0);
      }, 0);
    });
    
    parser
      .run({
        msg: "[add(2,2)][add(2,4)]",
        data: {},
        scope: {},
      })
      .then((data) => expect(data).toEqual("46"));
  });

  test("Can evaluate a function without brackets", async () => {
    expect(
      await parser.run({
        msg: "add(2,2)",
        data: {},
        scope: {},
      })).toEqual("4");
  })

  test("Regex repalcements Work", async () => {
    parser.addSubs("telnet", {
      before: "\\*\\*(.*)\\*\\*",
      after: "%ch$1%cn",
    });
    expect(parser.substitute("telnet", "**foob**")).toEqual("%chfoob%cn");
  });
});


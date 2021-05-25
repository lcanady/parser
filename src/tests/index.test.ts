import { Context, Parser } from "../index";

const parser = new Parser();

parser.add("add", async (args) => {
  return args.reduce((prev, curr) => {
    return (prev += parseInt(curr, 10));
  }, 0);
});

parser.add("width", async (args, data) => {
  return "FOOOOOO!";
});

test("Create a function and execute an expression", async () => {
  const res = await parser.eval({
    expr: parser.parse("add(5,6)"),
    data: {},
    scope: {},
  });

  expect(res).toEqual("11");
});

test("Evaluate a function with no args", async () => {
  const res = await parser.eval({
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
  const res = await parser.string("", {
    msg: "Hello %#!",
    scope: {
      "%#": "Foobar",
    },
    data: {},
  });

  expect(res).toEqual("Hello Foobar!");
});

test("Blank args return as null or blank", async () => {
  parser.add("testing", (args) => {
    return args[1];
  });

  const res = await parser.eval({
    expr: parser.parse("testing(1,,3)"),
    data: {},
    scope: {},
  });

  expect(res).toEqual("");
});

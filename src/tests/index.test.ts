import { Parser } from "../index";

const parser = new Parser();

parser.add("add", async (args) => {
  return args.reduce((prev, curr) => {
    return (prev += parseInt(curr, 10));
  }, 0);
});

test("Create a function and execute an expression", async () => {
  const res = await parser.eval({
    expr: parser.parse("add(5,6)"),
    data: {},
    scope: {},
  });

  expect(res).toEqual("11");
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

export default `
// mushcode Grammar
// Author: Lemuel Canady, Jr (lem@digibear.io)
// This grammar is really basic, but it gets the job done!
// Builds an AST to be processed by the game server.

function =  _ call: word "(" _ a: (args)? _ ")" _  
{ 
   ;
    return [{
        type: "function", 
        operator: {type: "word", value: call},
       
        args: a ? a : []
    }];
} /
_ "[" _ call: word "(" _ a: (args)? _ ")" _ "]" _  
{ 
   
    return [{
        type: "function", 
        operator: {type: "word", value: call},
       
        args: a ? a : []
    }];
}

args = a: (arg arg+) _ t: args* { 
    return [{type: "list", args: a.flat()}, ...t].flat();
} /
a: arg* _ "," _ "," _ t: args* { 
    
    return [[a, {type: "word", value: null}].flat(), t.flat()].flat();
} /
a: arg* _ "," _ t: args* { 
    return [a.flat(), t.flat()].flat();
} / 
arg

arg = f: function { 
    return f;
} / 
w: word { 
    const loc = location();
    return {type: "word", value: w};
}

word = w:[^\\(\\),\\[\\]]+ {return w.join("").trim()} 
_ = [ \\t\\n\\r]*

`;

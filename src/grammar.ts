export default `
// mushcode Grammar
// Author: Lemuel Canady, Jr (lem@digibear.io)
// This grammar is really basic, but it gets the job done!
// Builds an AST to be processed by the game server.

epression = results: args*  {

	return results.flat()
}
 
function =  _ call: word "(" _ a: (args)? _ ")" _  
{ 
	const loc = location()
    return {
    	type: "function", 
        operator: {type: "word", value:call},
        location: loc,
        args: Array.isArray(a) ? a : a ? [a] : []
   	}
} /

"[" _ call: word "(" _ a: (args)? _ ")" _ "]"   
{ 
	const loc = location()
    return {
    	type: "function", 
        operator: {type: "word", value:call},
        location: loc,
        args: Array.isArray(a) ? a : a ? [a] : []
   	}
}




args =  _ "," _  
{ 
	const loc = location();
	return 	{type: "word", value: null, location: loc} 

}/
    
    	a: arg _ "," _ t: args* {return [a,t].flat()}  / 
		arg 



arg = 	f: function {return f} / 
				w: word { 
     			const loc = location();
     			return {type: "word", value: w,   location: loc } 
				}


word = w:[^\\(\\),\\[\\]]+ {return w.join("")} 
_ = [ \\t\\n\\r]*
`;

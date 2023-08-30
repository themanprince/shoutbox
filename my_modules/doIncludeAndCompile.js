const doInclude = require(__dirname + "/includer.js");
const handlebars = require("handlebars");
const {readFile} = (require("fs")).promises;


async function includeAndCompile(fileName, obj) {
	let hbCompiled;
	try {
		const content = await readFile(fileName, 'utf-8');
		const replacedKini = await doInclude(content);
		hbCompiled = handlebars.compile(replacedKini)(obj);
	} catch(err) {
		console.log("Error in reading file %s", fileName);
		console.error(err);
	} finally {
		return hbCompiled || "";
	}
}

//exporting
module.exports = includeAndCompile;
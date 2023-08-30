//the job of this module is to do the include shit that ejs has
//nawa, I'm hand-writing e'rything to the point that even my
//templater is not templatering

const {readFile} = require("fs");

async function doInclude(templateString) {
	const includeRegex = /\{{2}\s*include\s+'(.+)'\s*\}{2}\n?/g;
	//...will match all lines that contain the string {{include kini}}
	const fileReaders = [];
	let matchObj;
	//gon be storing promises that read the file contents for me into that fileReaders
	while(matchObj = includeRegex.exec(templateString)) {
		fileReaders.push(new Promise((res, rej) => {
			let [_, fileName] = matchObj;
			readFile(fileName, (err, content) => {
				if(err) {
					console.error(err);
					rej(err);
					return;
				}
				
				res(content);
			});
		}));
	}
	
	//at this point, all the promises finna be stored
	const allContent = await Promise.all(fileReaders);
	
	//gon make a copy of that earlier regex, since there's no Reference
	//for me to check how i finna reset it
	//... just tried some shit on node REPL and it seems like...
	const newRegCopy = new RegExp(includeRegex);
	
	const result = templateString.replaceAll(includeRegex, (_/*whole match*/, fileName) => {
		let content;
		try {
			content = allContent.shift(); //queue
		} catch(error) {
			console.error(error);
			return;
		}
		
		return content;
	});
	
	return result || "";
}

module.exports = doInclude;
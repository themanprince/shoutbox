//-------importing shi first
const Sequencer = require(__dirname + "/my_modules/Sequencer.js");
const {Server} = require("http");
const {readFile} = require("fs");
const includeAndCompile = require(__dirname + "/my_modules/doIncludeAndCompile.js");
//this is a func that will do all the necessary file inclusions and then, compile, returning me a handlebars string to render
const qs = require("qs");
let Entry; /*the model... will be instantiated soon*/

//----consts next
const PORT = process.env.PORT || 8000;
const STATIC_DIR /*for static files*/ = __dirname + "/public";

//had to put this import in a seq... so that I'll know that for rest of app to work, it must've been imported
function importModel(next, req, res) {
	/*after first require, it will be cached, so no need to worry bout requiring on every request*/
	require("./models/entry.js").then(theClass => {
		Entry = theClass;
		
		next(req, res, STATIC_DIR /*because next is static server*/);
	}).catch(err => {
		console.error(err);
	});
}

//--------middleware next

//static file middleware
function staticServe(next, req, res, viewsDir) {
	//allowed mimeTypes
	const allowedMIME = new Map();
	allowedMIME.set("html", "text/html");
	allowedMIME.set("css", "text/css");
	allowedMIME.set("js", "application/js");
	allowedMIME.set("woff2", "font/woff2");
	allowedMIME.set("svg", "image/svg+xml");
	
	const regexStr = `\\/.+\\.(${[...allowedMIME.keys()].join("|")})$`;
	const regex = new RegExp(regexStr, 'i');
	let match;
	if(/*next shi finna confuse someone one day*/(match = req.url.match(regex)) && (req.method === "GET")) {
		readFile(`${viewsDir}/${match[0]}`, (err, content) => {
			if(err) {
				res.writeHead(404, {"Content-Type": "text/plain"});
				res.end(`Error in getting file ${match[0]}`);
				return;
			}
			
			res.writeHead(200, {'Content-Type': allowedMIME.get(match[1])});
			res.end(content);
		});
	} else {
		next(req, res);
	}
}
//JSON parser middleware
function JSONparser(next, req, res) {
	//only attach handler if content type is JSON
	//meaning no other handler attachment or middleware will run until
	//data end
	if(req.headers["content-type"] === "application/json") {
		let data = "";
		req.on("data", shi => data += shi);
		req.on("end", () => {
			//next, incase client wanna be a bxtch
			try {
				req.body = JSON.parse(data);
			} catch (error) {
			} finally {
				next(req, res);
			}
		});
	} else {
		//else just call the next middleware
		next(req, res);
	}
}

//form data parser middleware
function formDataParser(next, req, res) {
	if(req.headers["content-type"] === "application/x-www-form-urlencoded") {
		let data = "";
		
		req.on("data", shi => data += shi);
		
		req.on("end", () => {
			try {
				req.body = qs.parse(data);
			} catch(error) {
			} finally {
				next(req, res);
			}
		});
	} else {
		next(req, res);
	}
}


//the callback for get post requests... express style
function getPost(next, req, res) {
	if((req.method === "GET") && (req.url === "/post")) {
		//reading the handlebars file
		includeAndCompile(__dirname + "/view/post.hbs", {"title": "Posts"}).then(str => {
			res.writeHead(200, {"Content-Type": "text/html"});
			res.end(str);
		});
		return; //preventing further movement
	}
	
	next(req, res);
}

function prePostVal(next, req, res) {
	/*Pre-Post /post validation*/
	if((req.method === "POST") && (req.url === "/post")) {
		let {title, body} = req.body.entry;
		if((!title) || (title.length < 4)) {
			res.writeHead(404, {"Content-Type": "text/html"});
			res.write('<b style="background-color: red; inline-size: 100%">Title cannot be less than 4 chars in length</b>');
			res.end();
			return; //certainly abused... lol	
		}
		
		next(req, res); //got here means that it's valid so it can go forward to next middleware
		return;
	}
	
	next(req, res);
}

//the callback for post /post requests
function postPost(next, req, res) {
	if((req.method === "POST") && (req.url === "/post")) {
		const {title, body} = req.body.entry; //finna be parsed by formDataParser
		const entry = new Entry({title, body});
		entry.save((err, result) => {
			if(err) {
				console.log("Error in saving entry");
				console.error(err);
				return; //there was something below to not go to before... in the begi...
			}
			
			res.writeHead(301, {"Location": "/"}); //TODO - this route
			res.end();
		});
		
		return; //dont go further down
	}
	
	next(req, res);
}

function getHome(next, req, res) { /*the home page is a list of entries*/
	if((req.method === "GET") && (req.url === "/")) {
		Entry.getRange(1, -1, (err, result) => {
			if(err) {
				console.error(err);
				return;
			}
			
			
			const hbsObj = {
				"title": "Entries",
				"entries": result
			};
			//reading the handlebars file
			includeAndCompile(__dirname + "/view/entries.hbs", hbsObj).then(str => {
				res.writeHead(200, {"Content-Type": "text/html"});
				res.end(str);
			});
		});
		
		return; //stay back... I feel Im abusing this
	}
	
	next(req, res);
}

//the Server
const app = new Server((req, res) => {
	const Seq = new Sequencer();
	Seq.use(importModel); //also trusting on npm caching so that I don't have to require it again on subsequent requests
	Seq.use(staticServe);
	Seq.use(JSONparser);
	Seq.use(formDataParser);
	Seq.use(getPost);
	Seq.use(prePostVal);
	Seq.use(postPost);
	Seq.use(getHome);
	
	Seq.next(req, res);
	//starting with static serve so I gotta lass it the dir
});

app.listen(PORT, () => console.log("Idan is active"));
app.on("close", () => {
	Entry.endAll();
});
app.on("SIGNINT", () => app.close());
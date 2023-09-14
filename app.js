//-------importing shi first
const Sequencer = require(__dirname + "/my_modules/Sequencer.js");
const {Server} = require("http");
const {readFile} = require("fs");
const {includeAndCompile, registerHelper} = require(__dirname + "/my_modules/doIncludeAndCompile.js");
//this is a func that will do all the necessary file inclusions and then, compile, returning me a handlebars string to render
const qs = require("qs");
const uuid = require(__dirname + "/my_modules/copiedUUID.js");
const parseCookies/*yea, that BT module*/ = require(__dirname + "/my_modules/parseCookies");
const auth = require("basic-auth");
let Entry, User; /*the models... will be instantiated soon*/

//----consts next
const PORT = process.env.PORT || 8000;
const STATIC_DIR /*for static files*/ = __dirname + "/public";

//had to put this import in a seq... so that I'll know that for rest of app to work, it must've been imported
//so it is the first thing goin to be on middleware chain
function importUserModel(next, req, res) {
	/*after first require, it will be cached, so no need to worry bout requiring on every request*/
	require(__dirname + "/models/user.js").then(theClass => {
		User = theClass;
		
		next(req, res);
	}).catch(err => {
		console.error(err);
	});
}

function importEntryModel(next, req, res) {
	/*after first require, it will be cached, so no need to worry bout requiring on every request*/
	require(__dirname + "/models/entry.js").then(theClass => {
		Entry = theClass;
		
		next(req, res);
	}).catch(err => {
		console.error(err);
	});
}

//------- helpers

//this one is for adding messages to that session var
function addMsg(req, msg, type) {
	type = type || "info";
	//ref next... hopefully, session middleware done did its duty
	const sess = req.session;
	sess.messages = sess.messages || [];
	sess.messages.push({type, string: msg});
}


//--------middleware next

//static file middleware
function staticServe(next, req, res) {
	//allowed mimeTypes
	const allowedMIME = new Map();
	allowedMIME.set("html", "text/html");
	allowedMIME.set("css", "text/css");
	allowedMIME.set("js", "application/js");
	allowedMIME.set("woff2", "font/woff2");
	allowedMIME.set("svg", "image/svg+xml");
	allowedMIME.set("ico", "image/x-icon"); /*this particular one could be rubbish, but kiwi browser won't lemme be without constantly asking for favicon.ico*/
	
	const regexStr = `\\/.+\\.(${[...allowedMIME.keys()].join("|")})$`;
	const regex = new RegExp(regexStr, 'i');
	let match;
	if(/*next shi finna confuse someone one day*/(match = req.url.match(regex)) && (req.method === "GET")) {
		readFile(`${STATIC_DIR}/${match[0]}`, (err, content) => {
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

//cookie middleware
function cookiesParser(next, req, res) {
	req.cookie = (req.headers.cookie) ? parseCookies(req.headers.cookie) : {};
	
	next(req, res);
}

//session data middleware
//before that, a map for storing session data
const sessMap = new Map();
function sessionHandler(next, req, res) {
	
	let sessid;
	
	if((!req.cookie.sessid) || (!sessMap.has(req.cookie.sessid))) {
		//second cobdition is for cases when I shut down my server but cookies still with user
		//so when I reconnect, they still with it
		//this user dont have id
		sessid = uuid();
		sessMap.set(sessid, {});
		//making it to expire in 15m for refreshing
		const exprMilliSecs = (new Date()).getTime() + (1000 * 60 * 15);
		const exprDate = new Date(exprMilliSecs);
		res.setHeader("Set-Cookie", [`sessid=${sessid};expires=${exprDate.toUTCString()}`]);
	} else {
		sessid = req.cookie.sessid;
	}
	
	//got here means it has sessid
	req.session = sessMap.get(sessid);
	
	
	//also gon' be registering a handlebars helper here so it can have access to req
	//it goes with the func for adding session messages, but I had to put it here
	registerHelper("clearMsgs", (options) => {
		req.session.messages = [];
	});
	
	next(req, res);
}

//general api authentication middleware
function authAPI(next, req, res) {
	if((req.url.startsWith("/api"))) {
		let authObj;
		if(authObj = auth(req)){
			const {name, pass} = authObj;
			User.authenticate(name, pass, (err, user) => {
				if(err)
					return console.error(err);
				
				if(user) {
					req.remoteUser = user;
					next(req, res); //only if user authenticated
				} else
					console.error("Unable to authenticate user");
			});
		} else {
			console.error("User tried to access /api without an Authorization header or so... \nSupposed to send 401:unauthorized for user-agent to query em for me... but fuck it");
		}
	} else
		next(req, res);
}

//user loader middleware
function userLoader(next, req, res) {
	const {uid} = req.session; //if you logged in or registered, you finna have this
	if(!uid)
		return next(req, res); //just returning early, like no school
	
	User.getUser(uid, (err, kini) => {
		if(err)
			return console.error(err);
		
		req.user = kini;
		
		next(req, res);
	});
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

//the callback for get registration page requests... express style
function getRegister(next, req, res) {
	if((req.method === "GET") && (req.url === "/register")) {
		//user details for hbs template
		const user = (req.user) ? req.user : null;
		//reading the handlebars file
		includeAndCompile(__dirname + "/view/register.hbs", {"title": "Register", user, ...req.session}).then(str => {
			res.writeHead(200, {"Content-Type": "text/html"});
			res.end(str);
		});
		return; //preventing further movement
	}
	
	next(req, res);
}

//for handling registration submissions
function postRegister(next, req, res) {
	if((req.method === "POST") && (req.url === "/register")) {
		//got here means form data finna been parsed so...
		const data = req.body.user;
		User.getByName(data.name, (err, user) => {
			if(err)
				return console.error(err);
			
			if(user.id) {
				addMsg(req, "Username Taken Bitch", "error");
				const backURL = req.headers.referrer || "/register";
				res.writeHead(301, {"Location":backURL});
				res.end();
			} else {
				user = new User({
					"name": data.name,
					"pass": data.pass
				});
				
				user.save(err => {
					if(err)
						return console.error(err);
					
					req.session.uid = user.store.id;
					res.writeHead(301, {"Location": "/"});
					res.end();
				});
			}
		});
	} else {
		next(req, res);
	}
}

function getLogin(next, req, res) {
	if((req.method === "GET") && (req.url === "/login")) {
		//user data we gon be passing to hbs template
		const user = (req.user) ? req.user : null;
		//reading the handlebars file
		includeAndCompile(__dirname + "/view/login.hbs", {"title": "Login", user, ...req.session}).then(str => {
			res.writeHead(200, {"Content-Type": "text/html"});
			res.end(str);
		});
		return; //preventing further movement
	}
	
	next(req, res);
}

function postLogin(next, req, res) {
	if((req.method === "POST") && (req.url === "/login")) {
		//got here means that form shit parsed
		const data = req.body.user;
		User.authenticate(data.name, data.pass, (err, user) => {
			if(err)
				return console.error(err);
			
			if(user) {
				req.session.uid = user.id;
				res.writeHead(301, {"Location" : "/"});
				res.end();
			} else {
				const errorMsg = "Invalid Username/Password";
				addMsg(req, errorMsg, "error");
				//taking back
				const backURL = req.headers.referrer || "/login";
				res.writeHead(301, {"Location" : backURL});
				res.end();
			}
		});
	} else {
		next(req, res);
	}
}

function getLogout(next, req, res) {
	if((req.method === "GET") && (req.url === "/logout")) {
		//expiring session cookie first
		res.setHeader("Set-Cookie", ["sessid=; expires=Thu, 01 Jan 1970 00:00:00 GMT;"]);
		sessMap.delete(req.cookie.sessid);
		res.writeHead(301, {"Location": "/"});
		res.end();
	} else {
		next(req, res);
	}
}

//the callback for get post requests... express style
function getPost(next, req, res) {
	if((req.method === "GET") && (req.url === "/post")) {
		//user details for hbs template
		const user = (req.user) ? req.user : null;
		
		//reading the handlebars file
		includeAndCompile(__dirname + "/view/post.hbs", {"title": "Posts", user}).then(str => {
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
		//user details for hbs template
		const user = (req.user) ? req.user : null;
		const username = user.name;
		const entry = new Entry({title, body, username});
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
			
			//user details for hbs template
			const user = (req.user) ? req.user : null;
		
			const hbsObj = {
				"title": "Entries",
				"entries": result,
				user
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

//----api middleware
function apiGetUser(next, req, res) {
	let match;
	if((req.method === "GET") && (match = /\/api\/user\/(.+)/.exec(req.url))) {
		const [_, id] = match;
		User.getUser(id, (err, user) => {
			if(err)
				return console.error(err);
			
			if(!user.id) {
				res.writeHead(404);
				res.end("Not found");
				return;
			}
			
			res.writeHead(200, {"Content-Type": "application/json"});
			res.end(JSON.stringify(user));
		});
	} else
		next(req, res);
}

function apiPostPost(next, req, res) {
	//make sure header content-type is x-www-form-urlencoded
	if((req.method === "POST") && (req.url === "/api/entry")) {
		const {title, body} = req.body.entry; //finna be parsed by formDataParser
		//user details
		const user = (req.remoteUser) ? req.remoteUser : null;
		const username = user.name;
		const entry = new Entry({title, body, username});
		entry.save((err, result) => {
			if(err) {
				console.log("Error in saving entry");
				console.error(err);
				return; //there was something below to not go to before... in the begi...
			}
			
			res.writeHead(200, {"Content-Type": "application/json"}); //TODO - this route
			res.end(JSON.stringify({"message": "Entry Added"}));
		
		});
		
		return; //dont go further down
	}
	
	next(req, res);
}

//function for populating the req with page details when user request for a page of entries
function apiPreGetPage(perPage) {
	perPage = perPage || 10;
	return function(next, req, res) {
		let match;
		if((req.method === "GET") && (match = /\/api\/entries(\/(.+))?/.exec(req.url))) {
			const [ , , pg] = match;
			const page = Math.max(1, parseInt(pg || '1')) - 1;
			//apparently, the math.max shit above makes sure it's never zero... for the case of users on loud
			
			Entry.count((err, total) => {
				if(err)
					return console.log(err);
				
				req.page = {
					"number": page,
					perPage,
					"from": page * perPage,
					"to": (page * perPage) + (perPage - 1),
					total,
					count: Math.ceil(total/perPage)
				};
				
				
				next(req, res);
			});
		}
	}
}

function apiGetPage(next, req, res) {
	if((req.method === "GET") && (req.url.match(/\/api\/entries(\/(.+))?/))) {
		//got here means it passed the pre..
		const {from, to} = req.page;
		Entry.getRange(from, to, (err, entries) => {
			if(err)
				return console.error(err);
			
			res.writeHead(200, {"Content-Type": "application/json"});
			res.end(JSON.stringify(entries));
		});
	}	
}

//-----------the Server
const app = new Server((req, res) => {
	
	const Seq = new Sequencer();
	Seq.use(importUserModel);
	Seq.use(importEntryModel); //also trusting on npm caching so that I don't have to require it again on subsequent requests
	Seq.use(staticServe);
	Seq.use(cookiesParser);
	Seq.use(sessionHandler);
	Seq.use(authAPI);
	Seq.use(userLoader);
	Seq.use(JSONparser);
	Seq.use(formDataParser);
	Seq.use(getRegister);
	Seq.use(postRegister);
	Seq.use(getLogin);
	Seq.use(postLogin);
	Seq.use(getLogout);
	Seq.use(getPost);
	Seq.use(prePostVal);
	Seq.use(postPost);
	Seq.use(getHome);
	Seq.use(apiGetUser);
	Seq.use(apiPostPost);
	Seq.use(apiPreGetPage());
	Seq.use(apiGetPage);
	
	Seq.next(req, res);
	//starting with static serve so I gotta lass it the dir
});

app.listen(PORT, () => console.log("Idan is active"));
app.on("close", () => {
	console.log("closing server");
	Entry.endAll();
	Entry.pool.end();
});
app.on("SIGNINT", () => app.close());
//gon have to implement a postgres db model
//mans used Redis... so I'mma also go volatile with rolled-back transactions
const pool = require(__dirname + "/poolObj.js");
const pathToSequencerModule = __dirname + "/../my_modules/Sequencer.js";
const Sequencer = require(pathToSequencerModule);
const bcryptjs = require("bcryptjs");

const Seq = new Sequencer();

let conn;
Seq.use(/*creating client*/(next) => {
	pool.connect().then(client => {
		conn = client;
		next();
	}).catch(err => {
		console.log("Error in creating pool client");
		console.error(err);
	});
});

Seq.use(/*transaction starting*/(next) => {
	const transQuery = `START TRANSACTION;`;
	conn.query(transQuery, (err, res) => {
		if(err) {
			console.error(err);
			return;
		}
		
		next();
	});
});

let UserModelResolve;
const UserModelPromise = new Promise((res, rej) => {
	UserModelResolve = res;
});

Seq.use(/*the class*/ (next) => {
	UserModelResolve(class TheClass{
		#store;
		static connRef;
		constructor(obj) {
			this.#store = {};
			connRef = conn;
			
			for(let key of Object.keys(obj))
				this.#store[key] = obj[key];
		}
		
				
		static endAll() { /*added this one myself for closing connections and rolling back*/
			//rollback kini
			TheClass.connRef.query("ROLLBACK", (err, res) => {
				if(err) {
					console.error(err);
					return;
				}
				
				conn.end();
			});
		}
	});
			
	next(); //after creating class
});

module.exports = UserModelPromise;
Seq.next(); //starting it
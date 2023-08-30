//gon have to implement a postgres db model
//mans used Redis
const {Pool} = require("pg");
const pathToSequencerModule = __dirname + "/../my_modules/Sequencer.js";
const Sequencer = require(pathToSequencerModule);

const Seq = new Sequencer();

const pool = new Pool({
	'user': 'the_man_prvnce',
	'host': 'localhost',
	'port': 5432,
	'database': 'shoutbox'
});

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

Seq.use(/*table creation*/(next) => {
	
	
	const tableQuery = `
		CREATE TABLE IF NOT EXISTS entries
		(
			id serial,
			entry JSONB,
			CONSTRAINT pk_key PRIMARY KEY(id)
		);
	`;
	
	conn.query(tableQuery, (err, res) => {
		if(err) {
			console.error(err);
			return;
		}
		
		next(); //only if successful
	});
});


let EntererPromiseResolver;
const EntererPromise = new Promise((res, rej) => {
	EntererPromiseResolver = res;
});

Seq.use(/*create class only after table creation success*/(next) => {
	
	EntererPromiseResolver(class TheClass { /*had to give it a name so that I can ref its static vars*/
		
		#store;
		static connRef = conn;
		
		constructor(obj) {
			this.#store = {};
			
			for(let key of Object.keys(obj))
				this.#store[key] = obj[key];
		}
		
		save(cb) {
			const toPut = JSON.stringify(this.#store);
			TheClass.connRef.query(`INSERT INTO entries(entry) VALUES ($1)`, [toPut], (err, res) => cb(err, res));
		}
		
		static getRange(from, to, cb) {
			const entries = [];
			const query = `SELECT * FROM entries WHERE id BETWEEN $1 AND $2;`;
			TheClass.connRef.query(query, [from, to], (err, res) => {
				if(err) {
					cb(err);
					return;
				}
				
				for(let kini of res.rows)
					entries.push(kini["entry"]);
				
				cb(null, entries);
			});
		}
		
		static endAll() { /*added this one myself for closing connections and rolling back*/
			//rollback kini
			TheClass.connRef.query("ROLLBACK", (err, res) => {
				if(err) {
					console.error(err);
					return;
				}
				
				conn.end();
				pool.end();
			});
		}
		
	});
	
	next(); //after creating class
});

//exporting it
module.exports = EntererPromise;

//starting It
Seq.next();
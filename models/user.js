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

function runQuery(next, queryStr) {
	/*to run queries and only move forward if its a success*/
	conn.query(queryStr, (err, res) => {
		if(err) {
			console.error(err);
			return;
		}
		
		console.log(res);
		next();
	});
}

Seq.use(/*transaction starting*/(next) => {
	runQuery(next, "START TRANSACTION;");
});

Seq.use(/*making table*/(next) => {
	runQuery(next, `
		CREATE TABLE IF NOT EXISTS total_IDs (
		ID_count INTEGER
	);
	`);
});

Seq.use(/*trigger to allow only one row*/ (next) => {
	runQuery(next, `
	CREATE OR REPLACE FUNCTION check_count()
	RETURNS TRIGGER
	AS $$
		DECLARE row_count INTEGER;
		BEGIN
			SELECT count(*) FROM total_IDs
			INTO row_count;
			
			IF row_count = 0
			THEN
				RETURN NEW;
			ELSE
				RAISE WARNING 'CANNOT HAVE MORE THAN ONE ROW IN total_IDs TABLE'
				USING TABLE = 'total_IDs', COLUMN = 'ID_count';
			END IF;
		END;
	$$ LANGUAGE plpgsql;
	
	
	CREATE TRIGGER count_check
	BEFORE INSERT ON total_IDs
	FOR EACH ROW
	EXECUTE FUNCTION check_count();
	`);
});

Seq.use(/*user details table*/next => {
	runQuery(next, `
	CREATE TABLE IF NOT EXISTS user_details (
		user_id INTEGER,
		user_name VARCHAR(40),
		kini JSONB,
		CONSTRAINT user_details_pk PRIMARY KEY(user_id)
	);
	
	CREATE INDEX IF NOT EXISTS id_and_name
	ON user_details(user_id, user_name);
	`);
});

Seq.use(/*function for inserting and updating*/next => {
	const query = `
		CREATE FUNCTION increase_total_ids_count()
		RETURNS INTEGER
		AS $$
			DECLARE row_count INTEGER;
			DECLARE id_total INTEGER;
			BEGIN
				SELECT count(*) FROM total_IDs
				INTO row_count;
				IF row_count = 0
				THEN
					INSERT INTO total_IDs VALUES (1);
				ELSE
					UPDATE total_IDs
					SET ID_count = (SELECT (t.ID_count + 1) FROM total_IDs AS t);
				END IF;
				
				SELECT ID_count FROM total_IDs
				INTO id_total;
				
				RETURN id_total;
			END;
		$$ LANGUAGE plpgsql;
	`;
	runQuery(next, query);
});

Seq.use(/*procedure for updating/inserting user*/ next => {
	const query = `
		CREATE PROCEDURE update(id INTEGER, name VARCHAR, theKini JSONB)
		AS $$
			BEGIN
				IF EXISTS
					(SELECT * FROM user_details AS u
					WHERE u.user_id = id)
				THEN
					UPDATE user_details
					SET
						user_name = name,
						kini = theKini
					WHERE user_id = id;
				ELSE
					INSERT INTO user_details(user_id, user_name, kini)
					VALUES (id, name, theKini);
				END IF;
			END;
		$$ LANGUAGE plpgsql;
	`;
	runQuery(next, query);
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
			TheClass.connRef = conn;
			
			if(obj)
				for(let key of Object.keys(obj))
					this.#store[key] = obj[key];
		}
		
		get store() {
			/*only adding a getter so you can only
			add new props or change old props...
			but can't change the reference*/
			return this.#store;
		}
		
		save = (cb) => {
			if(this.#store.id) /*user got an id so its not they first time*/
				this.update(cb);
			else {
				
				const saveSeq = new Sequencer();
				
				saveSeq.use((next) => {
					const theQuery = `
					SELECT increase_total_ids_count() AS new_count;
					`;
					TheClass.connRef.query(theQuery, (err, res) => {
						if(err) {
							console.error(err);
							return;
						}
						
						this.#store.id = parseInt(res.rows[0]["new_count"]);
						next();
					});
				});
				
				saveSeq.use(next => {
					//hashing password
					this.hashPassword(err => {
						if(err) {
							console.error(err);
							return;
						}
						
						next();
					});
				});
				
				saveSeq.use(next => this.update(cb));
				
				saveSeq.next(); //starting it
				
			}
		}
		
		hashPassword = (cb) => {
			cb();
		}
		
		update = (cb) => {
			const {id, name} = this.#store;
			TheClass.connRef.query("CALL update($1, $2, $3);", [id, name, JSON.stringify(this.#store)], cb);
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


/*-----------testing*/
let x;
Seq.use(next => {
	UserModelPromise.then(kini => {
		(x = new kini({"name": "Menor", "pussy":"dry"})).save((err, res) => {
			conn.query(`SELECT * FROM user_details;`, (selErr, selRes) => {
				console.log(selErr, selRes.rows, "\n");
				next();
			});
		});
	});
});

Seq.use(next => {
	UserModelPromise.then(kini => {
		x.store.name = "Matthew";
		x.save((err, res) => {
			conn.query(`SELECT * FROM user_details;`, (selErr, selRes) => {
				console.log(selErr, selRes.rows, "\n");
				next();
			});
		});
	});
});

Seq.use(next => {
	UserModelPromise.then(kini => {
		(new kini({"name": "Menorahh", "pussy":"wet"})).save((err, res) => {
			conn.query(`SELECT * FROM user_details;`, (selErr, selRes) => {
				console.log(selErr, selRes.rows, "\n");
				next();
			});
		});
	});
	next();
});


module.exports = UserModelPromise;
Seq.next(); //starting it
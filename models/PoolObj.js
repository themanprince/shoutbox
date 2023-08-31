/*to allow all modules use a single pool*/
const {Pool} = require("pg");

const pool = new Pool({
	'user': 'the_man_prvnce',
	'host': 'localhost',
	'port': 5432,
	'database': 'shoutbox'
});

module.exports = pool;
const parseCookies = function(cookieStr) {
	const cookieObj = {};
	if(!cookieStr) //incase of undefined or empty shi
		return null;
	
	cookieStr.split(";").map(/*trimming each piece*/piece => piece.trim()).map(/*splitting to form a pair*/piece => piece.split('=').map(/*trimming each name/value*/each => each.trim())).forEach(([name, value]) => cookieObj[name] = value);
	return cookieObj;
}

module.exports = parseCookies;
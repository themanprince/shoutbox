class Sequencer {
	
	#queue;
	#index;
	
	constructor(...funcs) {
		this.#index = 0;
		
		//if you pass me an array of funcs, I'll just store em
		if(funcs)
			this.#queue = funcs;
		else
			this.#queue = [];
	}
	
	use = (func) => {
		this.#queue.push(func);
	}
	
	next = (...passables/*to be passed to next func*/) => {
		
		if(this.#index >= this.#queue.length) {
			this.#index = 0;
			return;
		}
		
		this.#queue[this.#index++](this.next, ...passables);
	}
}


module.exports = Sequencer;
module.exports = class Scripter
{
	constructor(scripts, options = {})
	{
		this.scripts = scripts;
		this.collection = options.collection;
		this.autosaveload = options.collection === undefined ? false : true;

		this.script_id = -1;
		this.step_id = 0;
		this.data = {};
		this.last_handle_value = undefined;
	}

	// return functions -------
	
		autohandle()
		{
			//this.last_handle_value = value;
			return "__autohandle__";
		}

		/*
		rehandle(value)
		{
			this.last_handle_value = value;
			return this._rehandle();
		}

		_rehandle()
		{
			//this.last_handle_value = value;
			return "__rehandle__"
		}
		*/

		error_out_of_scenario()
		{
			//this.last_handle_value = value;
			return "__error_out_of_scenario__";
		}

		terminate()
		{
			return "__terminate__";
		}

		handle_resolve(result)
		{
			return {result: result, marker: "__handle_resolve__"};
		}

		handle_reject(result)
		{
			return {result: result, marker: "__handle_reject__"};
		}

	//----------------------

	loadProgressForUser(user_id, info)
	{
		var promise;

		if( this.autosaveload )
		{
			var doc = this.collection.doc("" + user_id);
			//doc = pimp(doc);

			promise = doc.get()
			.then( obj =>
			{
				var scripter_data = {}

				if( (obj && obj.exists) )
					scripter_data = obj.data().scripter_data;
				else
					scripter_data = {};

				return scripter_data ? scripter_data : {};
			})
		} else
		{
			promise = Promise.resolve( info ? info : {} );
		}

		return promise.then( scripter_data =>
		{
			if( scripter_data.script_id === undefined )
				this.script_id = -1;
			else
				this.script_id = scripter_data.script_id;

			if( scripter_data.step_id === undefined )
				this.step_id = 0;
			else
				this.step_id = scripter_data.step_id;

			if( scripter_data.data === undefined )
				this.data = {};
			else
				this.data = JSON.parse(scripter_data.data);

			return true;
		})
		.catch( err=>
		{
			err.message = err.message + "\n" + "— Error when loading progress for user '" + user_id +"'";
			
			return Promise.reject(err);
		})
	}

	saveProgressForUser(user_id, info)
	{
		//console.log("saving in saveProgressForUser...")
		//console.log("script_id: " + this.script_id)
		//console.log("step_id: " + this.step_id)
		//console.log("curr_data: " + JSON.stringify(this.data) )

		var promise;

		var obj = 
		{
			script_id: this.script_id,
			step_id: this.step_id,
			data: JSON.stringify(this.data)
		}
		
		if( this.autosaveload )
		{
			var doc = this.collection.doc("" + user_id);
			doc = pimp(doc);

			promise = doc.update_create( {scripter_data: obj} );
		} else
		{
			//info = {};
			//console.log("Actually saving...")

			for( var thing in obj )
				info[thing] = obj[thing];

			//console.log( JSON.stringify(info) )

			promise = Promise.resolve(true);
		}

		return promise.then(()=>
		{
			return true;
		}).catch( err=>
		{
			err.message = err.message + "\n" + "— Error when saving progress for user '" + user_id +"'";
			
			return Promise.reject(err);
		})
		
	}

	//startForUser(user_id, script_id, step_id, obj, info)
	startForUser(user_id, script_step_id, opts)
	{
		// Reading and assuming parameters --------------------
		
		if( Array.isArray(script_step_id) )
		{
			var script_id = script_step_id[0];
			var step_id = script_step_id[1];
		
		} else
		{
			var script_id = script_step_id;
			var step_id = 0;
		}

		var payload = {};
		var state = {};

		if( opts !== undefined )
		{
			payload = opts.payload;
			state = opts.state;
		}


		//console.log("startForUser:")
		//console.log("passed payload: ", payload )
		//console.log("script_id: " + script_id)
		//console.log("step_id: " + step_id)
		//console.log("curr_data: ", this.data )

		if( step_id === undefined )
			step_id = 0;

		var INTRO_PROMISE;

		// Try to call intro 
		try
		{
			if( this.scripts[script_id][step_id].intro !== undefined )
				INTRO_PROMISE = Promise.resolve( this.scripts[script_id][step_id].intro(payload) );
			else
				// If no intro function defined, treat it like an intro with autohandle
				INTRO_PROMISE = Promise.resolve( this.autohandle() );
		}
		catch(err)
		{
			//err.message = err.message + "\n" + "— Error when calling intro of script '"+ script_id +"' step '"+step_id+"'";
			//err.message = `— Error when calling intro of script '${script_id}' step '${step_id}'\n${err.message}`;
			err.message = `${err.message}\nError when calling intro of script '${script_id}' step '${step_id}'`;
			return Promise.reject(err);
		}

		// If intro called successfully
		return INTRO_PROMISE
		.then( result => 
		{
			this.script_id = script_id;
			this.step_id = step_id;

			return this.saveProgressForUser(user_id, state)
			.then(()=>
			{		
				if( result == this.autohandle() )
				{
					return this.processForUser(user_id, 
							{
								payload: payload, 
								state: state, 
								noload: true
							})
				}
				else
					return result;
			})
		})
		.catch(err=>
		{
			err.message = err.message + "\n" + "— Error when starting script '"+ script_id +"' step '"+step_id+"'";
			return Promise.reject(err);
		})
	}



	//processForUser(user_id, obj, info, noload)
	processForUser(user_id, opts)
	{
		var payload = {};
		var state = {};
		var noload = false;

		if( opts !== undefined )
		{
			payload = opts.payload;
			state = opts.state;
			noload = opts.noload;
		}

		// console.log("processForUser:")
		// console.log("user_id: " + user_id)
		// console.log("curr_data: " + JSON.stringify(this.data) )

		var loaded_progress_promise;

		if( noload )
			loaded_progress_promise = Promise.resolve(true)
		else
			loaded_progress_promise = this.loadProgressForUser(user_id, state);

		return loaded_progress_promise.then(()=>
		{
			// console.log("loaded" + (noload?" (fake)":""))
			// console.log("script_id: " + this.script_id)
			// console.log("step_id: " + this.step_id)
			// console.log("data: " + JSON.stringify(this.data) )

			// -1 means the user is not in the scenario
			if( this.script_id < 0 || this.scripts === undefined )
			{
				return Promise.reject( this.error_out_of_scenario() );
			}
			
			var TERMINATOR_PROMISE;

			if( this.scripts[this.script_id][this.step_id].terminator )
			{
				try
				{
					TERMINATOR_PROMISE = Promise.resolve( this.scripts[this.script_id][this.step_id].terminator(payload) );
				}
				catch(err)
				{
					err.message = err.message + "\n" + "— Error when calling terminator of script '"+ this.script_id +"' step '"+this.step_id+"'";
					return Promise.reject(err);				
				}
			} 
			else
			{
				TERMINATOR_PROMISE = Promise.resolve(false);
			}

			return TERMINATOR_PROMISE
			.then( terminate => 
			{
				if( terminate == this.terminate() )
				{
					console.log("terminating...")
					return this._stop(user_id, state);
				} else
				{
							var PROMISE;

							try
							{
								PROMISE = Promise.resolve( this.scripts[this.script_id][this.step_id].handler(payload, noload) );
							}
							catch(err)
							{
								err.message = err.message + "\n" + "— Error when calling handler of script '"+ this.script_id +"' step '"+this.step_id+"'";
								return Promise.reject(err);				
							}

							return PROMISE
							.then( result => 
							{
								// if a handler didn't return with handle_success or handle_reject
								// marker defaults to __handle_reject__
								if( typeof result != 'object' )
									result = this.handle_reject(result);

								//console.log("RESULT IS: ", result)

								switch(result.marker)
								{
									/*
									case this._rehandle():
									{
										//console.log("REhandled with trueish")

										return this.saveProgressForUser(user_id, state)
										.then(()=>
										{
											//return this.processForUser(user_id, payload, state, true)
											//return true;
											return this.last_handle_value;
										})

									} break;
									*/

									case this.handle_resolve().marker:
									{
										//console.log("Handled with trueish")

										if( this._isThereNextStep() )
										{
											return this._nextStepForUser(user_id, payload, state);

										} else
										{
											return this._nextStepForUser(user_id, payload, state)
											.then(()=>
											{
												//console.log("RESULT AGAIN IS: ", result)

												return result.result;
											});
										}

									} break;

									case this.handle_reject().marker:
									default:
									{
										//console.log("Handled with falsish")

										//if( this.repeat_intro )
										if( this.scripts[this.script_id][this.step_id].reintro_on_fail )
											return this.startForUser(user_id, [this.script_id, this.step_id], 
																	{
																		payload: payload, 
																		state: state
																	})
											.then(()=>
											{
												//return false
												return result.result
											})
										else
											//return false
											return result.result
									} break;
								}

							})

				}
			})
		})
		.catch(err=>
		{
			// Throw -1 if not in scenario
			if( err == this.error_out_of_scenario() )
				throw err;

			err.message = err.message + "\n" + "— Error when processing script '"+ this.script_id +"' step '"+this.step_id+"'";
			return Promise.reject(err);
		})
	}

	_isThereNextStep()
	{
		if( this.scripts === undefined || this.script_id < 0 || this.scripts[this.script_id] === undefined || this.scripts[this.script_id][this.step_id+1] === undefined )
			return false;

		return true;
	}

	_nextStepForUser(user_id, payload, info)
	{
		if( this.scripts === undefined || this.script_id < 0 || this.scripts[this.script_id] === undefined || this.scripts[this.script_id][this.step_id+1] === undefined )
		{
			return this._stop(user_id, info);
			//return Promise.resolve();
		}

		return this.startForUser(user_id, [this.script_id, this.step_id+1], 
								{
									payload: payload, 
									state: info
								});
	}

	_stop(user_id, info)
	{
		//console.log("_stop");

		this.script_id = -1;
		this.step_id = 0;
		this.data = {};

		return this.saveProgressForUser(user_id, info)
		.then(()=>
		{		
			return true;
		})
	}	
}
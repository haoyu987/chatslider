/*
 * spa.model.js
 * Model module
 */
 
spa.model = (function () {
	'use strict';
	var
		configMap	= { anon_id	: 'a0' },
		stateMap	= {
			anon_user		: null,
			cid_serial		: 0,
			people_cid_map	: {},
			people_db		: TAFFY(),
			user			: null,
			is_connected	: false
		},
		
	isFakeData	= true,
	
	personProto, makeCid, clearPeopleDb, completeLogin,
	makePerson, removePerson, people, chat, initModule;
	
	// The people object API
	// ---------------------
	// The people object is available at spa.model.people.
	// The people object provides methods and events to manage
	// a collection of person objects. Its public methods includes:
	//		* get_user() - return the current user person object.
	//		  If the current user is not signed-in, an anonymous
	//		  person object is returned.
	//		* get_db() - return the TaffyDB database of all the person
	//		  objects - including the current user - presorted.
	//		* get_by_cid( <client_id> ) - return a person object with
	//		  provided unique id.
	//		* login( <user_name> ) - login as the user with the provided
	//		  user name. The current user object is changed to reflect
	//		  the new identity. Successful completion of login
	//		  publishes a 'spa-login' global custom event.
	//		* logout() - revert the current user object to anonymous.
	//		  This method publishes a 'spa-logout' global custom event.
	//
	personProto	= {
		get_is_user	: function () {
			return this.cid === stateMap.user.cid;
		},
		get_is_anon	: function () {
			return this.cid === stateMap.anon_user.cid;
		}
	};
	
	makeCid = function () {
		return 'c' + String( stateMap.cid_serial++ );
	};
	
	clearPeopleDb = function () {
		var user = stateMap.user;
		stateMap.people_db		= TAFFY();
		stateMap.people_cid_map	= {};
		if ( user ) {
			stateMap.people_db.insert( user );
			stateMap.people_cid_map[ user.id ] = user;
		}
	};
	
	completeLogin	= function ( user_list ) {
		var user_map = user_list[ 0 ];
		delete stateMap.people_cid_map[ user_map.cid ];
		stateMap.user.cid		= user_map._id;
		stateMap.user.id		= user_map._id;
		stateMap.user.css_map	= user_map.css_map;
		stateMap.people_cid_map[ user_map._id ] = stateMap.user;
		
		$.gevent.publish( 'spa-login', [ stateMap.user ] );
	};
	
	makePerson	= function ( person_map ) {
		var person,
			cid		= person_map.cid,
			css_map	= person_map.css_map,
			id		= person_map.id,
			name	= person_map.name;
			
		if ( cid === undefined || ! name ) {
			throw 'client id and name required';
		}
		
		person			= Object.create( personProto );
		person.cid		= cid;
		person.name		= name;
		person.css_map	= css_map;
		
		if ( id ) { person.id = id; }
		
		stateMap.people_cid_map[ cid ] = person;
		
		stateMap.people_db.insert( person );
		return person;
	};
	
	removePerson	= function ( person ) {
		if ( ! person ) { return false; }
		if ( person.id === configMap.anon_id ) {
			return false;
		}
		
		stateMap.people_db({ cid : person.cid }).remove();
		if ( person.cid ) {
			delete stateMap.people_cid_map[ person.cid ];
		}
		return true;
	}
	
	people	= (function () {
		var get_by_cid, get_db, get_user, login, logout;
		
		get_by_cid = function ( cid ) {
			return stateMap.people_cid_map[ cid ];
		};
		
		get_db	= function () { return stateMap.people_db; };
		
		get_user= function () { return stateMap.user; };
		
		login	= function ( name ) {
			var sio = isFakeData ? spa.fake.mockSio : spa.data.getSio();
			
			stateMap.user = makePerson({
				cid		: makeCid(),
				css_map	: {top : 25, left : 25, 'background-color' : '#8f8'},
				name	: name
			});
			
			sio.on( 'userupdate', completeLogin );
			
			sio.emit( 'adduser', {
				cid		: stateMap.user.cid,
				css_map	: stateMap.user.css_map,
				name	: stateMap.user.name
			});
		};
		
		logout	= function () {
			var is_removed, user = stateMap.user;
			
			is_removed		= removePerson( user );
			stateMap.user	= stateMap.anon_user;
			
			$.gevent.publish( 'spa-logout', [ user ] );
			return is_removed;
		};
		
		return {
			get_by_cid	: get_by_cid,
			get_db		: get_db,
			get_user	: get_user,
			login		: login,
			logout		: logout
		};
	}());
	
	// The chat object API
	// -------------------
	// The chat object is available at spa.model.chat.
	// The chat object provides methods and events to manage
	// chat messaging. Its public methods include:
	//		* join() - joins the chat room. This routine sets up
	//		  the chat protocol with the backend including publishers
	//		  for 'spa-listchange' and 'spa-updatechat' global custom
	//		  events. If the current user is anonymous, join() aborts
	//		  and returns false.
	//		* get_chatee() - return the person object with whom the
	//		  user is chatting. If there is no chatee, null is returned.
	//		* set_chatee( <person_id> ) - set the chatee to the person
	//		  identified by person_id. If the person_id does not exist
	//		  in the people list, the chatee is set to null. If the person
	//		  requested is already the chatee, it returns false. It publishes
	//		  a 'spa-setchatee' global custom event.
	//		* send_msg( <msg_text> ) - send a message to the chatee.
	//		  It publishes a 'spa-updatechat' global custom event.
	//		  If the user is anonymous or the chatee is null, it aborts and
	//		  returns false.
	//		* update_avatar( <update_avtr_map> ) - send the update_avtr_map
	//		  to the backend. This results in an 'spa-listchange' event
	//		  which publishes the updated people list and avatar information
	//		  (the css_map in the person objects). The update_avtr_map
	//		  must have the form { person_id : person_id, css_map : css_map }.
	//
	
	initModule	= function () {
		var i, people_list, person_map;
		
		// initialize anonymous person
		stateMap.anon_user	= makePerson({
			cid	: configMap.anon_id,
			id	: configMap.anon_id,
			name: 'anonymous'
		});
		stateMap.user	= stateMap.anon_user;
		
		if ( isFakeData ) {
			people_list	= spa.fake.getPeopleList();
			for ( i = 0; i < people_list.length; i++ ) {
				person_map	= people_list[ i ];
				makePerson({
					cid		: person_map._id,
					css_map	: person_map.css_map,
					id		: person_map._id,
					name	: person_map.name
				});
			}
		}
	};
	
	return {
		initModule	: initModule,
		people		: people
	};
}()); 
var http = require('http');
var _ = require('underscore');
var urlParser = require('url');

var Forwarder = function(config, parser, cb){
  this.proxy = null;
  this.server = null;

  if (!config.urls) {
  	throw new Error('missing urls from config');
  }

  if (!config.listenPort) {
  	throw new Error('missing listenPort from config');
  }

  this.urls = config.urls;
  this.parser = parser;

  this.init(config.listenPort, cb);
};

Forwarder.prototype.init = function(port, cb) {

	var self = this;

	// Init server
	self.server = require('http').createServer(function(req, res) {

		var myBody = "";

		req.on('data', function(chunk) {
			myBody += chunk;
    });
    
    req.on('end', function() {

    	var forwardTo = [];

      var jsonData = JSON.parse(myBody);
      var result = self.parser.parseRequest(jsonData);

      var watchingRepo = self.urls[ result.repository ];
      if (watchingRepo) {
      	// console.log('I received a push for a repo that I am supposed to proxy. Let\'s see...');

      	var watchingBranches = _.keys(watchingRepo);

      	result.branches.forEach(function(pushedBranch) {

      		if (watchingBranches.indexOf(pushedBranch) > -1) {
      			// console.log('Branch ' + pushedBranch + ', let\'s forward this push to ' + watchingRepo[pushedBranch]);
      			forwardTo.push( watchingRepo[pushedBranch] );
      		}

      	});

      	// console.log('Okay, amount of forwards to do: ' + forwardTo.length);
      	self.forwardMany(forwardTo, jsonData, null, function(err, result) {
      		// console.log('Finished forwarding! :)', result);
      		
      		res.setHeader('Content-Type', 'plain/text');
	    		res.end(result);
      	});


      } else {
      	// console.log('I received a push for an unknown repo.');
      }
  
    });
    
	});

	self.server.listen(port);

	self.server.on('listening', function() {
		return cb(null);
	});

	self.server.on('error', function(err) {
		return cb(err);
	});
};

Forwarder.prototype.forwardMany = function(targets, body, lastResponse, cb) {
	var self = this;

	if (targets.length === 0) {

		return cb(null, lastResponse);

	} else {

		var nextTarget = targets.shift();
		// console.log('Performing forward to ' + nextTarget);
		self.request(nextTarget, body, function(err, response) {
			self.forwardMany(targets, body, response, cb);
		});

	}

};

Forwarder.prototype.request = function(url, body, cb) {
	var parsed = urlParser.parse(url);

	var options = {
		hostname: parsed.hostname
		, port: parsed.port
		, method: 'POST'
	};

	var req =	http.request(options, function(res) {
		var body = "";
	  // res.setEncoding('utf8');

	  res.on('data', function(chunk) {
	      body += chunk;
	  });

	  res.on('end', function() {
	      cb(null, body);
	  });

	});

	req.write(JSON.stringify(body));
	req.end();

}

Forwarder.prototype.stop = function(cb) {
	if (this.server._handle) {
		this.server.close(function() {
			return cb(null);
		});	
	}
};

module.exports = Forwarder;
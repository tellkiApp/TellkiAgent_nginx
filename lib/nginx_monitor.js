/**
 * This script was developed by Guberni and is part of Tellki's Monitoring Solution
 *
 * March, 2015
 * 
 * Version 1.0
 * 
 * DESCRIPTION: Monitor Nginx stub stats
 *
 * SYNTAX: node nginx_monitor.js <METRIC_STATE> <HOST> <PORT> <PATH> <USER_NAME> <PASS_WORD>
 * 
 * EXAMPLE: node nginx_monitor.js "1,1,1,1,1,1,1" "10.10.2.5" "8080" "/nginx_status" "username" "password"
 *
 * README:
 *		<METRIC_STATE> is generated internally by Tellki and it's only used by Tellki default monitors: 1 - metric is on; 0 - metric is off
 *		<HOST> nginx ip address or hostname
 *		<PORT> nginx port
 *		<PATH> nginx stub stats path
 *		<USER_NAME> nginx user to connect
 *		<PASS_WORD> nginx user password
 */

 var fs = require('fs');
 
 /**
  * Metrics.
  */
var metrics = [];
metrics['ActiveConnections']   =  { id: '1383:Active Connections:4',       ratio: false };
metrics['AcceptedConnections'] =  { id: '1384:Accepted Connections/Sec:4', ratio: true };
metrics['HandledConnections']  =  { id: '1385:Handled Connections/Sec:4',  ratio: true };
metrics['TotalRequests']       =  { id: '1386:Requests/Sec:4',             ratio: true };
metrics['ConnectionsReading']  =  { id: '1387:Connections Reading:4',      ratio: false };
metrics['ConnectionsWriting']  =  { id: '1388:Connections Writing:4',      ratio: false };
metrics['ConnectionsWaiting']  =  { id: '1389:Connections Waiting:4',      ratio: false };

var tempDir = '/tmp';
var sleepTime = 1000;
 
/**
 * Entry point.
 */
(function() {
	try
	{
		monitorInput(process.argv);
	}
	catch(err)
	{	
		if(err instanceof InvalidParametersNumberError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof InvalidAuthenticationError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof HTTPError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof UnknownHostError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else
		{
			console.log(err.message);
			process.exit(1);
		}
	}
}).call(this)

// ############################################################################
// PARSE INPUT

/**
 * Verify number of passed arguments into the script.
 */
function monitorInput(args)
{
	args = args.slice(2);
	if(args.length != 6)
		throw new InvalidParametersNumberError();
	
	monitorInputProcess(args);
}

/**
 * Process the passed arguments and send them to monitor execution.
 * Receive: arguments to be processed
 */
function monitorInputProcess(args)
{
	//<METRIC_STATE>
	var metricState = args[0].replace("\"", "");
	var tokens = metricState.split(",");
	var metricsExecution = new Array(7);
	for(var i in tokens)
		metricsExecution[i] = (tokens[i] === "1");
	
	// <HOST>
	var hostname = args[1];
	
	// <PORT>
	var port = args[2];
	if (port.length === 0)
		port = "80";
	
	// <PATH>
	var path = args[3];
	
	// <USER_NAME>
	var username = args[4];
	username = username.length === 0 ? "" : username;
	username = username === "\"\"" ? "" : username;
	if(username.length === 1 && username === "\"")
		username = "";
	
	// <PASS_WORD>
	var passwd = args[5];
	passwd = passwd.length === 0 ? "" : passwd;
	passwd = passwd === "\"\"" ? "" : passwd;
	if(passwd.length === 1 && passwd === "\"")
		passwd = "";
	
	if(username === '{0}')
		username = passwd = "";

	// Create request object to be executed.	
	var request = new Object();
	request.checkMetrics = metricsExecution;
	request.hostname = hostname;
	request.port = port;
	request.path = path;
	request.username = username;
	request.passwd = passwd;
	
	// Call monitor.
	monitorNginx(request);
}

// ############################################################################
// GET METRICS

/**
 * Retrieve metrics information
 * Receive: object request containing configuration
 *
 * HTTP request to retrieve data
 * Receive:
 * - request: object containing request configuration
 */
function monitorNginx(request) 
{
	var http = require("http");
			
	// Create HTTP request options.
	var options = {
		hostname: request.hostname,
		path: request.path,
		method: "GET",
		port: request.port,
		auth: request.username + ':' + request.passwd, 
	};
		
	// Do HTTP request.
	var req = http.request(options, function (res) {
		var data = '';
		
		// HTTP response status code.
		var code = res.statusCode;
		
		if (code != 200)
		{
			if (code == 401)
			{
				errorHandler(new InvalidAuthenticationError());
			}
			else
			{
				var exception = new HTTPError();
				exception.message = "Response error (" + code + ").";
				errorHandler(exception);
			}
		}
		
		res.setEncoding('utf8');
		
		// Receive data.
		res.on('data', function (chunk) {
			data += chunk;
		});
		
		// On HTTP request end.
		res.on('end', function (res) {
			parseData(data, request);
		});
	});
	
	// On Error.
	req.on('error', function (e) {
		if(e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED')
			errorHandler(new UnknownHostError()); 
		else
			errorHandler(e);
	});

	req.end();
}

/**
 * Parse response from stub stats.
 * Receive:
 * - response data to process
 * - object request containing configuration
 */
function parseData(data, request)
{
	var activeRegex = /^Active connections:\s+(\d+)/;
	var readingWritingRegex = /^Reading:\s+(\d+).*Writing:\s+(\d+).*Waiting:\s+(\d+)/;
	var handledRegex = /^\s+(\d+)\s+(\d+)\s+(\d+)/;

	var result = {};
	var lines = data.split(/\n/);
	lines.forEach(function(line) {
		var matches;
		if (activeRegex.test(line))
		{
			matches = activeRegex.exec(line);
			result.active = matches[1];
		}
		else if (readingWritingRegex.test(line))
		{
			matches = readingWritingRegex.exec(line);
			result.reading = matches[1];
			result.writing = matches[2];
			result.waiting = matches[3];
		}
		else if (handledRegex.test(line))
		{
			matches = handledRegex.exec(line);
			result.accepted = matches[1];
			result.handled = matches[2];
			result.total = matches[3];
		}
	});

	var results = [];
	
	if (request.checkMetrics[0])
		results.push(createMetric('ActiveConnections', result.active));
	if (request.checkMetrics[1])
		results.push(createMetric('AcceptedConnections', result.accepted));
	if (request.checkMetrics[2])
		results.push(createMetric('HandledConnections', result.handled));
	if (request.checkMetrics[3])
		results.push(createMetric('TotalRequests', result.total));
	if (request.checkMetrics[4])
		results.push(createMetric('ConnectionsReading', result.reading));
	if (request.checkMetrics[5])
		results.push(createMetric('ConnectionsWriting', result.writing));
	if (request.checkMetrics[6])
		results.push(createMetric('ConnectionsWaiting', result.waiting));
	
	var jsonString = '[';
	var dateTime = new Date().toISOString();
	
	for (var i in results)
	{
		var result = results[i];
		
		jsonString += '{';
		jsonString += '"variableName":"' + result.key + '",';
		jsonString += '"metricUUID":"' + result.id + '",';
		jsonString += '"timestamp":"' + dateTime + '",';
		jsonString += '"value":"' + result.val + '"';
		jsonString += '},';
	}
	
	if(jsonString.length > 1)
		jsonString = jsonString.slice(0, jsonString.length - 1);
				
	jsonString += ']';
		
	processDeltas(request, jsonString);
}

function createMetric(metricKey, val)
{
	if(val === undefined)
	{
		var e = new MetricNotFoundError();
		e.message = 'Unable to collect metric ' + metrics[metricKey].id;
		errorHandler(e);
	}

	var metric = new Object();
	metric.id = metrics[metricKey].id;
	metric.key = metricKey;
	metric.val = val;

	return metric;
}

// ############################################################################
// OUTPUT METRICS

/**
 * Send metrics to console
 * Receive: metrics list to output
 */
function output(metrics)
{
	for (var i in metrics)
	{
		var out = "";
		var metric = metrics[i];
		
		out += metric.id;
		out += "|";
		out += metric.value;
		out += "|";
		
		console.log(out);
	}
}

// ############################################################################
// RATE PROCESSING

/**
 * Process performance results
 * Receive: 
 * - request object containing configuration
 * - retrived results
 */
function processDeltas(request, results)
{
	var file = getFile(request.hostname, request.port);
	var toOutput = [];
	
	if (file)
	{		
		var previousData = JSON.parse(file);
		var newData = JSON.parse(results);
			
		for(var i = 0; i < newData.length; i++)
		{
			var endMetric = newData[i];
			var initMetric = null;
			
			for(var j = 0; j < previousData.length; j++)
			{
				if(previousData[j].metricUUID === newData[i].metricUUID)
				{
					initMetric = previousData[j];
					break;
				}
			}
			
			if (initMetric != null)
			{
				var deltaValue = getDelta(initMetric, endMetric);
				
				var rateMetric = new Object();
				rateMetric.id = endMetric.metricUUID;
				rateMetric.timestamp = endMetric.timestamp;
				rateMetric.value = deltaValue;
				
				toOutput.push(rateMetric);
			}
			else
			{	
				var rateMetric = new Object();
				rateMetric.id = endMetric.metricUUID;
				rateMetric.timestamp = endMetric.timestamp;
				rateMetric.value = 0;
				
				toOutput.push(rateMetric);
			}
		}
		
		setFile(request.hostname, request.port, results);

		for (var m = 0; m < toOutput.length; m++)
		{
			for (var z = 0; z < newData.length; z++)
			{
				var systemMetric = metrics[newData[z].variableName];
				
				if (systemMetric.ratio === false && newData[z].metricUUID === toOutput[m].id)
				{
					toOutput[m].value = newData[z].value;
					break;
				}
			}
		}

		output(toOutput)
	}
	else
	{
		setFile(request.hostname, request.port, results);

		// Execute again.
		setTimeout(function() {
			monitorInput(process.argv);
		}, sleepTime);
	}
}

/**
 * Calculate ratio metric's value
 * Receive: 
 * - previous value
 * - current value
 * - 
 */
function getDelta(initMetric, endMetric)
{
	var deltaValue = 0;
	var decimalPlaces = 2;
	var date = new Date().toISOString();
	
	if (parseFloat(endMetric.value) < parseFloat(initMetric.value))
	{	
		deltaValue = parseFloat(endMetric.value).toFixed(decimalPlaces);
	}
	else
	{	
		var elapsedTime = (new Date(endMetric.timestamp).getTime() - new Date(initMetric.timestamp).getTime()) / 1000;	
		deltaValue = ((parseFloat(endMetric.value) - parseFloat(initMetric.value))/elapsedTime).toFixed(decimalPlaces);
	}
	
	return deltaValue;
}

/**
 * Get last results if any saved
 * Receive: 
 * - hostname or ip address
 * - port
 */
function getFile(hostname, port)
{
	var dirPath =  __dirname +  tempDir + "/";
	var filePath = dirPath + ".nginx_"+ hostname +"_"+ port +".dat";
	
	try
	{
		fs.readdirSync(dirPath);
		
		var file = fs.readFileSync(filePath, 'utf8');
		
		if (file.toString('utf8').trim())
		{
			return file.toString('utf8').trim();
		}
		else
		{
			return null;
		}
	}
	catch(e)
	{
		return null;
	}
}

/**
 * Save current metrics values to be used to calculate ratios on next runs
 * Receive: 
 * - hostname or ip address
 * - port
 * - retrieved result
 */
function setFile(hostname, port, json)
{
	var dirPath =  __dirname +  tempDir + "/";
	var filePath = dirPath + ".nginx_"+ hostname +"_"+ port +".dat";
		
	if (!fs.existsSync(dirPath)) 
	{
		try
		{
			fs.mkdirSync( __dirname + tempDir);
		}
		catch(e)
		{
			var ex = new CreateTmpDirError(e.message);
			ex.message = e.message;
			errorHandler(ex);
		}
	}

	try
	{
		fs.writeFileSync(filePath, json);
	}
	catch(e)
	{
		var ex = new WriteOnTmpFileError(e.message);
		ex.message = e.message;
		errorHandler(ex);
	}
}

// ############################################################################
// ERROR HANDLER

/**
 * Used to handle errors of async functions
 * Receive: Error/Exception
 */
function errorHandler(err)
{
	if(err instanceof InvalidAuthenticationError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof HTTPError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof UnknownHostError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof MetricNotFoundError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof CreateTmpDirError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof WriteOnTmpFileError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else
	{
		console.log(err.message);
		process.exit(1);
	}
}

// ############################################################################
// EXCEPTIONS

/**
 * Exceptions used in this script.
 */
function InvalidParametersNumberError() {
    this.name = "InvalidParametersNumberError";
    this.message = "Wrong number of parameters.";
	this.code = 3;
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;

function InvalidAuthenticationError() {
    this.name = "InvalidAuthenticationError";
    this.message = "Invalid authentication.";
	this.code = 2;
}
InvalidAuthenticationError.prototype = Object.create(Error.prototype);
InvalidAuthenticationError.prototype.constructor = InvalidAuthenticationError;

function HTTPError() {
    this.name = "HTTPError";
    this.message = "";
	this.code = 19;
}
HTTPError.prototype = Object.create(Error.prototype);
HTTPError.prototype.constructor = HTTPError;

function UnknownHostError() {
    this.name = "UnknownHostError";
    this.message = "Unknown host.";
	this.code = 26;
}
UnknownHostError.prototype = Object.create(Error.prototype);
UnknownHostError.prototype.constructor = UnknownHostError;

function MetricNotFoundError() {
    this.name = "MetricNotFoundError";
    this.message = "";
	this.code = 8;
}
MetricNotFoundError.prototype = Object.create(Error.prototype);
MetricNotFoundError.prototype.constructor = MetricNotFoundError;

function CreateTmpDirError()
{
	this.name = "CreateTmpDirError";
    this.message = "";
	this.code = 21;
}
CreateTmpDirError.prototype = Object.create(Error.prototype);
CreateTmpDirError.prototype.constructor = CreateTmpDirError;


function WriteOnTmpFileError()
{
	this.name = "WriteOnTmpFileError";
    this.message = "";
	this.code = 22;
}
WriteOnTmpFileError.prototype = Object.create(Error.prototype);
WriteOnTmpFileError.prototype.constructor = WriteOnTmpFileError;
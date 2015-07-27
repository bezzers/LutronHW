var net = require('net');
var _ = require('lodash');
var server = {};
var connection = {};
var buffer = [];

// Repeatedly checks the buffer of server responses to a record that matches the target light
function checkBuffer (address, brightness, callback) {
    var timeStamp = Date.now();

    // Check the buffer every 100 milliseconds for a result
    var searchBuffer = setInterval(function() {
        var latestResult = _.findLast(buffer, function (element) {
            return element.light == address && element.timeStamp >= timeStamp && (element.brightness == brightness || brightness == null)
        });
        if (latestResult != undefined) {
            clearInterval(searchBuffer);
            clearTimeout (timeout);
            callback(false, latestResult);
        }
    }, 100);

    // Stop checking after five seconds and return an error
    var timeout = setTimeout(function() {
        clearInterval(searchBuffer);
        callback('No response from address ' + address, null)
    }, 5000);
}

// Opens the connection to the server and sets up a listener for data events
function open (options, callback) {
    server = net.connect({host:options.host, port:options.port, family:4}, function() {
        server.setKeepAlive();
        server.write(options.username + "," + options.password + '\n');

        server.on('data', function(data) {

            // Add notifications of dimmer levels to a buffer
            splitData = data.toString().split('\r\n');
            _.each(splitData, function(line) {
                if (line.substr(0,2) == 'DL') { // keeps only dimmer level reporting responses
                    buffer[buffer.length] = {
                        light: line
                            .replace(/(.*?\[|\].*)/g, '') // extracts the light number alone
                            .replace(/:/g, '.') // replaces colons with dots
                            .replace(/\d{2}/g, function(str) { // reduces each two-character text number to an actual number
                                return Number(str)
                            }),
                        brightness: line.replace(/.*?\],/g, '')*1,
                        timeStamp: Date.now()
                    };
                }
            });

            // Make sure the buffer does not grow indefinitely
            if (buffer.length > 256) {
                buffer.shift(buffer.length-256)
            }
        });

        callback();
    });
}

// Writes commands to the server and reconnects if necessary
function write (command) {
    try {
        server.write(command);
    }
    catch (err) {
        open(connection, function() {
            server.write(command);
        })
    }
}

module.exports = {

    init: function (options, callback) {
        connection = options;
        open(connection, callback);
    },

    setLight: function(light, brightness, callback) {
        var command = 'fadedim'
            + ',' + brightness
            + ',' + 2 // speed
            + ',' + 0 // delay
            + ',' + light
            + '\n';
        write(command);
        console.log('Setting light ' + light + ' to ' + brightness + '%');
        checkBuffer(light, brightness, callback);
    },

    getLight: function(light, callback) {
        var success = false;
        var command = 'rdl'
            + ',' + light
            + '\n';
        write(command);
        console.log('Reading brightness for ' + light);
        checkBuffer(light, null, callback);
    },

    setShade: function(shade, level, callback) {
        var command = 'fadedim'
            + ',' + level
            + ',0,0'
            + ',' + shade
            + '\n';
        write(command);
        console.log('Setting shade ' + shade + ' to ' + level + '%');
        checkBuffer(shade, level, callback);
    },

    close: function() {
        server.end();
    }
};
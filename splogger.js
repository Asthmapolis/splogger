/*!
 * Based on:
 * js-logger - http://github.com/jonnyreeves/js-logger
 * Jonny Reeves, http://jonnyreeves.co.uk/
 * js-logger may be freely distributed under the MIT license.
 */
(function (global) {
    'use strict';

    function postLog(url, data) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4 && xhr.status == 200) {
                alert(xhr.responseText);
            }
        };
        xhr.send(JSON.stringify(data));
    }

    // Load toastr
    var toastr = window.toastr;

    // Top level module for the global, static logger instance.
    var Splogger = { };

    // For those that are at home that are keeping score.
    Splogger.VERSION = '0.0.1';

    // Function which handles all incoming log messages.
    var logHandler;
    var serverLogHandler;
    var serverUrl;

    // Map of ContextualSplogger instances by name; used by Splogger.get() to return the same named instance.
    var contextualSploggersByNameMap = {};

    // Polyfill for ES5's Function.bind.
    var bind = function(scope, func) {
        return function() {
            return func.apply(scope, arguments);
        };
    };

    // Super exciting object merger-matron 9000 adding another 100 bytes to your download.
    var merge = function () {
        var args = arguments, target = args[0], key, i;
        for (i = 1; i < args.length; i++) {
            for (key in args[i]) {
                if (!(key in target) && args[i].hasOwnProperty(key)) {
                    target[key] = args[i][key];
                }
            }
        }
        return target;
    };

    // Helper to define a logging level object; helps with optimisation.
    var defineLogLevel = function(value, name) {
        return { value: value, name: name };
    };

    // Predefined logging levels.
    Splogger.DEBUG = defineLogLevel(1, 'DEBUG');
    Splogger.INFO = defineLogLevel(2, 'INFO');
    Splogger.SUCCESS = defineLogLevel(3, 'SUCCESS');
    Splogger.TIME = defineLogLevel(4, 'TIME');
    Splogger.WARNING = defineLogLevel(5, 'WARNING');
    Splogger.ERROR = defineLogLevel(8, 'ERROR');
    Splogger.OFF = defineLogLevel(99, 'OFF');

    // Inner class which performs the bulk of the work; ContextualSplogger instances can be configured independently
    // of each other.
    var ContextualSplogger = function(defaultContext) {
        this.context = defaultContext;
        this.setLevel(defaultContext.filterLevel);
        this.setServerLevel(defaultContext.filterLevel);
        this.log = this.info;  // Convenience alias.
    };

    ContextualSplogger.prototype = {
        // Changes the current logging level for the logging instance.
        setLevel: function (newLevel) {
            // Ensure the supplied Level object looks valid.
            if (newLevel && 'value' in newLevel) {
                this.context.filterLevel = newLevel;
            }
        },

        // Changes the current level at which logs aer sent to the server URL
        setServerLevel: function (newLevel) {
            // Ensure the supplied Level object looks valid.
            if (newLevel && 'value' in newLevel) {
                this.context.serverFilterLevel = newLevel;
            }
        },

        // Is the logger configured to output messages at the supplied level?
        enabledFor: function (lvl) {
            var filterLevel = this.context.filterLevel;
            return lvl.value >= filterLevel.value;
        },

        // Is the logger configured to output messages at the supplied level?
        serverEnabledFor: function (lvl) {
            var filterLevel = this.context.serverFilterLevel;
            return lvl.value >= filterLevel.value;
        },

        debug: function () {
            return this.invoke(Splogger.DEBUG, arguments);
        },

        info: function () {
            return this.invoke(Splogger.INFO, arguments);
        },

        success: function () {
            return this.invoke(Splogger.SUCCESS, arguments);
        },

        warning: function () {
            return this.invoke(Splogger.WARNING, arguments);
        },

        error: function () {
            return this.invoke(Splogger.ERROR, arguments);
        },

        time: function (label) {
            if (typeof label === 'string' && label.length > 0) {
                return this.invoke(Splogger.TIME, [ label, 'start' ]);
            }
        },

        timeEnd: function (label) {
            if (typeof label === 'string' && label.length > 0) {
                return this.invoke(Splogger.TIME, [ label, 'end' ]);
            }
        },

        // Invokes the logger callback if it's not being filtered.
        invoke: function (level, msgArgs) {
            this.level = level;
            this.msgArgs = msgArgs;

            if (logHandler && this.enabledFor(level)) {
                logHandler(msgArgs, merge({ level: level }, this.context));
            }

            if (serverLogHandler && this.serverEnabledFor(level)) {
                serverLogHandler(msgArgs, merge({ level: level }, this.context), this.serverUrl);
            }

            return this;
        },

        toast: function(options) {
            var messages = Array.prototype.slice.call(this.msgArgs);
            var message = messages[0];
            var data = messages[1];
            var title = messages[2];

            if (data) {
                message += '<br>' + JSON.stringify(data);
            }

            var level = this.level.name.toLowerCase();
            level = level === 'debug' ? 'info' : level;
            if (toastr) {
                toastr[level](message, title, options);
            }
        }
    };

    // Protected instance which all calls to the to level `Splogger` module will be routed through.
    var globalSplogger = new ContextualSplogger({ filterLevel: Splogger.OFF });

    // Configure the global Splogger instance.
    (function() {
        // Shortcut for optimisers.
        var L = Splogger;

        L.enabledFor = bind(globalSplogger, globalSplogger.enabledFor);
        L.debug = bind(globalSplogger, globalSplogger.debug);
        L.time = bind(globalSplogger, globalSplogger.time);
        L.timeEnd = bind(globalSplogger, globalSplogger.timeEnd);
        L.info = bind(globalSplogger, globalSplogger.info);
        L.success = bind(globalSplogger, globalSplogger.success);
        L.warning = bind(globalSplogger, globalSplogger.warning);
        L.error = bind(globalSplogger, globalSplogger.error);

        // Don't forget the convenience alias!
        L.log = L.info;
    }());

    // Set the global logging handler.  The supplied function should expect two arguments, the first being an arguments
    // object with the supplied log messages and the second being a context object which contains a hash of stateful
    // parameters which the logging function can consume.
    Splogger.setHandler = function (func) {
        logHandler = func;
    };

    // Set the global server logging handler.  The supplied function should expect two arguments, the first being an arguments
    // object with the supplied log messages and the second being a context object which contains a hash of stateful
    // parameters which the logging function can consume.
    Splogger.setServerHandler = function (func) {
        serverLogHandler = func;
    };

    Splogger.setServerUrl = function (url) {
        serverUrl = url;
    };

    // Sets the global logging filter level which applies to *all* previously registered, and future Splogger instances.
    // (note that named loggers (retrieved via `Splogger.get`) can be configured independently if required).
    Splogger.setLevel = function(level) {
        // Set the globalSplogger's level.
        globalSplogger.setLevel(level);

        // Apply this level to all registered contextual loggers.
        for (var key in contextualSploggersByNameMap) {
            if (contextualSploggersByNameMap.hasOwnProperty(key)) {
                contextualSploggersByNameMap[key].setLevel(level);
            }
        }
    };

    // Sets the global server logging filter level which applies to *all* previously registered, and future Splogger instances.
    // (note that named loggers (retrieved via `Splogger.get`) can be configured independently if required).
    Splogger.setServerLevel = function(level) {
        // Set the globalSplogger's level.
        globalSplogger.setServerLevel(level);

        // Apply this level to all registered contextual loggers.
        for (var key in contextualSploggersByNameMap) {
            if (contextualSploggersByNameMap.hasOwnProperty(key)) {
                contextualSploggersByNameMap[key].setServerLevel(level);
            }
        }
    };

    // Retrieve a ContextualSplogger instance.  Note that named loggers automatically inherit the global logger's level,
    // default context and log handler.
    Splogger.get = function (name) {
        // All logger instances are cached so they can be configured ahead of use.
        return contextualSploggersByNameMap[name] ||
            (contextualSploggersByNameMap[name] = new ContextualSplogger(merge({ name: name }, globalSplogger.context)));
    };

    // Configure and example a Default implementation which writes to the `window.console` (if present).  The
    // `options` hash can be used to configure the default logLevel and provide a custom message formatter.
    Splogger.useDefaults = function(options) {
        options = options || {};

        options.formatter = options.formatter || function defaultMessageFormatter(messages, context) {
            // Prepend the logger's name to the log message for easy identification.
            var message = messages[0];
            var data = messages[1];
            var title = messages[2];

            messages = [];

            if (title) messages.push(title);
            messages.push(message);
            if(data) messages.push(data);

            if (context.name) {
                messages.unshift('[' + context.name + ']');
            }

            return messages;
        };

        options.serverUrl = options.serverUrl || null;

        // Check for the presence of a logger.
        if (typeof console === 'undefined') {
            return;
        }

        // Map of timestamps by timer labels used to track `#time` and `#timeEnd()` invocations in environments
        // that don't offer a native console method.
        var timerStartTimeByLabelMap = {};

        // Support for IE8+ (and other, slightly more sane environments)
        var invokeConsoleMethod = function (hdlr, messages) {
            Function.prototype.apply.call(hdlr, console, messages);
        };

        Splogger.setLevel(options.defaultLevel || Splogger.DEBUG);
        Splogger.setServerLevel(options.defaultServerLevel || Splogger.WARN);
        Splogger.setServerUrl(options.serverUrl);
        Splogger.setHandler(function(messages, context) {
            // Convert arguments object to Array.
            messages = Array.prototype.slice.call(messages);

            var hdlr = console.log;
            var timerLabel;

            if (context.level === Splogger.TIME) {
                timerLabel = (context.name ? '[' + context.name + '] ' : '') + messages[0];

                if (messages[1] === 'start') {
                    if (console.time) {
                        console.time(timerLabel);
                    }
                    else {
                        timerStartTimeByLabelMap[timerLabel] = new Date().getTime();
                    }
                }
                else {
                    if (console.timeEnd) {
                        console.timeEnd(timerLabel);
                    }
                    else {
                        invokeConsoleMethod(hdlr, [ timerLabel + ': ' +
                            (new Date().getTime() - timerStartTimeByLabelMap[timerLabel]) + 'ms' ]);
                    }
                }
            }
            else {
                // Delegate through to custom warn/error loggers if present on the console.
                if (context.level === Splogger.WARNING && console.warn) {
                    hdlr = console.warn;
                } else if (context.level === Splogger.ERROR && console.error) {
                    hdlr = console.error;
                } else if (context.level === Splogger.INFO && console.info) {
                    hdlr = console.info;
                } else if (context.level === Splogger.SUCCESS && console.info) {
                    hdlr = console.info;
                }

                messages = options.formatter(messages, context);
                invokeConsoleMethod(hdlr, messages);
            }
        });
        Splogger.setServerHandler(function(messages, context) {
            messages = Array.prototype.slice.call(messages);

            var body = {
                level: context.level.name.toLowerCase(),
                data: messages[1],
                message: messages[0],
                title: messages[2],
                location: window.location.pathname + window.location.hash
            };

            postLog(serverUrl, body);
        });
    };

    // Export to popular environments boilerplate.
    if (typeof define === 'function' && define.amd) {
        define(Splogger);
    }
    else if (typeof module !== 'undefined' && module.exports) {
        module.exports = Splogger;
    }
    else {
        Splogger._prevSplogger = global.Splogger;

        Splogger.noConflict = function () {
            global.Splogger = Splogger._prevSplogger;
            return Splogger;
        };

        global.Splogger = Splogger;
    }
}(this));
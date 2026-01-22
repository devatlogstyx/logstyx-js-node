// logstyx-js-node/auto-instrument.js (ENHANCED VERSION)

const Module = require('module');

let isInstrumented = false
let logstyxInstance = null;
let instrumentConfig = {};

function setupAutoInstrumentation() {
    if (isInstrumented) {
        return;
    }

    const originalRequire = Module.prototype.require;

    Module.prototype.require = function (id) {
        const module = originalRequire.apply(this, arguments);

        if (!logstyxInstance) {
            return module;
        }

        if (id === 'express' && !module.__logstyx_instrumented) {
            module.__logstyx_instrumented = true;
            return wrapExpress(module, instrumentConfig);
        }

        if (id === 'fastify' && !module.__logstyx_instrumented) {
            module.__logstyx_instrumented = true;
            return wrapFastify(module, instrumentConfig);
        }

        return module;
    };

    isInstrumented = true;
    console.log('[Logstyx] Auto-instrumentation hook installed');
}

function configure(logstyx, options = {}) {
    logstyxInstance = logstyx;

    instrumentConfig = {
        ...instrumentConfig,
        ignorePaths: options.ignorePaths || instrumentConfig.ignorePaths || ['/health', '/metrics'],
        shouldIgnore: options.shouldIgnore || (() => false),
        slowRequestThreshold: options.slowRequestThreshold || instrumentConfig.slowRequestThreshold || 1000,
        redactFields: options.redactFields || instrumentConfig.redactFields || ['password', 'token', 'authorization', 'secret', 'apikey', 'api_key'],
        buildRequestPayload: options.buildRequestPayload || instrumentConfig.buildRequestPayload || defaultBuildRequestPayload,
        contextHook: options.contextHook || instrumentConfig.contextHook || null,
        ...options
    };

    console.log('[Logstyx] Auto-instrumentation configured');
}

function updateConfig(options = {}) {
    instrumentConfig = {
        ...instrumentConfig,
        ...options
    };
    console.log('[Logstyx] Auto-instrumentation config updated');
}

/**
 * Wrap Express framework with enhanced error tracking
 */
function wrapExpress(express, config) {
    const originalExpress = express;

    return function wrappedExpress() {
        const app = originalExpress();

        // 🔥 NEW: Add error capture middleware at the START
        app.use((req, res, next) => {
            const startTime = Date.now();
            let logged = false;

            // 🔥 NEW: Store error on request object
            req._logstyxError = null;

            const isIgnoredPath = config.ignorePaths.some(path => req.path.startsWith(path));
            if (isIgnoredPath) {
                return next();
            }

            const originalSend = res.send;
            const originalJson = res.json;
            const originalEnd = res.end;

            function logRequest(method, responseBody) {
                if (logged) return;

                logged = true;

                const statusCode = res.statusCode;
                const responseTime = Date.now() - startTime;
                const requestPayload = buildFinalPayload(req, config);
                const isSlow = responseTime > config.slowRequestThreshold

                res.isSlow = isSlow

                const isIgnoredCustom = config.shouldIgnore(req, res);
                if (isIgnoredCustom) {
                    return;
                }

                const logData = {
                    title: `${req.method} ${req.originalUrl}`,
                    ...requestPayload,
                    body: redactObject(req.body, config.redactFields),
                    response: (method === 'json' || method === 'send')
                        ? redactObject(responseBody, config.redactFields)
                        : null,
                    responseTime,
                    statusCode,
                    isSlow
                };

                // 🔥 NEW: Add error details if available
                if (req._logstyxError) {
                    logData.error = {
                        message: req._logstyxError.message,
                        stack: req._logstyxError.stack,
                        name: req._logstyxError.name,
                        code: req._logstyxError.code
                    };
                }

                // Determine log level and message
                if (statusCode >= 500) {
                    logData.message = req._logstyxError
                        ? req._logstyxError.message
                        : 'Server error occurred';
                    logstyxInstance.critical(logData);
                } else if (statusCode >= 400) {
                    logData.message = statusCode === 404
                        ? 'Route not found'
                        : (req._logstyxError?.message || 'Client error');
                    logstyxInstance.error(logData);
                } else if (responseTime > config.slowRequestThreshold) {
                    logData.message = `Slow request detected (${responseTime}ms)`;
                    logstyxInstance.warning(logData);
                } else {
                    logData.message = 'Request completed successfully';
                    logstyxInstance.info(logData);
                }
            }

            res.send = function (...args) {
                logRequest('send', args[0]);
                return originalSend.apply(this, args);
            };

            res.json = function (...args) {
                logRequest('json', args[0]);
                return originalJson.apply(this, args);
            };

            res.end = function (...args) {
                logRequest('end', args[0]);
                return originalEnd.apply(this, args);
            };

            next();
        });

        // 🔥 NEW: Add error-capturing middleware at the END
        // This must be added AFTER user routes, so we return a modified app
        const originalListen = app.listen;
        app.listen = function (...args) {
            // Inject error handler before actually listening
            app.use((err, req, res, next) => {
                // Store error for logging
                req._logstyxError = err;

                // Set status code if not already set
                if (!res.statusCode || res.statusCode === 200) {
                    res.statusCode = err.status || err.statusCode || 500;
                }

                // Pass to next error handler (user's or Express default)
                next(err);
            });

            return originalListen.apply(this, args);
        };

        return app;
    };
}

/**
 * Wrap Fastify framework with enhanced error tracking
 */
function wrapFastify(fastify, config) {
    const originalFastify = fastify;

    return function wrappedFastify(opts) {
        const instance = originalFastify(opts);

        instance.addHook('onRequest', async (request, reply) => {
            request._logstyxStartTime = Date.now();
            request._logstyxError = null; // 🔥 NEW: Store error
        });

        // 🔥 NEW: Capture errors
        instance.addHook('onError', async (request, reply, error) => {
            request._logstyxError = error;
        });

        instance.addHook('onResponse', async (request, reply) => {
            const isIgnoredPath = config.ignorePaths.some(path => request.url.startsWith(path));

            if (isIgnoredPath) {
                return;
            }
            const responseTime = Date.now() - request._logstyxStartTime;
            const statusCode = reply.statusCode;
            const isSlow = responseTime > config.slowRequestThreshold
            reply.isSlow = responseTime;
            const isIgnoredCustom = config.shouldIgnore(request, reply);

            if (isIgnoredCustom) {
                return
            }

            const requestPayload = buildFinalPayloadForFastify(request, config);

            const logData = {
                title: `${request.method} ${request.url}`,
                ...requestPayload,
                responseTime,
                statusCode,
                isSlow,
                body: redactObject(request.body, config.redactFields)
            };

            // 🔥 NEW: Add error details if available
            if (request._logstyxError) {
                logData.error = {
                    message: request._logstyxError.message,
                    stack: request._logstyxError.stack,
                    name: request._logstyxError.name,
                    code: request._logstyxError.code
                };
            }

            // Determine log level and message
            if (statusCode >= 500) {
                logData.message = request._logstyxError
                    ? request._logstyxError.message
                    : 'Server error occurred';
                logstyxInstance.critical(logData);
            } else if (statusCode >= 400) {
                logData.message = statusCode === 404
                    ? 'Route not found'
                    : (request._logstyxError?.message || 'Client error');
                logstyxInstance.error(logData);
            } else if (responseTime > config.slowRequestThreshold) {
                logData.message = `Slow request detected (${responseTime}ms)`;
                logstyxInstance.warning(logData);
            } else {
                logData.message = 'Request completed successfully';
                logstyxInstance.info(logData);
            }
        });

        return instance;
    };
}

function defaultBuildRequestPayload(req) {
    const context = {
        method: req.method,
        url: req.url,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id || req.headers['x-request-id'],
        user: findUserInRequest(req),
        admin: findAdminInRequest(req),
        session: req.session ? { id: req.session.id } : null,
        query: req.query,
        params: req.params
    };
    return context;
}

function findUserInRequest(req) {
    const userSources = [
        req.user,
        req.auth?.user,
        req.session?.user,
        req.locals?.user,
        req.context?.user,
        req.currentUser,
        req.account,
        req.profile
    ];
    const user = userSources.find(source =>
        source && (source.id || source.email || source.username)
    );
    return user || null;
}

function findAdminInRequest(req) {
    return req.admin ||
        (req.user?.isAdmin ? req.user : null) ||
        req.session?.admin ||
        null;
}

function buildFinalPayload(req, config) {
    let context = config.buildRequestPayload(req);
    if (config.contextHook) {
        const customPayload = config.contextHook(req);
        context = { ...context, ...customPayload };
    }
    return redactObject(context, config.redactFields);
}

function buildFinalPayloadForFastify(request, config) {
    const reqAdapter = {
        method: request.method,
        url: request.url,
        path: request.url,
        ip: request.ip,
        headers: request.headers,
        id: request.id,
        query: request.query,
        params: request.params,
        body: request.body,
        session: request.session || null,
        user: request.user || null,
        get: (header) => request.headers[header.toLowerCase()]
    };

    let context = config.buildRequestPayload(reqAdapter);

    if (config.contextHook) {
        const customPayload = config.contextHook(reqAdapter);
        context = { ...context, ...customPayload };
    }

    return redactObject(context, config.redactFields);
}

function redactObject(obj, redactFields) {
    if (!obj || typeof obj !== 'object') return obj;

    if (obj.toObject && typeof obj.toObject === 'function') {
        obj = obj.toObject();
    }

    const out = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
        if (redactFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
            out[key] = '[REDACTED]';
        } else if (value !== null && typeof value === 'object') {
            out[key] = redactObject(value, redactFields);
        } else {
            out[key] = value;
        }
    }

    return out;
}

setupAutoInstrumentation();

module.exports = { configure, setupAutoInstrumentation, updateConfig };
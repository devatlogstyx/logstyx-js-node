// logstyx-js-node/auto-instrument.js

const Module = require('module');

let isInstrumented = false
let logstyxInstance = null;
let instrumentConfig = {};

/**
 * Setup auto-instrumentation hook
 * This patches Module.prototype.require to intercept framework imports
 */
function setupAutoInstrumentation() {
    if (isInstrumented) {
        return;
    }

    const originalRequire = Module.prototype.require;

    Module.prototype.require = function(id) {
        const module = originalRequire.apply(this, arguments);

        // Only instrument if we have a logstyx instance configured
        if (!logstyxInstance) {
            return module;
        }

        // Instrument Express
        if (id === 'express' && !module.__logstyx_instrumented) {
            module.__logstyx_instrumented = true;
            return wrapExpress(module, instrumentConfig);
        }

        // Instrument Fastify
        if (id === 'fastify' && !module.__logstyx_instrumented) {
            module.__logstyx_instrumented = true;
            return wrapFastify(module, instrumentConfig);
        }

        return module;
    };

    isInstrumented = true;
    console.log('[Logstyx] Auto-instrumentation hook installed');
}

/**
 * Configure the logstyx instance and options
 * @param {Object} logstyx - Logstyx instance from logstyx-js-core
 * @param {Object} options - Instrumentation options
 */
function configure(logstyx, options = {}) {
    logstyxInstance = logstyx;
    
    // Merge with existing config (allows late configuration updates)
    instrumentConfig = {
        ...instrumentConfig,
        ignorePaths: options.ignorePaths || instrumentConfig.ignorePaths || ['/health', '/metrics'],
        slowRequestThreshold: options.slowRequestThreshold || instrumentConfig.slowRequestThreshold || 1000,
        redactFields: options.redactFields || instrumentConfig.redactFields || ['password', 'token', 'authorization', 'secret', 'apikey', 'api_key'],
        buildRequestPayload: options.buildRequestPayload || instrumentConfig.buildRequestPayload || defaultBuildRequestPayload,
        contextHook: options.contextHook || instrumentConfig.contextHook || null,
        ...options
    };
    
    console.log('[Logstyx] Auto-instrumentation configured');
}

/**
 * Update configuration without replacing logstyx instance
 * Useful when using --require flag and wanting to configure options later
 * @param {Object} options - Configuration options to update
 */
function updateConfig(options = {}) {
    instrumentConfig = {
        ...instrumentConfig,
        ...options
    };
    console.log('[Logstyx] Auto-instrumentation config updated');
}

/**
 * Wrap Express framework
 */
function wrapExpress(express, config) {
    const originalExpress = express;

    return function wrappedExpress() {
        const app = originalExpress();

        // Inject logging middleware at the start
        app.use((req, res, next) => {
            const startTime = Date.now();
            let logged = false;

            // Skip ignored paths
            if (config.ignorePaths.some(path => req.path.startsWith(path))) {
                return next();
            }

            const originalSend = res.send;
            const originalJson = res.json;
            const originalEnd = res.end;

            function logRequest(method, responseBody) {
                if (logged) return;
                logged = true;

                const responseTime = Date.now() - startTime;
                const statusCode = res.statusCode;
                
                // Build request payload using the same structure as express middleware
                const requestPayload = buildFinalPayload(req, config);

                const logData = {
                    title: `${req.method} ${req.originalUrl}`,
                    ...requestPayload,
                    body: redactObject(req.body, config.redactFields),
                    response: (method === 'json' || method === 'send') 
                        ? redactObject(responseBody, config.redactFields) 
                        : null,
                    responseTime,
                    statusCode,
                    isSlow: responseTime > config.slowRequestThreshold
                };

                // Determine log level and message
                if (statusCode >= 500) {
                    logData.message = 'Server error occurred';
                    logstyxInstance.critical(logData);
                } else if (statusCode >= 400) {
                    logData.message = statusCode === 404 ? 'Route not found' : 'Client error';
                    logstyxInstance.error(logData);
                } else if (responseTime > config.slowRequestThreshold) {
                    logData.message = `Slow request detected (${responseTime}ms)`;
                    logstyxInstance.warning(logData);
                } else {
                    logData.message = 'Request completed successfully';
                    logstyxInstance.info(logData);
                }
            }

            res.send = function(...args) {
                logRequest('send', args[0]);
                return originalSend.apply(this, args);
            };

            res.json = function(...args) {
                logRequest('json', args[0]);
                return originalJson.apply(this, args);
            };

            res.end = function(...args) {
                logRequest('end', args[0]);
                return originalEnd.apply(this, args);
            };

            next();
        });

        return app;
    };
}

/**
 * Wrap Fastify framework
 */
function wrapFastify(fastify, config) {
    const originalFastify = fastify;

    return function wrappedFastify(opts) {
        const instance = originalFastify(opts);

        // Add hooks for logging
        instance.addHook('onRequest', async (request, reply) => {
            request._logstyxStartTime = Date.now();
        });

        instance.addHook('onResponse', async (request, reply) => {
            // Skip ignored paths
            if (config.ignorePaths.some(path => request.url.startsWith(path))) {
                return;
            }

            const responseTime = Date.now() - request._logstyxStartTime;
            const statusCode = reply.statusCode;

            // Build request payload using same structure as Express
            const requestPayload = buildFinalPayloadForFastify(request, config);

            const logData = {
                title: `${request.method} ${request.url}`,
                ...requestPayload,
                responseTime,
                statusCode,
                isSlow: responseTime > config.slowRequestThreshold
            };

            logData.body = redactObject(request.body, config.redactFields);

            // Determine log level and message
            if (statusCode >= 500) {
                logData.message = 'Server error occurred';
                logstyxInstance.critical(logData);
            } else if (statusCode >= 400) {
                logData.message = statusCode === 404 ? 'Route not found' : 'Client error';
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

/**
 * Default request payload builder (matches Express middleware structure)
 */
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

/**
 * Find user in request (matches Express middleware logic)
 */
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

/**
 * Find admin in request (matches Express middleware logic)
 */
function findAdminInRequest(req) {
    return req.admin ||
        (req.user?.isAdmin ? req.user : null) ||
        req.session?.admin ||
        null;
}

/**
 * Build final payload with custom context hook
 */
function buildFinalPayload(req, config) {
    let context = config.buildRequestPayload(req);
    if (config.contextHook) {
        const customPayload = config.contextHook(req);
        context = { ...context, ...customPayload };
    }
    return redactObject(context, config.redactFields);
}

/**
 * Build final payload for Fastify (adapter for Fastify request object)
 */
function buildFinalPayloadForFastify(request, config) {
    // Create an Express-like request object adapter
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
        // Fastify doesn't have these by default, but allow custom logic to access them
        session: request.session || null,
        user: request.user || null,
        // Express-like get method
        get: (header) => request.headers[header.toLowerCase()]
    };

    // Use the same buildRequestPayload function
    let context = config.buildRequestPayload(reqAdapter);
    
    if (config.contextHook) {
        const customPayload = config.contextHook(reqAdapter);
        context = { ...context, ...customPayload };
    }
    
    return redactObject(context, config.redactFields);
}

/**
 * Redact sensitive fields from objects (matches Express middleware logic)
 */
function redactObject(obj, redactFields) {
    if (!obj || typeof obj !== 'object') return obj;

    // Convert Mongoose documents to plain objects
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

// Setup the hook immediately when this module loads
setupAutoInstrumentation();

module.exports = { configure, setupAutoInstrumentation, updateConfig };
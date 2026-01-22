# Logstyx JS SDK for Node.js

Welcome to the **logstyx-js-node** SDK! This package provides a way to interact with the Logstyx API using Node.js, with support for both **manual logging** and **automatic HTTP request logging**.

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Manual Logging](#manual-logging)
  - [Auto-Instrumentation (Zero-Code Logging)](#auto-instrumentation-zero-code-logging)
- [Configuration Options](#configuration-options)
- [API Reference](#api-reference)
- [License](#license)

## Installation

To install this package, you can use npm. Make sure you have Node.js version 18 or higher installed.

```bash
npm install github:devatlogstyx/logstyx-js-node#release
```

## Quick Start

### Manual Logging (Traditional)

```javascript
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY'
});

// Log events manually
logstyx.info({ message: "User logged in", userId: 123 });
logstyx.error({ message: "Payment failed", error: err.message });
```

### Auto-Instrumentation (Zero-Code Logging)

Automatically log all HTTP requests without manual `logstyx.info()` calls:

```javascript
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    autoInstrument: true  // 🔥 Enable automatic logging
});

const express = require('express');
const app = express();

app.get('/api/orders', (req, res) => {
    res.json({ orders: [] });
    // ✅ Automatically logged: method, path, status, duration
});

app.listen(3000);
```

**No manual logging needed!** All requests are automatically captured.

## Usage

### Manual Logging

Perfect for logging custom business events, database operations, or any application-specific events.

```javascript
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    endpoint: 'https://api.logstyx.com/v1/logs', // optional
    captureUncaught: true,              // Catch uncaught exceptions
    captureUnhandledRejections: true    // Catch unhandled promise rejections
});

// Send logs at different levels
logstyx.info({ message: "This is an info log!" });
logstyx.warning({ message: "This is a warning log!" });
logstyx.error({ message: "This is an error log!" });
logstyx.critical({ message: "System failure!" });

// Add persistent context
logstyx.setContext({ userId: 123, environment: 'production' });

// All subsequent logs will include this context
logstyx.info({ message: "User action" }); // Includes userId and environment

// Clear context when needed
logstyx.clearContext(['userId']); // Remove specific keys
logstyx.clearContext();           // Clear all context
```

### Auto-Instrumentation (Zero-Code Logging)

Automatically capture HTTP requests, responses, errors, and performance metrics.

#### Method 1: Regular Setup

**⚠️ Important:** Require `logstyx-js-node` BEFORE requiring Express/Fastify.

```javascript
// ✅ CORRECT: Logstyx first
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    autoInstrument: true,
    
    // Optional: Configure what to capture
    ignorePaths: ['/health', '/metrics'],
    slowRequestThreshold: 1000,
    redactFields: ['password', 'token', 'creditCard'],
    //Custom ignore logic (e.g., skip successful GET requests)
    shouldIgnore: (req,res) => req.method === 'GET' && res.statusCode >=400,
    // Add custom context to all auto-logged requests
    contextHook: (req) => ({
        tenantId: req.headers['x-tenant-id'],
        orgId: req.user?.organizationId
    })
});

// Then require your framework
const express = require('express');
const app = express();

app.get('/api/users', (req, res) => {
    res.json({ users: [] }); // Auto-logged!
});

app.listen(3000);
```

```javascript
// ❌ WRONG: Framework loaded first won't work
const express = require('express'); // Already cached!
const logstyx = require('logstyx-js-node')({ autoInstrument: true });
```

#### Method 2: Using `--require` Flag (Recommended)

Use Node.js `--require` flag to ensure auto-instrumentation works regardless of require order:

```bash
node --require logstyx-js-node/register app.js
```

**package.json:**
```json
{
  "scripts": {
    "start": "node --require logstyx-js-node/register app.js",
    "dev": "nodemon --require logstyx-js-node/register app.js"
  }
}
```

**app.js (any order now works!):**
```javascript
const express = require('express');
const app = express();

// Configure logstyx anywhere
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    autoInstrument: true
});

app.get('/api/orders', (req, res) => {
    res.json({ orders: [] }); // Auto-logged!
});

app.listen(3000);
```

#### What Gets Logged Automatically?

- **INFO**: Successful requests (status 2xx)
- **WARNING**: Slow requests (duration > `slowRequestThreshold`)
- **ERROR**: Client errors (status 4xx)
- **CRITICAL**: Server errors (status 5xx)

Each log includes:
- HTTP method, path, URL
- Status code and response time
- IP address and user agent
- Request/response body (with field redaction)
- Headers (with field redaction)
- Query parameters and route params
- User context (if available via `req.user`, `req.session`, etc.)
- Custom context (via `contextHook`)

**Example auto-logged payload:**
```javascript
{
  title: "GET /api/orders",
  message: "Request completed successfully",
  method: "GET",
  url: "/api/orders",
  path: "/api/orders",
  ip: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  requestId: "abc-123",
  user: { id: 456, email: "user@example.com" },
  session: { id: "sess_xyz" },
  query: { page: 1 },
  params: {},
  body: { /* request body with redacted fields */ },
  response: { /* response body with redacted fields */ },
  responseTime: 45,
  statusCode: 200,
  isSlow: false,
  // Custom fields from contextHook
  tenantId: "tenant_123",
  environment: "production"
}
```

#### Supported Frameworks

- ✅ **Express** - Fully supported
- ✅ **Fastify** - Fully supported
- 🔜 Koa, Hapi, NestJS - Coming soon

#### Combining Auto + Manual Logging

```javascript
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    autoInstrument: true,
    
    // Add tenant context to all auto-logs
    contextHook: (req) => ({
        tenantId: req.headers['x-tenant-id']
    })
});

const express = require('express');
const app = express();

app.post('/api/orders', async (req, res) => {
    // HTTP request/response is auto-logged with tenantId
    
    // Add custom business logic logs
    logstyx.info({ 
        title: 'Order processing started',
        orderId: req.body.orderId 
    });
    
    try {
        const order = await processOrder(req.body);
        res.json(order); // Auto-logged as INFO
    } catch (error) {
        // Custom error log with additional context
        logstyx.error({
            title: 'Order processing failed',
            orderId: req.body.orderId,
            error: error.message
        });
        throw error; // Also auto-logged as CRITICAL
    }
});

app.listen(3000);
```

### Advanced: Custom Context Hook

The `contextHook` allows you to inject custom data into every auto-logged request:

```javascript
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    autoInstrument: true,
    
    contextHook: (req) => {
        return {
            // Multi-tenant support
            tenantId: req.headers['x-tenant-id'],
            orgId: req.user?.organizationId,
            
            // Environment info
            environment: process.env.NODE_ENV,
            version: process.env.APP_VERSION,
            
            // Feature flags
            features: req.user?.enabledFeatures || [],
            
            // Request tracing
            traceId: req.headers['x-trace-id'],
            
            // Custom business context
            subscription: req.user?.subscription?.tier
        };
    }
});
```

All auto-logged requests will now include these custom fields alongside the standard request information.

### Advanced: Custom Payload Builder

Override the entire request payload structure:

```javascript
const logstyx = require('logstyx-js-node')({
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    autoInstrument: true,
    
    buildRequestPayload: (req) => {
        // Custom payload structure
        return {
            // Basic request info
            method: req.method,
            endpoint: req.path,
            
            // Custom user detection
            userId: req.user?.id || req.headers['x-user-id'],
            
            // Custom session handling
            sessionId: req.cookies?.sessionId,
            
            // Include only specific headers
            correlationId: req.headers['x-correlation-id'],
            
            // Business-specific fields
            storeId: req.headers['x-store-id'],
            region: req.headers['x-region']
        };
    }
});
```

## Configuration Options

### Basic Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `projectId` | string | ✅ Yes | - | Your Logstyx project ID |
| `apiKey` | string | ✅ Yes | - | API key for authentication (server-side) |
| `endpoint` | string | No | `https://api.logstyx.com/v1/logs` | Logstyx API endpoint |
| `captureUncaught` | boolean | No | `false` | Catch uncaught exceptions |
| `captureUnhandledRejections` | boolean | No | `false` | Catch unhandled promise rejections |

### Auto-Instrumentation Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoInstrument` | boolean | `false` | Enable automatic HTTP logging |
| `ignorePaths` | string[] | `['/health', '/metrics']` | Don't log these paths |
| `slowRequestThreshold` | number | `1000` | Warn if request exceeds this (ms) |
| `shouldIgnore` | function | `() => false` | Custom function to skip successful logs (e.g., ignore GETs if no error) |
| `redactFields` | string[] | `['password', 'token', ...]` | Fields to redact from logs |
| `buildRequestPayload` | function | `defaultBuilder` | Custom request payload builder |
| `contextHook` | function | `null` | Add custom context to every log |

### Example: Full Configuration

```javascript
const logstyx = require('logstyx-js-node')({
    // Required
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    
    // Optional
    endpoint: 'https://api.logstyx.com/v1/logs',
    
    // Error handling
    captureUncaught: true,
    captureUnhandledRejections: true,
    
    // Auto-instrumentation
    autoInstrument: true,
    ignorePaths: ['/health', '/metrics', '/favicon.ico'],
    // Ignore all successful GET requests to reduce noise
    shouldIgnore: (req,res) => req.method === 'GET' && res.statusCode >=400,
    slowRequestThreshold: 2000,
    redactFields: [
        'password',
        'token',
        'authorization',
        'secret',
        'apiKey',
        'creditCard',
        'ssn'
    ],
    
    // Custom context hook - adds fields to every auto-logged request
    contextHook: (req) => ({
        tenantId: req.headers['x-tenant-id'],
        environment: process.env.NODE_ENV,
        version: process.env.APP_VERSION
    }),
    
    // Custom payload builder - override default request payload structure
    buildRequestPayload: (req) => ({
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        // ... custom fields
    })
});
```

## API Reference

### Methods

#### `info(data)`
Send an information log.

```javascript
logstyx.info({ message: "User logged in", userId: 123 });
```

#### `warning(data)`
Send a warning log.

```javascript
logstyx.warning({ message: "High memory usage", memoryUsage: '85%' });
```

#### `error(data)`
Send an error log.

```javascript
logstyx.error({ message: "Database connection failed", error: err.message });
```

#### `critical(data)`
Send a critical log.

```javascript
logstyx.critical({ message: "System shutdown", reason: "Out of memory" });
```

#### `send(level, data)`
Send a log with a custom level.

```javascript
logstyx.send('INFO', { message: "Custom log" });
```

#### `setContext(ctx)`
Set persistent context for all subsequent logs.

```javascript
logstyx.setContext({ userId: 123, environment: 'production' });
```

#### `clearContext(keys?)`
Clear context keys or all context.

```javascript
logstyx.clearContext(['userId']);  // Remove specific keys
logstyx.clearContext();             // Clear all
```

## Troubleshooting

### Auto-instrumentation not working?

**Check load order:**
- Make sure `logstyx-js-node` is required BEFORE Express/Fastify
- Or use `--require logstyx-js-node/register` flag

### Logs not appearing?

1. Verify `projectId` and `apiKey` are correct
2. Check network connectivity to the endpoint
3. Look for console errors
4. Ensure the path isn't in `ignorePaths`

### Too many logs?

1. Add paths to ignore:
```javascript
ignorePaths: ['/health', '/metrics', '/favicon.ico', '/static/*']
```
2. Ignore specific methods: 
Use shouldIgnore: (req,res) => req.method === 'GET' && res.statusCode >=400. This will silence successful GET requests while still logging GET errors (5xx/4xx).

### Sensitive data in logs?

Add fields to redact:
```javascript
redactFields: ['password', 'ssn', 'creditCard', 'apiKey', 'token']
```

## License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for more details.

---

**Need help?** Check out the [Logstyx Documentation](https://docs.logstyx.com) or open an issue on GitHub.
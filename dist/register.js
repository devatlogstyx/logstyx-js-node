// logstyx-js-node/register.js

/**
 * Pre-load registration file for --require flag
 * 
 * Usage:
 *   node --require logstyx-js-node/register app.js
 * 
 * This ensures auto-instrumentation hooks are installed BEFORE
 * any user code runs, allowing Express/Fastify to be required
 * in any order.
 */

const { setupAutoInstrumentation } = require('./logstyx-js-node');

// Setup immediately
setupAutoInstrumentation();

console.log('[Logstyx] Pre-loaded via --require flag. Configure in your app with autoInstrument: true');
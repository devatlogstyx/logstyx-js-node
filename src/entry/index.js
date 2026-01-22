//@ts-check
const os = require("os");
const { generateSignature } = require("./../lib/node");
const useLogstyx = require("logstyx-js-core");
const { configure, setupAutoInstrumentation } = require("../lib/auto-instrument");

const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
    throw new Error(
        "Logstyx SDK requires Node.js version 18 or higher. Please upgrade your Node.js runtime."
    );
}

module.exports = (options) => {

    let device;

    device = {
        type: "node",
        origin: null,
        os: os.type(),
        platform: os.platform(),
        browser: null,
        screen: null
    };

    const logstyx = useLogstyx({
        ...options,
        device,
        signatureFunc: generateSignature,
    });

    if (options?.captureUncaught === true) {
        try {
            if (typeof process !== "undefined" && typeof window === "undefined") {
                process.on("uncaughtException", (err) =>
                    logstyx.critical({
                        title: err?.name || "Unknown Error",
                        message: err?.message,
                        stack: err?.stack || null
                    })
                );
            }
        } catch (e) {
            console.error(e);
        }
    }

    if (options?.captureUnhandledRejections === true) {
        try {
            const handler = (reason) => {
                const message = reason instanceof Error ? reason.message : String(reason);
                const stack = reason instanceof Error ? reason.stack : undefined;
                const title = reason instanceof Error ? reason.name : "Unhandled Rejection";
                logstyx.critical({
                    title, message, stack
                });
            };

            process.on("unhandledRejection", handler);
        } catch (e) {
            console.error(e);
        }
    }

    // Configure auto-instrumentation if enabled
    if (options?.autoInstrument === true) {
        configure(logstyx, {
            captureHeaders: options.captureHeaders,
            captureBody: options.captureBody,
            ignorePaths: options.ignorePaths,
            slowRequestThreshold: options.slowRequestThreshold,
            redactFields: options.redactFields
        });
    }

    return logstyx;
};

module.exports.setupAutoInstrumentation = setupAutoInstrumentation
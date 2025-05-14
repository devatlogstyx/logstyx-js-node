//@ts-check
const os = require("os");
const { generateSignature } = require("./../lib/node");
const useLogstyx = require("logstyx-js-core")

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


    return useLogstyx({
        ...options,
        device,
        signatureFunc: generateSignature,
    })
}
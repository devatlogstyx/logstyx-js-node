//@ts-check
const { num2Int } = require("../helper/function");
const crypto = require("crypto")

exports.generateSignature = (projectId, apiKey, body = {}) => {
    const timestamp = new Date().getTime();

    let params = JSON.stringify(body);

    const Hash = projectId + params + num2Int(timestamp);
    const signature = crypto
        .createHmac(`SHA256`, apiKey)
        .update(Hash)
        .digest("hex")
        .toUpperCase();

    return {
        timestamp,
        signature
    }
}
# Logstyx JS SDK for Node.js

Welcome to the **logstyx-js-node** SDK! This package provides a way to interact with the Logstyx API using Node.js.

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [License](#license)

## Installation

To install this package, you can use npm. Make sure you have Node.js version 18 or higher installed.

```bash
npm install github:devatlogstyx/logstyx-js-node
```

## Usage

To use the SDK, require it in your Node.js project and provide the necessary options. Here's a basic example:

```javascript
const useLogstyx = require('logstyx-js-node');

const options = {
    projectId: 'YOUR_PROJECT_ID',
    apiKey: 'YOUR_API_KEY',
    // other options
};

const logstyx = useLogstyx(options);


// Send an info log
logstyx.info({ message: "This is an info log!" });

// Send a warning log
logstyx.warning({ message: "This is a warning log!" });

// Send an error log
logstyx.error({ message: "This is an error log!" });

```

Make sure to replace `YOUR_PROJECT_ID` and `YOUR_API_KEY` with actual credentials from Logstyx.

### Parameters

- `options`: An object containing the following properties:
  - `projectId`: The unique identifier for your project (required).
  - `apiKey`: Your API key for authentication (required for server).
  - `endpoint`: API endpoint to send logs to (default: "https://api.logstyx.com/v1/logs").
  - `captureUncaught` : default false
  - `captureUnhandledRejections` : default false

### Methods

- `info(data)`: Sends an information log.
- `warning(data)`: Sends a warning log.
- `error(data)`: Sends an error log.
- `critical(data)`: Sends a critical log.
- `send(level, data)`: Send a log with the specified level and data.
- `setContext(ctx)`: Set additional context for logging.
- `clearContext(keys)`: Clear specified context keys or all context.

## License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for more details.

---
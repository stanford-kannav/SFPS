require("dotenv").config();

const app = require("./app");

const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`SFPS is running on http://${HOST}:${PORT}`);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

function shutdown(signal) {
  console.log(`SFPS received ${signal}; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

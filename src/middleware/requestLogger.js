/**
 * Request Logger Middleware
 * Logs all incoming requests with method, URL, and timestamp
 */
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  
  console.log(`[${timestamp}] ${method} ${url}`);
  
  next();
};

module.exports = requestLogger;

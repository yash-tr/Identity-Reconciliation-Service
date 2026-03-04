require('dotenv').config();
const app = require('./src/app');
const config = require('./src/config/environment');

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

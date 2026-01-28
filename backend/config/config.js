require('dotenv').config();

const baseConfig = {
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'akademik',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  logging: false
};

module.exports = {
  development: { ...baseConfig },
  test: { ...baseConfig, logging: false },
  production: { ...baseConfig, logging: false }
};

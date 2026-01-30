const jwt = require('jsonwebtoken');

const buildAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      roles: user.roles || []
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
};

const { v4: uuidv4 } = require('uuid');

const buildRefreshToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      tokenType: 'refresh',
      jti: uuidv4()
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

module.exports = {
  buildAccessToken,
  buildRefreshToken
};

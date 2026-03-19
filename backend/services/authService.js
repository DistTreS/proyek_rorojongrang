const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Role, RefreshToken } = require('../models');
const { getUserRoles } = require('../config/rbac');
const { buildAccessToken, buildRefreshToken } = require('../utils/token');
const { serviceError } = require('../utils/serviceError');

const findUserByIdentifier = async (identifier) => {
  return User.findOne({
    where: {
      [Op.or]: [{ username: identifier }, { email: identifier }]
    },
    include: [{ model: Role }]
  });
};

const createStoredRefreshToken = async (userId, refreshToken) => {
  const decoded = jwt.decode(refreshToken);
  return RefreshToken.create({
    userId,
    token: refreshToken,
    expiresAt: new Date(decoded.exp * 1000)
  });
};

const issueUserTokens = async (user) => {
  const roles = getUserRoles(user);
  const accessToken = buildAccessToken({ id: user.id, username: user.username, roles });
  const refreshToken = buildRefreshToken({ id: user.id });

  await createStoredRefreshToken(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
    roles
  };
};

const loginUser = async ({ identifier, password }) => {
  if (!identifier || !password) {
    throw serviceError(400, 'Identifier and password required');
  }

  const user = await findUserByIdentifier(identifier);
  if (!user || !user.isActive) {
    throw serviceError(401, 'Invalid credentials');
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    throw serviceError(401, 'Invalid credentials');
  }

  return issueUserTokens(user);
};

const refreshUserSession = async ({ refreshToken }) => {
  if (!refreshToken) {
    throw serviceError(400, 'Refresh token required');
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw serviceError(401, 'Invalid refresh token');
  }

  const stored = await RefreshToken.findOne({ where: { token: refreshToken } });
  if (!stored || stored.revokedAt) {
    throw serviceError(401, 'Refresh token revoked');
  }

  const user = await User.findByPk(payload.sub, { include: [{ model: Role }] });
  if (!user || !user.isActive) {
    throw serviceError(401, 'User inactive');
  }

  const nextTokens = await issueUserTokens(user);
  await stored.update({ revokedAt: new Date() });

  return nextTokens;
};

const logoutUserSession = async ({ refreshToken }) => {
  if (refreshToken) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { token: refreshToken } });
  }

  return { message: 'Logged out' };
};

module.exports = {
  loginUser,
  logoutUserSession,
  refreshUserSession
};

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Role, RefreshToken } = require('../models');
const { buildAccessToken, buildRefreshToken } = require('../utils/token');

const login = async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Identifier and password required' });
  }

  const user = await User.findOne({
    where: {
      [Op.or]: [{ username: identifier }, { email: identifier }]
    },
    include: [{ model: Role }]
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const roles = user.Roles?.map((role) => role.name) || [];
  const accessToken = buildAccessToken({ id: user.id, username: user.username, roles });
  const refreshToken = buildRefreshToken({ id: user.id });

  const decoded = jwt.decode(refreshToken);
  await RefreshToken.create({
    userId: user.id,
    token: refreshToken,
    expiresAt: new Date(decoded.exp * 1000)
  });

  return res.json({ accessToken, refreshToken, roles });
};

const refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token required' });
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }

  const stored = await RefreshToken.findOne({ where: { token: refreshToken } });
  if (!stored || stored.revokedAt) {
    return res.status(401).json({ message: 'Refresh token revoked' });
  }

  const user = await User.findByPk(payload.sub, { include: [{ model: Role }] });
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'User inactive' });
  }

  const roles = user.Roles?.map((role) => role.name) || [];
  const newAccessToken = buildAccessToken({ id: user.id, username: user.username, roles });
  const newRefreshToken = buildRefreshToken({ id: user.id });
  const decoded = jwt.decode(newRefreshToken);

  await stored.update({ revokedAt: new Date() });
  await RefreshToken.create({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: new Date(decoded.exp * 1000)
  });

  return res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    roles
  });
};

const logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { token: refreshToken } });
  }
  return res.json({ message: 'Logged out' });
};

module.exports = {
  login,
  refresh,
  logout
};

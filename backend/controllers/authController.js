const {
  loginUser,
  logoutUserSession,
  refreshUserSession
} = require('../services/authService');
const { handleControllerError } = require('../utils/controllerUtils');

const login = async (req, res) => {
  try {
    const data = await loginUser(req.body);
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Login failed');
  }
};

const refresh = async (req, res) => {
  try {
    const data = await refreshUserSession(req.body);
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Refresh failed');
  }
};

const logout = async (req, res) => {
  try {
    const data = await logoutUserSession(req.body);
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Logout failed');
  }
};

module.exports = {
  login,
  refresh,
  logout
};

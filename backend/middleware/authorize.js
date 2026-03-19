const { hasAnyRole, normalizeRoles } = require('../config/rbac');

module.exports = (...allowedRoles) => {
  const requiredRoles = normalizeRoles(allowedRoles.flat());

  return (req, res, next) => {
    const roles = normalizeRoles(req.user?.roles);

    if (!requiredRoles.length) {
      return next();
    }

    if (!hasAnyRole(roles, requiredRoles)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  };
};

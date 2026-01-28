module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    if (!allowedRoles.length) {
      return next();
    }
    const hasRole = roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
};

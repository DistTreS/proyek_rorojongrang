const { User, Role, Tendik } = require('../models');

const me = async (req, res) => {
  const user = await User.findByPk(req.user.sub, {
    include: [{ model: Role }, { model: Tendik }]
  });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    roles: user.Roles?.map((role) => role.name) || [],
    tendik: user.Tendik || null
  });
};

module.exports = { me };

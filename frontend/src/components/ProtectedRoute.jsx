import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { canAccess } from '../constants/rbac';

const ProtectedRoute = ({ children, roles = [] }) => {
  const { isAuthenticated, roles: userRoles } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccess(userRoles, roles)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;

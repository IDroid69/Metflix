import { Navigate, Outlet } from "react-router-dom";
import { getStoredToken, getStoredUserRaw } from "../../services/auth";

export const AdminRoute = () => {
  const token = getStoredToken();
  const userRaw = getStoredUserRaw();
  const user = userRaw ? JSON.parse(userRaw) : null;

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

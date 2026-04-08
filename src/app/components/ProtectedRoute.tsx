import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getStoredToken } from "../../services/auth";

export const ProtectedRoute = () => {
  const token = getStoredToken();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const activeProfileId = localStorage.getItem("activeProfileId");
  const isOnProfiles = location.pathname.startsWith("/profiles");
  if (!activeProfileId && !isOnProfiles) {
    return <Navigate to="/profiles" replace />;
  }

  return <Outlet />;
};

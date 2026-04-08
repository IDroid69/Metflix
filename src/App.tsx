import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import AuthenticatedLayout from "./app/layouts/AuthenticatedLayout";
import { ProtectedRoute } from "./app/components/ProtectedRoute";
import { AdminRoute } from "./app/components/AdminRoute";
import AddMovie from "./pages/AddMovie";
import AddSeries from "./pages/AddSeries";
import Profiles from "./pages/Profiles";
import ProfileAvatar from "./pages/ProfileAvatar";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/profiles/:profileId/avatar" element={<ProfileAvatar />} />
          <Route element={<AdminRoute />}>
            <Route path="/add" element={<AddMovie />} />
            <Route path="/edit/:id" element={<AddMovie />} />
            <Route path="/add-series" element={<AddSeries />} />
            <Route path="/edit-series/:id" element={<AddSeries />} />
          </Route>
          <Route path="/" element={<AuthenticatedLayout />} />
          <Route path="/*" element={<AuthenticatedLayout />} />
        </Route>

        {/* Redirect unknown routes to home (which will redirect to login if not authenticated) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

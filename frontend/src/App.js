import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./components/Layout";
import LoginPage from "./features/projectPlanning/pages/LoginPage";
import DashboardPage from "./features/projectPlanning/pages/DashboardPage";
import ProjectListPage from "./features/projectPlanning/pages/ProjectListPage";
import ProjectDetailPage from "./features/projectPlanning/pages/ProjectDetailPage";
import ClientsPage from "./features/projectPlanning/pages/ClientsPage";
import ClientDetailPage from "./features/projectPlanning/pages/ClientDetailPage";
import ClientProjectsPage from "./features/projectPlanning/pages/ClientProjectsPage";
import ProcurementDashboardPage from "./features/projectPlanning/pages/ProcurementDashboardPage";
import CommitmentDetailPage from "./features/projectPlanning/pages/CommitmentDetailPage";
import QuotationDetailPage from "./features/projectPlanning/pages/QuotationDetailPage";
import PurchaseOrderPage from "./features/projectPlanning/pages/PurchaseOrderPage";
import FinancePage from "./features/projectPlanning/pages/FinancePage";
import PayrollPage from "./features/projectPlanning/pages/PayrollPage";
import ProjectFinancePage from "./features/projectPlanning/pages/ProjectFinancePage";
import UsersPage from "./features/projectPlanning/pages/UsersPage";
import VendorsPage from "./features/projectPlanning/pages/VendorsPage";
import BidComparisonPage from "./features/projectPlanning/pages/BidComparisonPage";
import VendorPortalPage from "./features/projectPlanning/pages/VendorPortalPage";
import VendorDashboardPage from "./features/projectPlanning/pages/VendorDashboardPage";
import VendorBidPackagePage from "./features/projectPlanning/pages/VendorBidPackagePage";
import SiteEngineerPortalPage from "./features/projectPlanning/pages/SiteEngineerPortalPage";
import EstimatesPage from "./features/projectPlanning/pages/EstimatesPage";
import EstimateApprovalPage from "./features/projectPlanning/pages/EstimateApprovalPage";
import ConceptStudioPage from "./features/projectPlanning/pages/ConceptStudioPage";
import Model3DViewerPage from "./features/projectPlanning/pages/Model3DViewerPage";
import SuperAdminPage from "./features/projectPlanning/pages/SuperAdminPage";
import LeadsPage from "./features/projectPlanning/pages/LeadsPage";
import LeadDetailPage from "./features/projectPlanning/pages/LeadDetailPage";
import PublicEnquiryPage from "./features/projectPlanning/pages/PublicEnquiryPage";
import MyAttendancePage from "./features/projectPlanning/pages/MyAttendancePage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" data-testid="auth-loading">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  if (user.role === "SuperAdmin") return <Navigate to="/superadmin" replace />;
  return <Layout>{children}</Layout>;
};

const SuperAdminRoute = ({ children }) => {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" data-testid="auth-loading">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  if (user.role !== "SuperAdmin") return <Navigate to="/admin" replace />;
  return children;
};

const AdminHome = () => {
  const { user } = useAuth();
  if (user?.role === "Vendor") return <Navigate to="/portal/vendor/dashboard" replace />;
  return <DashboardPage />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/superadmin" element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />
            <Route path="/estimate-approval/:id/:token" element={<EstimateApprovalPage />} />
            <Route path="/enquiry/:token" element={<PublicEnquiryPage />} />
            <Route path="/admin" element={<ProtectedRoute><AdminHome /></ProtectedRoute>} />
            <Route path="/admin/projects" element={<ProtectedRoute><ProjectListPage /></ProtectedRoute>} />
            <Route path="/admin/projects/:id" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
            <Route path="/admin/projects/:projectId/3d-viewer" element={<ProtectedRoute><Model3DViewerPage /></ProtectedRoute>} />
            <Route path="/admin/projects/:id/finance" element={<ProtectedRoute><ProjectFinancePage /></ProtectedRoute>} />
            <Route path="/admin/projects/:id/procurement" element={<ProtectedRoute><ProcurementDashboardPage /></ProtectedRoute>} />
            <Route path="/admin/projects/:id/procurement/quotations/:quotationId" element={<ProtectedRoute><QuotationDetailPage /></ProtectedRoute>} />
            <Route path="/admin/projects/:id/procurement/quotations/:quotationId/purchase-order" element={<ProtectedRoute><PurchaseOrderPage /></ProtectedRoute>} />
            <Route path="/admin/projects/:id/procurement/:type/:commitmentId" element={<ProtectedRoute><CommitmentDetailPage /></ProtectedRoute>} />
            <Route path="/admin/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
            <Route path="/admin/clients/:id" element={<ProtectedRoute><ClientDetailPage /></ProtectedRoute>} />
            <Route path="/admin/clients/:id/projects" element={<ProtectedRoute><ClientProjectsPage /></ProtectedRoute>} />
            <Route path="/admin/leads" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
            <Route path="/admin/leads/:id" element={<ProtectedRoute><LeadDetailPage /></ProtectedRoute>} />
            <Route path="/admin/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
            <Route path="/admin/estimates" element={<ProtectedRoute><EstimatesPage /></ProtectedRoute>} />
            <Route path="/admin/concepts" element={<ProtectedRoute><ConceptStudioPage /></ProtectedRoute>} />
            <Route path="/admin/concepts/:id" element={<ProtectedRoute><ConceptStudioPage /></ProtectedRoute>} />
            <Route path="/admin/finance/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
            <Route path="/my/attendance" element={<ProtectedRoute><MyAttendancePage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
            <Route path="/admin/procurement/vendors" element={<ProtectedRoute><VendorsPage /></ProtectedRoute>} />
            <Route path="/admin/procurement/bid-packages/:id/comparison" element={<ProtectedRoute><BidComparisonPage /></ProtectedRoute>} />
            <Route path="/portal/vendor/dashboard" element={<ProtectedRoute><VendorDashboardPage /></ProtectedRoute>} />
            <Route path="/portal/vendor/bid-packages" element={<ProtectedRoute><VendorPortalPage /></ProtectedRoute>} />
            <Route path="/portal/vendor/bid-packages/:id" element={<ProtectedRoute><VendorBidPackagePage /></ProtectedRoute>} />
            <Route path="/portal/site-engineer" element={<ProtectedRoute><SiteEngineerPortalPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" theme="dark" />
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

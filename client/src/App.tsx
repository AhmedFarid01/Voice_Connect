import { Suspense, lazy } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import { LiveBroadcastProvider } from "@/contexts/live-broadcast";
import { LiveBar } from "@/components/live-bar";
import AuthPage from "@/pages/auth-page";

// Code-split: each route ships its own JS chunk so the initial bundle stays lean.
const HomePage = lazy(() => import("@/pages/home-page"));
const UploadPage = lazy(() => import("@/pages/upload-page"));
const WatchPage = lazy(() => import("@/pages/watch-page"));
const LivePage = lazy(() => import("@/pages/live-page"));
const GoLivePage = lazy(() => import("@/pages/go-live-page"));
const WatchLivePage = lazy(() => import("@/pages/watch-live-page"));
const ProfilePage = lazy(() => import("@/pages/profile-page"));
const LibraryPage = lazy(() => import("@/pages/library-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));
const DashboardPage = lazy(() => import("@/pages/dashboard-page"));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password-page"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password-page"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
    </div>
  );
}

function PublicRouter() {
  const [location] = useLocation();
  // Allow these paths to render without an authenticated session.
  if (location === "/forgot-password") {
    return (
      <Suspense fallback={<Spinner />}>
        <ForgotPasswordPage />
      </Suspense>
    );
  }
  if (location === "/reset-password" || location.startsWith("/reset-password?")) {
    return (
      <Suspense fallback={<Spinner />}>
        <ResetPasswordPage />
      </Suspense>
    );
  }
  return <AuthPage />;
}

function Router() {
  const { user, isLoading } = useUser();

  if (isLoading) return <Spinner />;
  if (!user) return <PublicRouter />;

  return (
    <LiveBroadcastProvider>
      <Suspense fallback={<Spinner />}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/upload" component={UploadPage} />
          <Route path="/watch/:id" component={WatchPage} />
          <Route path="/live" component={LivePage} />
          <Route path="/go-live" component={GoLivePage} />
          <Route path="/live/:id" component={WatchLivePage} />
          <Route path="/profile/:id" component={ProfilePage} />
          <Route path="/library" component={LibraryPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      <LiveBar />
    </LiveBroadcastProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;

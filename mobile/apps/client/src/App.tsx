import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { lazy } from "react";
import { LazyRoute } from "@/ui/lazy-route";
import { SplashPage } from "@/features/auth/SplashPage";
import {
  WelcomePage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
} from "@/features/auth/AuthScreens";
import { RequireAuth, MainTabs, RequireMemberAccess } from "@/features/app/MainScreens";
import { useSession, isStaffUser, securityHomeRoute } from "@/features/auth/SessionProvider";
import { BiometricGate } from "@/features/auth/BiometricGate";
import { DeepLinkNavigator } from "@/navigation/DeepLinkNavigator";

const GenderOnboardingPage = lazy(() =>
  import("@/features/onboarding/OnboardingScreens").then((m) => ({
    default: m.GenderOnboardingPage,
  }))
);
const QuestionnaireOnboardingPage = lazy(() =>
  import("@/features/onboarding/OnboardingScreens").then((m) => ({
    default: m.QuestionnaireOnboardingPage,
  }))
);
const DiscoverPage = lazy(() =>
  import("@/features/discover/DiscoverPage").then((m) => ({
    default: m.DiscoverPage,
  }))
);
const FullProfilePage = lazy(() =>
  import("@/features/discover/FullProfilePage").then((m) => ({
    default: m.FullProfilePage,
  }))
);
const HomeDashboardPage = lazy(() =>
  import("@/features/home/HomeDashboardPage").then((m) => ({
    default: m.HomeDashboardPage,
  }))
);
const MatchesPage = lazy(() =>
  import("@/features/matches/MatchesPage").then((m) => ({
    default: m.MatchesPage,
  }))
);
const MessagesPage = lazy(() =>
  import("@/features/messages/MessagesPage").then((m) => ({
    default: m.MessagesPage,
  }))
);
const ProfilePage = lazy(() =>
  import("@/features/profile/ProfilePage").then((m) => ({
    default: m.ProfilePage,
  }))
);
const PlansPage = lazy(() =>
  import("@/features/payments/PlansPage").then((m) => ({ default: m.PlansPage }))
);
const ChatThreadPage = lazy(() =>
  import("@/features/messages/ChatThreadPage").then((m) => ({
    default: m.ChatThreadPage,
  }))
);
const SettingsHomePage = lazy(() =>
  import("@/features/settings/SettingsScreens").then((m) => ({
    default: m.SettingsHomePage,
  }))
);
const AdminHomePage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminHomePage,
  }))
);
const AdminMembersPage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminMembersPage,
  }))
);
const AdminPaymentsPage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminPaymentsPage,
  }))
);
const AdminReportsPage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminReportsPage,
  }))
);
const AdminMessagesPage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminMessagesPage,
  }))
);
const AdminInvitePage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminInvitePage,
  }))
);
const AdminAnnouncementsPage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminAnnouncementsPage,
  }))
);
const AdminAnalyticsPage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminAnalyticsPage,
  }))
);
const AdminAuditPage = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.AdminAuditPage,
  }))
);
const AdminMemberDetailPage = lazy(() =>
  import("@/features/admin/AdminMemberDetailPage").then((m) => ({
    default: m.AdminMemberDetailPage,
  }))
);
const RequireStaff = lazy(() =>
  import("@/features/admin/AdminScreens").then((m) => ({
    default: m.RequireStaff,
  }))
);
const DeleteAccountPage = lazy(() =>
  import("@/features/settings/SettingsScreens").then((m) => ({
    default: m.DeleteAccountPage,
  }))
);
const ChangePasswordPage = lazy(() =>
  import("@/features/settings/SettingsScreens").then((m) => ({
    default: m.ChangePasswordPage,
  }))
);
const MemberSupportPage = lazy(() =>
  import("@/features/settings/MemberSupportPage").then((m) => ({
    default: m.MemberSupportPage,
  }))
);
const PrivacyPage = lazy(() =>
  import("@/features/legal/LegalScreens").then((m) => ({ default: m.PrivacyPage }))
);
const TermsPage = lazy(() =>
  import("@/features/legal/LegalScreens").then((m) => ({ default: m.TermsPage }))
);
const CommunityGuidelinesPage = lazy(() =>
  import("@/features/legal/LegalScreens").then((m) => ({
    default: m.CommunityGuidelinesPage,
  }))
);
const SafetyPage = lazy(() =>
  import("@/features/legal/LegalScreens").then((m) => ({ default: m.SafetyPage }))
);
const HelpPage = lazy(() =>
  import("@/features/legal/LegalScreens").then((m) => ({ default: m.HelpPage }))
);
const AboutPage = lazy(() =>
  import("@/features/legal/LegalScreens").then((m) => ({ default: m.AboutPage }))
);
const SharedProfilePage = lazy(() =>
  import("@/features/profile/SharedProfilePage").then((m) => ({
    default: m.SharedProfilePage,
  }))
);
const VerifyEmailPage = lazy(() =>
  import("@/features/auth/SecurityScreens").then((m) => ({
    default: m.VerifyEmailPage,
  }))
);
const ForcedChangePasswordPage = lazy(() =>
  import("@/features/auth/SecurityScreens").then((m) => ({
    default: m.ForcedChangePasswordPage,
  }))
);
const EnrollMfaPage = lazy(() =>
  import("@/features/auth/SecurityScreens").then((m) => ({
    default: m.EnrollMfaPage,
  }))
);

function ChatRoute() {
  const { conversationId } = useParams();
  if (!conversationId) return <Navigate to="/messages" replace />;
  return (
    <RequireAuth>
      <StaffAwayFromMemberHome>
        <RequireMemberAccess>
          <LazyRoute label="Opening chat…">
            <ChatThreadPage conversationId={conversationId} />
          </LazyRoute>
        </RequireMemberAccess>
      </StaffAwayFromMemberHome>
    </RequireAuth>
  );
}

function StaffAwayFromMemberHome({ children }: { children: React.ReactNode }) {
  const { user, accessState } = useSession();
  if (isStaffUser(user, accessState)) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function HomeRedirect() {
  const { ready, user, accessState, offline, bootSlow, error } = useSession();
  if (!ready) return <SplashPage />;
  if (user) {
    const dest = securityHomeRoute(user, accessState);
    // Staff land on admin once security gates are clear (even if access nextRoute is odd).
    if (
      isStaffUser(user, accessState) &&
      (dest === "/home" || dest === "/plans" || dest === "/onboarding/gender" || dest === "/onboarding/questionnaire")
    ) {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to={dest} replace />;
  }
  // Keep retry UI when API was slow/unreachable instead of a blank jump.
  if (offline || bootSlow || error) return <SplashPage />;
  // Render Welcome here — avoid an extra redirect that some WebViews blank out.
  return <WelcomePage />;
}

export default function App() {
  return (
    <BiometricGate>
      <DeepLinkNavigator />
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/splash" element={<SplashPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/verify-email"
          element={
            <LazyRoute label="Verifying email…">
              <VerifyEmailPage />
            </LazyRoute>
          }
        />
        <Route
          path="/change-password"
          element={
            <LazyRoute>
              <ForcedChangePasswordPage />
            </LazyRoute>
          }
        />
        <Route
          path="/enroll-mfa"
          element={
            <LazyRoute label="Setting up MFA…">
              <EnrollMfaPage />
            </LazyRoute>
          }
        />
        <Route
          path="/onboarding/gender"
          element={
            <RequireAuth>
              <LazyRoute label="Loading onboarding…">
                <GenderOnboardingPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding/questionnaire"
          element={
            <RequireAuth>
              <LazyRoute label="Loading questionnaire…">
                <StaffAwayFromMemberHome>
                  <QuestionnaireOnboardingPage />
                </StaffAwayFromMemberHome>
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/plans"
          element={
            <RequireAuth>
              <LazyRoute>
                <StaffAwayFromMemberHome>
                  <PlansPage />
                </StaffAwayFromMemberHome>
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <MainTabs />
            </RequireAuth>
          }
        >
          <Route
            path="/admin"
            element={
              <LazyRoute label="Opening admin…">
                <RequireStaff>
                  <AdminHomePage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/members"
            element={
              <LazyRoute label="Loading members…">
                <RequireStaff>
                  <AdminMembersPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/members/:profileId"
            element={
              <LazyRoute label="Loading member…">
                <RequireStaff>
                  <AdminMemberDetailPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/payments"
            element={
              <LazyRoute label="Loading payments…">
                <RequireStaff>
                  <AdminPaymentsPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <LazyRoute label="Loading reports…">
                <RequireStaff>
                  <AdminReportsPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/messages"
            element={
              <LazyRoute label="Loading chats…">
                <RequireStaff>
                  <AdminMessagesPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/invites"
            element={
              <LazyRoute label="Loading invites…">
                <RequireStaff>
                  <AdminInvitePage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/announcements"
            element={
              <LazyRoute label="Loading announcements…">
                <RequireStaff>
                  <AdminAnnouncementsPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <LazyRoute label="Loading analytics…">
                <RequireStaff>
                  <AdminAnalyticsPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <LazyRoute label="Loading audit log…">
                <RequireStaff>
                  <AdminAuditPage />
                </RequireStaff>
              </LazyRoute>
            }
          />
          <Route
            path="/home"
            element={
              <LazyRoute>
                <StaffAwayFromMemberHome>
                  <RequireMemberAccess>
                    <HomeDashboardPage />
                  </RequireMemberAccess>
                </StaffAwayFromMemberHome>
              </LazyRoute>
            }
          />
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
          <Route
            path="/discover"
            element={
              <LazyRoute>
                <StaffAwayFromMemberHome>
                  <RequireMemberAccess>
                    <DiscoverPage />
                  </RequireMemberAccess>
                </StaffAwayFromMemberHome>
              </LazyRoute>
            }
          />
          <Route
            path="/discover/member/:userId"
            element={
              <LazyRoute>
                <StaffAwayFromMemberHome>
                  <RequireMemberAccess>
                    <FullProfilePage />
                  </RequireMemberAccess>
                </StaffAwayFromMemberHome>
              </LazyRoute>
            }
          />
          <Route
            path="/matches"
            element={
              <LazyRoute>
                <StaffAwayFromMemberHome>
                  <RequireMemberAccess>
                    <MatchesPage />
                  </RequireMemberAccess>
                </StaffAwayFromMemberHome>
              </LazyRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <LazyRoute>
                <StaffAwayFromMemberHome>
                  <RequireMemberAccess>
                    <MessagesPage />
                  </RequireMemberAccess>
                </StaffAwayFromMemberHome>
              </LazyRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <LazyRoute>
                <StaffAwayFromMemberHome>
                  <RequireMemberAccess>
                    <ProfilePage />
                  </RequireMemberAccess>
                </StaffAwayFromMemberHome>
              </LazyRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <LazyRoute>
                <SettingsHomePage />
              </LazyRoute>
            }
          />
          <Route
            path="/settings/support"
            element={
              <LazyRoute label="Loading support…">
                <MemberSupportPage />
              </LazyRoute>
            }
          />
        </Route>
        <Route path="/messages/:conversationId" element={<ChatRoute />} />
        <Route
          path="/p/:publicId"
          element={
            <RequireAuth>
              <LazyRoute label="Opening shared profile…">
                <SharedProfilePage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/settings/change-password"
          element={
            <RequireAuth>
              <LazyRoute>
                <ChangePasswordPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/settings/delete-account"
          element={
            <RequireAuth>
              <LazyRoute>
                <DeleteAccountPage />
              </LazyRoute>
            </RequireAuth>
          }
        />
        <Route
          path="/legal/privacy"
          element={
            <LazyRoute>
              <PrivacyPage />
            </LazyRoute>
          }
        />
        <Route
          path="/legal/terms"
          element={
            <LazyRoute>
              <TermsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/legal/guidelines"
          element={
            <LazyRoute>
              <CommunityGuidelinesPage />
            </LazyRoute>
          }
        />
        <Route
          path="/legal/safety"
          element={
            <LazyRoute>
              <SafetyPage />
            </LazyRoute>
          }
        />
        <Route
          path="/legal/help"
          element={
            <LazyRoute>
              <HelpPage />
            </LazyRoute>
          }
        />
        <Route
          path="/legal/about"
          element={
            <LazyRoute>
              <AboutPage />
            </LazyRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BiometricGate>
  );
}

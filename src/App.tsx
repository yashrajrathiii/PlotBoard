import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ShareSelectionProvider } from './context/ShareSelectionContext'
import { NotificationsProvider } from './context/NotificationsContext'
import ShareSelectionBar from './components/ShareSelectionBar'
import NotificationToast from './components/NotificationToast'
import Protected from './components/Protected'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import WelcomePage from './pages/WelcomePage'
import BoardPage from './pages/BoardPage'
import AddListingPage from './pages/AddListingPage'
import EditListingPage from './pages/EditListingPage'
import ListingDetailPage from './pages/ListingDetailPage'
import MyListingsPage from './pages/MyListingsPage'
import InvitePage from './pages/InvitePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <ShareSelectionProvider>
          <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/welcome"
          element={
            <Protected>
              <WelcomePage />
            </Protected>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Layout>
                <BoardPage />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/add"
          element={
            <Protected>
              <Layout>
                <AddListingPage />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/listing/:id"
          element={
            <Protected>
              <Layout>
                <ListingDetailPage />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/edit/:id"
          element={
            <Protected>
              <Layout>
                <EditListingPage />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/my-listings"
          element={
            <Protected>
              <Layout>
                <MyListingsPage />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/invites"
          element={
            <Protected adminOnly>
              <Layout>
                <InvitePage />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <Layout>
                <SettingsPage />
              </Layout>
            </Protected>
          }
        />
            <Route path="*" element={<LoginPage />} />
          </Routes>
          <ShareSelectionBar />
          <NotificationToast />
        </ShareSelectionProvider>
      </NotificationsProvider>
    </AuthProvider>
  )
}

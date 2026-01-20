import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loading } from './components/common/Loading';

const HomePage = lazy(() => import('./pages/HomePage'));
const TrainingPage = lazy(() => import('./pages/TrainingPage'));
const CorrectionPage = lazy(() => import('./pages/CorrectionPage'));
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          {/* Navigation */}
          <nav className="bg-white shadow-md">
            <div className="max-w-6xl mx-auto px-4">
              <div className="flex justify-between items-center h-16">
                <Link to="/" className="text-2xl font-bold text-blue-600">
                  toneCopy
                </Link>
                <div className="flex gap-6">
                  <Link
                    to="/training"
                    className="text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    Train
                  </Link>
                  <Link
                    to="/correction"
                    className="text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    Correct
                  </Link>
                  <Link
                    to="/profiles"
                    className="text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    Profiles
                  </Link>
                </div>
              </div>
            </div>
          </nav>

          {/* Routes */}
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/training" element={<TrainingPage />} />
              <Route path="/correction" element={<CorrectionPage />} />
              <Route path="/profiles" element={<ProfilesPage />} />
              <Route
                path="*"
                element={
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                      <h1 className="text-4xl font-bold text-gray-900 mb-4">
                        404 - Page Not Found
                      </h1>
                      <Link
                        to="/"
                        className="text-blue-600 hover:text-blue-700 underline"
                      >
                        Go Home
                      </Link>
                    </div>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;

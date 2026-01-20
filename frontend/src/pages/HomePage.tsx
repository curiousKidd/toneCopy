import React from 'react';
import { Link } from 'react-router-dom';

export const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Welcome to <span className="text-blue-600">toneCopy</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Train AI to learn your photo editing style and automatically apply it to any image
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              to="/training"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-lg shadow-lg transition-all"
            >
              Train Your Style
            </Link>
            <Link
              to="/correction"
              className="px-8 py-4 bg-white hover:bg-gray-50 text-blue-600 rounded-lg font-semibold text-lg shadow-lg border-2 border-blue-600 transition-all"
            >
              Apply Correction
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-lg p-8 shadow-md">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-blue-600 text-3xl">1</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Upload Photos</h3>
            <p className="text-gray-600">
              Provide an original photo and your edited version
            </p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-md">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-blue-600 text-3xl">2</span>
            </div>
            <h3 className="text-xl font-bold mb-2">AI Analysis</h3>
            <p className="text-gray-600">
              Our AI compares and learns your editing parameters
            </p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-md">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-blue-600 text-3xl">3</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Apply Instantly</h3>
            <p className="text-gray-600">
              Your style is saved and ready to apply to any photo
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-lg p-8 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">5s</div>
              <div className="text-gray-600">Average Analysis Time</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">2s</div>
              <div className="text-gray-600">Correction Apply Time</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">Free</div>
              <div className="text-gray-600">To Get Started</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;

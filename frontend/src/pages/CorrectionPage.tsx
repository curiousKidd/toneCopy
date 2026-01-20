import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImageUploader } from '../components/image/ImageUploader';
import { applyCorrection } from '../services/correctionApi';
import { getProfiles } from '../services/profileApi';

export const CorrectionPage: React.FC = () => {
  const [image, setImage] = useState<File | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [result, setResult] = useState<any>(null);

  const { data: profilesData } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => getProfiles(1, 50)
  });

  const correctionMutation = useMutation({
    mutationFn: applyCorrection,
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Correction failed');
    }
  });

  const handleApply = () => {
    if (!image || !selectedProfileId) {
      alert('Please upload an image and select a profile');
      return;
    }

    correctionMutation.mutate({
      image,
      profileId: selectedProfileId
    });
  };

  const handleDownload = async () => {
    if (!result?.corrected_image_url) return;

    try {
      const response = await fetch(result.corrected_image_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tonecopy-corrected-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download image. Please try again.');
    }
  };

  const canApply = image && selectedProfileId;
  const isLoading = correctionMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Apply Correction
          </h1>
          <p className="text-lg text-gray-600">
            Apply your trained style to a new photo
          </p>
        </div>

        {!result ? (
          <>
            {/* Image Upload */}
            <div className="mb-8">
              <ImageUploader
                label="1. Upload Image"
                onUpload={setImage}
              />
            </div>

            {/* Profile Selection */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2. Select Style Profile
              </label>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Select a profile --</option>
                {profilesData?.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.profile_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Apply Button */}
            <div className="flex justify-center">
              <button
                onClick={handleApply}
                disabled={!canApply || isLoading}
                className={`
                  px-8 py-4 rounded-lg font-semibold text-lg transition-all
                  ${canApply && !isLoading
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                {isLoading ? 'Processing...' : 'Apply Correction'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Result Display */}
            <div className="bg-white rounded-lg p-8 shadow-md mb-8">
              <h2 className="text-2xl font-bold mb-4">Result</h2>
              <div className="mb-4 flex justify-center">
                <img
                  src={result.corrected_image_url}
                  alt="Corrected"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                />
              </div>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleDownload}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all"
                >
                  Download
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setImage(null);
                  }}
                  className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-all"
                >
                  Process Another
                </button>
              </div>
              <p className="mt-4 text-sm text-gray-500 text-center">
                Processing time: {result.processing_time_ms}ms
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CorrectionPage;

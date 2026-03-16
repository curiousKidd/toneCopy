import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ImageUploader } from '../components/image/ImageUploader';
import { analyzeImages } from '../services/trainingApi';
import type { AnalysisResult, StyleProfileSummary } from '../types/api';

interface ImagePair {
  id: string;
  originalImage: File | null;
  adjustedImage: File | null;
}

export const TrainingPage: React.FC = () => {
  const navigate = useNavigate();
  const [imagePairs, setImagePairs] = useState<ImagePair[]>([
    { id: '1', originalImage: null, adjustedImage: null }
  ]);
  const [profileName, setProfileName] = useState('');
  const [styleProfile, setStyleProfile] = useState<StyleProfileSummary | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: analyzeImages,
    onSuccess: (data: AnalysisResult) => {
      if (data.style_profile) {
        // 스타일 프로필 결과를 먼저 보여준 후 이동
        setStyleProfile(data.style_profile);
        setTimeout(() => {
          navigate('/profiles', {
            state: { newProfile: data, message: '스타일 프로필이 생성되었습니다!' }
          });
        }, 3000);
      } else {
        navigate('/profiles', {
          state: { newProfile: data, message: 'Profile created successfully!' }
        });
      }
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Analysis failed');
    }
  });

  const addImagePair = () => {
    const newId = String(Date.now());
    setImagePairs([...imagePairs, { id: newId, originalImage: null, adjustedImage: null }]);
  };

  const removeImagePair = (id: string) => {
    if (imagePairs.length > 1) {
      setImagePairs(imagePairs.filter(pair => pair.id !== id));
    }
  };

  const updateImagePair = (id: string, field: 'originalImage' | 'adjustedImage', file: File | null) => {
    setImagePairs(imagePairs.map(pair =>
      pair.id === id ? { ...pair, [field]: file } : pair
    ));
  };

  const handleSubmit = () => {
    const incompletePairs = imagePairs.filter(pair => !pair.originalImage || !pair.adjustedImage);

    if (incompletePairs.length > 0) {
      alert('Please upload both original and edited images for all pairs');
      return;
    }

    if (!profileName.trim()) {
      alert('Please enter a profile name');
      return;
    }

    const originalImages = imagePairs.map(pair => pair.originalImage!);
    const adjustedImages = imagePairs.map(pair => pair.adjustedImage!);

    analyzeMutation.mutate({
      originalImages,
      adjustedImages,
      profileName
    });
  };

  const allPairsComplete = imagePairs.every(pair => pair.originalImage && pair.adjustedImage);
  const canSubmit = allPairsComplete && profileName.trim();
  const isLoading = analyzeMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Train Your Style
          </h1>
          <p className="text-lg text-gray-600">
            Upload an original and edited photo to teach our AI your editing style
          </p>
        </div>

        {/* Upload Section */}
        <div className="space-y-6 mb-8">
          {imagePairs.map((pair, index) => (
            <div key={pair.id} className="bg-white rounded-lg p-6 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Image Pair #{index + 1}
                </h3>
                {imagePairs.length > 1 && (
                  <button
                    onClick={() => removeImagePair(pair.id)}
                    className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-all"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ImageUploader
                  label="Original Image"
                  onUpload={(file) => updateImagePair(pair.id, 'originalImage', file)}
                />
                <ImageUploader
                  label="Edited Image (your style)"
                  onUpload={(file) => updateImagePair(pair.id, 'adjustedImage', file)}
                />
              </div>
            </div>
          ))}

          {/* Add More Button */}
          <div className="flex justify-center">
            <button
              onClick={addImagePair}
              disabled={isLoading}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Another Image Pair
            </button>
          </div>
        </div>

        {/* Profile Name Input */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Name Your Style Profile
          </label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="e.g., Portrait Style, Sunset Vibes"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={50}
          />
          <p className="mt-1 text-sm text-gray-500">
            {profileName.length}/50 characters
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isLoading}
            className={`
              px-8 py-4 rounded-lg font-semibold text-lg transition-all
              ${canSubmit && !isLoading
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                AI가 스타일을 학습 중입니다... (10~20초 소요)
              </span>
            ) : (
              '스타일 분석 및 프로필 생성'
            )}
          </button>
        </div>

        {/* 스타일 프로필 결과 카드 */}
        {styleProfile && (
          <div className="mt-8 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-md animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-blue-900 text-lg">AI가 학습한 스타일</h3>
                <p className="text-blue-600 text-sm">3초 후 프로필 페이지로 이동합니다</p>
              </div>
            </div>

            {/* 스타일 설명 */}
            <p className="text-gray-800 font-medium mb-4 text-base leading-relaxed">
              "{styleProfile.description}"
            </p>

            {/* 특성 태그 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { label: '분위기', value: styleProfile.characteristics.overallMood },
                { label: '밝기', value: styleProfile.characteristics.brightnessApproach },
                { label: '채도', value: styleProfile.characteristics.saturationStyle },
                { label: '그림자', value: styleProfile.characteristics.shadowTreatment },
                { label: '피부톤', value: styleProfile.characteristics.skinToneApproach },
                { label: '색감', value: styleProfile.characteristics.colorGradingStyle },
              ].map(tag => (
                <span key={tag.label} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  <span className="text-blue-500 font-medium">{tag.label}:</span> {tag.value}
                </span>
              ))}
            </div>

            {/* 기술 노트 */}
            {styleProfile.characteristics.technicalNotes && (
              <p className="text-gray-600 text-sm bg-white rounded-lg p-3 border border-blue-100">
                {styleProfile.characteristics.technicalNotes}
              </p>
            )}
          </div>
        )}

        {/* How It Works */}
        <div className="mt-16 bg-white rounded-lg p-8 shadow-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                <span className="text-blue-600 font-bold text-xl">1</span>
              </div>
              <h3 className="font-semibold mb-2">Upload Photo Pairs</h3>
              <p className="text-gray-600 text-sm">
                Upload multiple original and edited photo pairs for better accuracy
              </p>
            </div>

            <div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                <span className="text-blue-600 font-bold text-xl">2</span>
              </div>
              <h3 className="font-semibold mb-2">AI 스타일 학습</h3>
              <p className="text-gray-600 text-sm">
                AI가 여러 쌍을 종합 분석하여 보정 의도와 원칙을 학습합니다
              </p>
            </div>

            <div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                <span className="text-blue-600 font-bold text-xl">3</span>
              </div>
              <h3 className="font-semibold mb-2">지능형 보정 적용</h3>
              <p className="text-gray-600 text-sm">
                새 사진마다 AI가 특성을 파악하고 스타일을 지능적으로 적용합니다
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingPage;

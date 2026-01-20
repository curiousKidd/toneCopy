import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProfiles, deleteProfile } from '../services/profileApi';
import { format } from 'date-fns';

export const ProfilesPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => getProfiles(1, 50)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      alert('Profile deleted successfully');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Delete failed');
    }
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profiles...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-600">Failed to load profiles</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Your Style Profiles
          </h1>
          <p className="text-lg text-gray-600">
            Manage your saved editing styles
          </p>
        </div>

        {!data?.profiles.length ? (
          <div className="bg-white rounded-lg p-12 text-center shadow-md">
            <p className="text-gray-600 text-lg mb-4">
              You don't have any profiles yet
            </p>
            <a
              href="/training"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all"
            >
              Create Your First Profile
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.profiles.map((profile) => (
              <div
                key={profile.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <img
                  src={profile.preview_image_url}
                  alt={profile.profile_name}
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-2">
                    {profile.profile_name}
                  </h3>
                  <div className="text-sm text-gray-600 mb-4">
                    <p>Created: {format(new Date(profile.created_at), 'MMM dd, yyyy')}</p>
                    <p>Used: {profile.usage_count} times</p>
                  </div>
                  <button
                    onClick={() => handleDelete(profile.id, profile.profile_name)}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilesPage;

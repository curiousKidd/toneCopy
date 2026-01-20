import api from './api';
import type { ApiResponse, Profile, ProfileDetail, PaginatedResponse } from '../types/api';

export const getProfiles = async (page = 1, limit = 10): Promise<PaginatedResponse<Profile>> => {
  const response = await api.get<ApiResponse<PaginatedResponse<Profile>>>(
    `/profiles?page=${page}&limit=${limit}`
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch profiles');
  }

  return response.data.data;
};

export const getProfile = async (id: string): Promise<ProfileDetail> => {
  const response = await api.get<ApiResponse<ProfileDetail>>(`/profiles/${id}`);

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch profile');
  }

  return response.data.data;
};

export const deleteProfile = async (id: string): Promise<void> => {
  const response = await api.delete<ApiResponse<any>>(`/profiles/${id}`);

  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Failed to delete profile');
  }
};

export const updateProfile = async (id: string, profileName: string): Promise<ProfileDetail> => {
  const response = await api.patch<ApiResponse<ProfileDetail>>(
    `/profiles/${id}`,
    { profile_name: profileName }
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to update profile');
  }

  return response.data.data;
};

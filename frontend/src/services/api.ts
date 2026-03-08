import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

// 영속적 사용자 ID 관리: 첫 접속 시 UUID 생성 후 localStorage에 저장
function getOrCreateUserId(): string {
  const STORAGE_KEY = 'tonecopy_user_id';
  let userId = localStorage.getItem(STORAGE_KEY);
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, userId);
  }
  return userId;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // AI 분석이 최대 2분 소요될 수 있음
});

// Request interceptor: 모든 요청에 X-User-ID 헤더 자동 주입
api.interceptors.request.use(
  (config) => {
    config.headers['X-User-ID'] = getOrCreateUserId();
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      const message = error.response.data?.error?.message || 'An error occurred';
      console.error('API Error:', message);
    } else if (error.request) {
      console.error('Network Error: No response received');
    } else {
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;

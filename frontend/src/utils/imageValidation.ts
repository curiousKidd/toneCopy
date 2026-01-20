export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_SIZE_MB = 10;

export const validateImage = (file: File, maxSizeMB = MAX_SIZE_MB): ValidationResult => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Only JPG and PNG files are allowed.',
    };
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit.`,
    };
  }

  return { valid: true };
};

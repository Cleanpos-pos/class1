import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12; // Increased from 10 for better security

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  // SECURITY: Only accept bcrypt hashes
  if (!isHashedPassword(hash)) {
    // Plain text passwords are no longer accepted
    // Log for monitoring but never compare plain text
    console.error('[SECURITY] Plain text password detected in database. Password migration required.');
    return false;
  }
  return bcrypt.compare(password, hash);
};

export const isHashedPassword = (password: string): boolean => {
  return password.startsWith('$2a$') || password.startsWith('$2b$');
};

// Sanitize user input to prevent injection attacks
export const sanitizeInput = (input: string): string => {
  if (!input) return '';
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .slice(0, 500); // Limit length
};

// Validate email format with stricter regex
export const isValidEmail = (email: string): boolean => {
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email) && email.length <= 254;
};

// Validate phone number
export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,15}$/;
  return phoneRegex.test(phone);
};

// Generate secure session token
export const generateSecureToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  // Handle legacy plain text passwords during migration
  if (!hash.startsWith('$2a$') && !hash.startsWith('$2b$')) {
    // This is a plain text password - compare directly but warn
    console.warn('Legacy plain text password detected. User should update password.');
    return password === hash;
  }
  return bcrypt.compare(password, hash);
};

export const isHashedPassword = (password: string): boolean => {
  return password.startsWith('$2a$') || password.startsWith('$2b$');
};

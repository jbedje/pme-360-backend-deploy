import bcrypt from 'bcryptjs';
import { logger } from '../config/logger';

export class PasswordService {
  private static readonly SALT_ROUNDS = 12;

  /**
   * Hash un mot de passe
   */
  static async hash(password: string): Promise<string> {
    try {
      if (!password || password.length < 6) {
        throw new Error('Le mot de passe doit contenir au moins 6 caractères');
      }

      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
      logger.debug('✅ Password hashed successfully');
      return hashedPassword;
    } catch (error) {
      logger.error('❌ Error hashing password:', error);
      throw error;
    }
  }

  /**
   * Vérifie un mot de passe contre son hash
   */
  static async verify(password: string, hashedPassword: string): Promise<boolean> {
    try {
      if (!password || !hashedPassword) {
        return false;
      }

      const isValid = await bcrypt.compare(password, hashedPassword);
      logger.debug(`✅ Password verification: ${isValid ? 'success' : 'failed'}`);
      return isValid;
    } catch (error) {
      logger.error('❌ Error verifying password:', error);
      return false;
    }
  }

  /**
   * Valide la force d'un mot de passe
   */
  static validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
    score: number; // 0-4
  } {
    const errors: string[] = [];
    let score = 0;

    // Vérifications basiques
    if (!password) {
      errors.push('Le mot de passe est requis');
      return { isValid: false, errors, score: 0 };
    }

    if (password.length < 6) {
      errors.push('Le mot de passe doit contenir au moins 6 caractères');
    } else if (password.length >= 6) {
      score += 1;
    }

    // Contient des minuscules
    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      errors.push('Le mot de passe doit contenir au moins une lettre minuscule');
    }

    // Contient des majuscules
    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      errors.push('Le mot de passe doit contenir au moins une lettre majuscule');
    }

    // Contient des chiffres
    if (/\d/.test(password)) {
      score += 1;
    } else {
      errors.push('Le mot de passe doit contenir au moins un chiffre');
    }

    // Contient des caractères spéciaux
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\?]/.test(password)) {
      score += 1;
    }

    // Vérifications additionnelles
    if (password.length >= 12) {
      score += 1;
    }

    // Pas de séquences communes
    const commonSequences = ['123', 'abc', 'qwe', 'password', 'admin'];
    const lowerPassword = password.toLowerCase();
    if (commonSequences.some(seq => lowerPassword.includes(seq))) {
      errors.push('Le mot de passe ne doit pas contenir de séquences communes');
      score = Math.max(0, score - 1);
    }

    const isValid = errors.length === 0 && score >= 3;

    return { isValid, errors, score: Math.min(5, score) };
  }

  /**
   * Génère un mot de passe temporaire sécurisé
   */
  static generateTempPassword(length: number = 12): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    
    const allChars = lowercase + uppercase + numbers + symbols;
    
    let password = '';
    
    // Au moins un de chaque type
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // Compléter avec des caractères aléatoires
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Mélanger les caractères
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Vérifie si le mot de passe respecte les politique de sécurité
   */
  static checkSecurityPolicy(password: string): {
    isCompliant: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // Longueur minimale
    if (password.length < 8) {
      violations.push('Le mot de passe doit contenir au moins 8 caractères');
    }

    // Complexité
    const { isValid, errors } = this.validatePasswordStrength(password);
    if (!isValid) {
      violations.push(...errors);
    }

    // Pas d'espaces
    if (/\s/.test(password)) {
      violations.push('Le mot de passe ne doit pas contenir d\'espaces');
    }

    return {
      isCompliant: violations.length === 0,
      violations,
    };
  }
}
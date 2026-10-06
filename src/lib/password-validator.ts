// src/lib/password-validator.ts — Şifre güç kontrolü

export type PasswordCheck = {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
};

export type PasswordValidation = {
  isValid: boolean;
  score: number;          // 0-100
  strength: "zayıf" | "orta" | "güçlü" | "mükemmel";
  checks: PasswordCheck;
  errors: string[];
};

export function validatePassword(password: string): PasswordValidation {
  const checks: PasswordCheck = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };

  // Bonus: özel karakter
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const errors: string[] = [];
  if (!checks.minLength) errors.push("En az 8 karakter olmalı");
  if (!checks.hasUpper) errors.push("En az 1 büyük harf (A-Z)");
  if (!checks.hasLower) errors.push("En az 1 küçük harf (a-z)");
  if (!checks.hasNumber) errors.push("En az 1 rakam (0-9)");

  // Skor hesaplama
  let score = 0;
  if (checks.minLength) score += 25;
  if (checks.hasUpper) score += 20;
  if (checks.hasLower) score += 20;
  if (checks.hasNumber) score += 20;
  if (hasSpecial) score += 10;
  if (password.length >= 12) score += 5;

  score = Math.min(100, score);

  const strength: PasswordValidation["strength"] =
    score >= 90 ? "mükemmel"
    : score >= 70 ? "güçlü"
    : score >= 50 ? "orta"
    : "zayıf";

  const isValid = checks.minLength && checks.hasUpper && checks.hasLower && checks.hasNumber;

  return { isValid, score, strength, checks, errors };
}
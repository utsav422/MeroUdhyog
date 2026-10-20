export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  checks: { label: string; met: boolean }[];
};

export function evaluatePassword(password: string): PasswordStrength {
  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'An uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'A lowercase letter', met: /[a-z]/.test(password) },
    { label: 'A number', met: /[0-9]/.test(password) },
    { label: 'A symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const metCount = checks.filter((c) => c.met).length;
  const score = (metCount >= 5
    ? 4
    : metCount >= 4
      ? 3
      : metCount >= 3
        ? 2
        : metCount >= 1
          ? 1
          : 0) as PasswordStrength['score'];

  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['red', 'red', 'orange', 'yellow', 'teal'];

  return { score, label: labels[score], color: colors[score], checks };
}

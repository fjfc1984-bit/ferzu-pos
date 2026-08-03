// =============================================================================
// FERZU POS — AuthScreens.jsx [TOMBSTONE — NO EDITAR]
//
// Este archivo existía como monolito de 1500+ líneas. Fue refactorizado el
// 2026-08-02 en componentes aislados. Ahora solo re-exporta para compatibilidad
// con cualquier import que aún lo referencie.
//
// Usa los archivos individuales directamente:
//   ./LoginPage           ./RegisterPage        ./ForgotPasswordPage
//   ./ResetPasswordPage   ./BranchSelector      ./OnboardingWizard
//   ./PINLockScreen       ../../context/AuthContext
// =============================================================================

export { LoginPage }                         from './LoginPage';
export { RegisterPage }                      from './RegisterPage';
export { ForgotPasswordPage }                from './ForgotPasswordPage';
export { ResetPasswordPage }                 from './ResetPasswordPage';
export { BranchSelector }                    from './BranchSelector';
export { OnboardingWizard }                  from './OnboardingWizard';
export { PINLockScreen }                     from './PINLockScreen';
export { AuthContext, AuthProvider, useAuth } from '../../context/AuthContext';

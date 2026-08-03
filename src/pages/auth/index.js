// =============================================================================
// FERZU POS — Auth barrel
// Re-exporta todos los componentes de autenticación desde un punto único.
// Importa desde aquí si necesitas varios a la vez; de lo contrario, usa
// el archivo específico (e.g. './LoginPage') para mejor tree-shaking.
// =============================================================================

export { LoginPage }           from './LoginPage';
export { RegisterPage }        from './RegisterPage';
export { ForgotPasswordPage }  from './ForgotPasswordPage';
export { ResetPasswordPage }   from './ResetPasswordPage';
export { BranchSelector }      from './BranchSelector';
export { OnboardingWizard }    from './OnboardingWizard';
export { PINLockScreen }       from './PINLockScreen';

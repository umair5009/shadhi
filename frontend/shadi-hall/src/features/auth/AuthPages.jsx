import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarCheck, Gem, HandCoins, LineChart, MailCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { authApi } from '@/api/endpoints';
import { TextField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { passwordRule } from '@/lib/validation';

function AuthLayout({ children }) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__art">
        <div className="row" style={{ position: 'relative', zIndex: 1, gap: 12 }}>
          <div className="sidebar__logo">
            <Gem size={20} aria-hidden />
          </div>
          <strong style={{ color: '#fff', fontSize: 18 }}>Shadi Hall Manager</strong>
        </div>
        <div className="auth-layout__quote">
          <h2>Every booking, rupee and guest — in one place.</h2>
          <p>Run your halls with confidence: see who owes what, which dates are free and how the season is going, at a glance.</p>
        </div>
        <div className="auth-layout__points">
          <div>
            <CalendarCheck size={18} aria-hidden /> No more double bookings
          </div>
          <div>
            <HandCoins size={18} aria-hidden /> Outstanding balances always visible
          </div>
          <div>
            <LineChart size={18} aria-hidden /> Real profit per event and per month
          </div>
        </div>
      </div>
      <div className="auth-layout__form">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const [error, setError] = useState(null);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (exception) {
      setError(exception.message);
    }
  });

  return (
    <AuthLayout>
      <h1>Welcome back</h1>
      <p className="auth-card__lead">Sign in to manage bookings, payments and your team.</p>
      <FormProvider {...form}>
        <form className="stack" onSubmit={onSubmit} noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <TextField name="email" label="Email" type="email" autoComplete="username" autoFocus />
          <TextField name="password" label="Password" type="password" autoComplete="current-password" />
          <div className="row row--end">
            <Link to="/forgot-password" className="link-button">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" variant="primary" size="lg" block loading={form.formState.isSubmitting}>
            Sign in
          </Button>
        </form>
      </FormProvider>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const form = useForm({ resolver: zodResolver(z.object({ email: loginSchema.shape.email })), defaultValues: { email: '' } });
  const [sent, setSent] = useState(false);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await authApi.forgotPassword(values);
      setSent(true);
    } catch (error) {
      applyServerErrors(error, form.setError, ['email']);
    }
  });

  return (
    <AuthLayout>
      <h1>Reset your password</h1>
      <p className="auth-card__lead">Enter the email you sign in with and we’ll send you a link to choose a new password.</p>
      {sent ? (
        <div className="stack">
          <Alert tone="success" title="Check your email">
            If an account exists for that address, a reset link is on its way. The link expires in 30 minutes.
          </Alert>
          <Button to="/login" icon={MailCheck}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <FormProvider {...form}>
          <form className="stack" onSubmit={onSubmit} noValidate>
            <TextField name="email" label="Email" type="email" autoFocus />
            <Button type="submit" variant="primary" size="lg" block loading={form.formState.isSubmitting}>
              Send reset link
            </Button>
            <Link to="/login" className="link-button" style={{ textAlign: 'center' }}>
              Back to sign in
            </Link>
          </form>
        </FormProvider>
      )}
    </AuthLayout>
  );
}

const resetSchema = z
  .object({ password: passwordRule, confirm: z.string() })
  .refine((values) => values.password === values.confirm, { message: 'Passwords don’t match', path: ['confirm'] });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });
  const [error, setError] = useState(null);

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await authApi.resetPassword({ token, password });
      navigate('/login', { replace: true });
    } catch (exception) {
      setError(exception.message);
    }
  });

  return (
    <AuthLayout>
      <h1>Choose a new password</h1>
      <p className="auth-card__lead">Use at least 8 characters with a letter and a number.</p>
      {!token ? (
        <Alert tone="danger" title="This link is incomplete">
          Open the link from your email again, or <Link to="/forgot-password">request a new one</Link>.
        </Alert>
      ) : (
        <FormProvider {...form}>
          <form className="stack" onSubmit={onSubmit} noValidate>
            {error && <Alert tone="danger">{error}</Alert>}
            <TextField name="password" label="New password" type="password" autoComplete="new-password" autoFocus />
            <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
            <Button type="submit" variant="primary" size="lg" block loading={form.formState.isSubmitting}>
              Save new password
            </Button>
          </form>
        </FormProvider>
      )}
    </AuthLayout>
  );
}

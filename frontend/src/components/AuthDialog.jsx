// Presenta inicio de sesión, registro y recuperación de contraseña con Supabase Auth.
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthDialog({ open, onClose, initialMode = 'login' }) {
  const auth = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Cambia el formulario cuando se abre desde distintos puntos, por ejemplo checkout o recuperación.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError('');
      setMessage('');
    }
  }, [open, initialMode]);

  if (!open) return null;

  // Valida campos de cuenta antes de delegar la autenticación y el hash de contraseñas a Supabase.
  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    if (!auth.configured) { setError('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en frontend/.env.'); return; }
    if (mode !== 'reset' && !emailPattern.test(email)) { setError('Ingresá un correo válido.'); return; }
    if (mode === 'register') {
      const firstName = String(form.get('nombre') || '').trim();
      const lastName = String(form.get('apellido') || '').trim();
      if (!firstName || !lastName) { setError('Completá nombre y apellido.'); return; }
      if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    }
    if (mode === 'login' && password.length < 6) { setError('Revisá la contraseña e intentá nuevamente.'); return; }
    if (mode === 'reset' && password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: authError } = await auth.signIn(email, password);
        if (authError) throw authError;
        onClose();
      } else if (mode === 'register') {
        const { data, error: authError } = await auth.signUp(email, password, String(form.get('nombre')).trim(), String(form.get('apellido')).trim());
        if (authError) throw authError;
        if (!data.session) setMessage('Cuenta creada. Revisá tu correo para confirmar el registro.');
        else onClose();
      } else if (mode === 'forgot') {
        const { error: authError } = await auth.recoverPassword(email);
        if (authError) throw authError;
        setMessage('Si el correo corresponde a una cuenta, recibirás un enlace para restablecer la contraseña.');
      } else {
        const { error: authError } = await auth.updatePassword(password);
        if (authError) throw authError;
        setMessage('Contraseña actualizada. Ya podés seguir usando tu cuenta.');
      }
    } catch (authError) {
      setError(authError.message || 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  }

  const title = { login: 'Iniciar sesión', register: 'Crear cuenta', forgot: 'Recuperar contraseña', reset: 'Elegir contraseña nueva' }[mode];
  return <div className="react-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="react-form-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="react-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
      <h2 id="auth-title">{title}</h2>
      <form onSubmit={submit} noValidate>
        {mode === 'register' && <div className="react-form-row"><label>Nombre<input name="nombre" autoComplete="given-name" required /></label><label>Apellido<input name="apellido" autoComplete="family-name" required /></label></div>}
        {mode !== 'reset' && <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>}
        {(mode === 'login' || mode === 'register' || mode === 'reset') && <label>Contraseña<input name="password" type="password" minLength="6" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>}
        {error && <p className="react-form-error" role="alert">{error}</p>}
        {message && <p className="react-form-success" role="status">{message}</p>}
        <button className="btn btn-primary btn-full" disabled={busy}>{busy ? 'PROCESANDO…' : mode === 'login' ? 'INGRESAR' : mode === 'register' ? 'CREAR CUENTA' : mode === 'forgot' ? 'ENVIAR ENLACE' : 'ACTUALIZAR CONTRASEÑA'}</button>
      </form>
      <div className="react-auth-links">
        {mode !== 'login' && mode !== 'reset' && <button onClick={() => { setMode('login'); setError(''); setMessage(''); }}>Iniciar sesión</button>}
        {mode !== 'register' && mode !== 'reset' && <button onClick={() => { setMode('register'); setError(''); setMessage(''); }}>Crear cuenta</button>}
        {mode === 'login' && <button onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}>Olvidé mi contraseña</button>}
      </div>
    </section>
  </div>;
}

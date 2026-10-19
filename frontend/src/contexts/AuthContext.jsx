// Mantiene la sesión Supabase compartida entre páginas, modales y llamadas a la API.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState(null);
  const [roleReady, setRoleReady] = useState(false);

  // Recupera la sesión almacenada por el SDK y escucha renovaciones/cierres de sesión.
  useEffect(() => {
    if (!supabase) { setReady(true); return undefined; }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('No se pudo recuperar la sesión Supabase:', error.message);
      setSession(data?.session || null);
      setReady(true);
    }).catch((error) => {
      if (active) {
        console.error('Falló la recuperación de la sesión Supabase:', error.message);
        setSession(null);
        setReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setReady(true);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  // Consulta el rol asignado en el backend; sirve para navegación, pero no sustituye la autorización de cada endpoint.
  useEffect(() => {
    if (!session) { setRole(null); setRoleReady(true); return undefined; }
    let active = true;
    setRoleReady(false);
    fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/me`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((profile) => { if (active) setRole(profile?.role || null); })
      .catch(() => { if (active) setRole(null); })
      .finally(() => { if (active) setRoleReady(true); });
    return () => { active = false; };
  }, [session]);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    role,
    roleReady,
    ready,
    configured: Boolean(supabase),
    // Entrega el token vigente al backend para que valide identidad con Supabase Auth.
    getAccessToken: async () => {
      if (!supabase) throw new Error('Configurá Supabase en frontend/.env para usar tu cuenta.');
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error('Tu sesión venció. Iniciá sesión nuevamente.');
      return data.session.access_token;
    },
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, nombre, apellido) => supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre, apellido } },
    }),
    signOut: () => supabase.auth.signOut(),
    recoverPassword: (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
    updatePassword: (password) => supabase.auth.updateUser({ password }),
  }), [session, ready, role, roleReady]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Evita que un componente use autenticación fuera del proveedor global.
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}

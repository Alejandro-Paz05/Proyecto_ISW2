import { useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase-navegador';

/**
 * Si hay una sesión abierta en este navegador.
 *
 * Sirve para una sola cosa: elegir entre mostrar "Ingresar" o "Mi cuenta".
 * Lo que de verdad protege cada página y cada ruta lo decide el servidor, que
 * valida la sesión contra Supabase en cada petición.
 *
 * Usa getSession y no getUser porque lee la cookie sin ir a la red: para
 * decidir el texto de un enlace no vale la pena una consulta en cada visita.
 */
export function useSesionAbierta() {
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase) return undefined;

    let vigente = true;
    supabase.auth.getSession().then(({ data }) => {
      if (vigente) setAbierta(Boolean(data?.session));
    });

    // Entrar o salir en otra pestaña también cambia este enlace.
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (vigente) setAbierta(Boolean(sesion));
    });

    return () => {
      vigente = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  return abierta;
}

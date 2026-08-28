export async function getFormDraft(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setFormDraft(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // El reporte sigue funcionando aunque el navegador bloquee almacenamiento.
  }
}

export async function removeFormDraft(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // No bloquear el cierre o envío por un fallo secundario de almacenamiento.
  }
}

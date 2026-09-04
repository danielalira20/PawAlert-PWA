
import re


def validar_telefono(telefono: str) -> bool:
    """Valida que el teléfono tenga exactamente 10 dígitos numéricos."""
    return bool(re.fullmatch(r"\d{10}", telefono.strip()))


def validar_email(email: str) -> bool:
    """Valida formato básico de correo electrónico."""
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email.strip()))


def validar_nombre(valor: str, requerido: bool = True, campo: str = "nombre") -> tuple[bool, str]:
    """Valida nombre/apellido: solo letras (incluye acentos y ñ/Ñ) y
    espacios, entre 3 y 30 caracteres. Mismas reglas que validarNombre en
    src/utils/validators.ts (frontend). `campo` solo cambia la redacción
    del mensaje (ej. "apellido paterno") — se reusa esta misma función
    para nombre, apellido_paterno, nombre_responsable, etc."""
    val = valor.strip()
    if not val:
        if requerido:
            return False, f"El {campo} es obligatorio."
        return True, ""
    if len(val) < 3:
        return False, f"El {campo} debe tener al menos 3 caracteres."
    if len(val) > 30:
        return False, f"El {campo} no puede tener más de 30 caracteres."
    patron = r"[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+(?:[ '\-’][A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+)*"
    if not re.fullmatch(patron, val):
        return False, f"El {campo} solo puede contener letras y separadores simples."
    return True, ""


def normalizar_nombre(valor: str) -> str:
    """Normalización canónica antes de persistir un nombre validado."""
    return re.sub(r"\s+", " ", valor).strip()


def validar_password(password: str) -> tuple[bool, str]:
    """Valida la fortaleza de la contraseña: mínimo 8 caracteres, al menos
    una mayúscula, una minúscula y un número. Regresa (es_valida, mensaje)."""
    if len(password) < 8:
        return False, "La contraseña debe tener al menos 8 caracteres."
    if not re.search(r"[A-Z]", password):
        return False, "La contraseña debe incluir al menos una letra mayúscula."
    if not re.search(r"[a-z]", password):
        return False, "La contraseña debe incluir al menos una letra minúscula."
    if not re.search(r"\d", password):
        return False, "La contraseña debe incluir al menos un número."
    if len(password) > 128:
        return False, "La contraseña no puede tener más de 128 caracteres."
    return True, ""

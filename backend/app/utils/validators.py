
import re


def validar_telefono(telefono: str) -> bool:
    """Valida que el teléfono tenga exactamente 10 dígitos numéricos."""
    return bool(re.fullmatch(r"\d{10}", telefono.strip()))


def validar_email(email: str) -> bool:
    """Valida formato básico de correo electrónico."""
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email.strip()))


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
    return True, ""

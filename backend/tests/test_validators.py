import pytest

from app.utils.validators import validar_nombre


def test_rechaza_vacio_requerido_default():
    valido, mensaje = validar_nombre("")
    assert valido is False
    assert "obligatorio" in mensaje


def test_rechaza_solo_espacios():
    valido, mensaje = validar_nombre("   ")
    assert valido is False
    assert "obligatorio" in mensaje


def test_acepta_vacio_no_requerido():
    valido, mensaje = validar_nombre("", requerido=False)
    assert valido is True
    assert mensaje == ""


def test_rechaza_un_caracter():
    valido, mensaje = validar_nombre("A")
    assert valido is False
    assert "al menos 3 caracteres" in mensaje


def test_rechaza_dos_caracteres():
    valido, mensaje = validar_nombre("An")
    assert valido is False
    assert "al menos 3 caracteres" in mensaje


def test_acepta_exactamente_tres_caracteres():
    valido, mensaje = validar_nombre("Ana")
    assert valido is True
    assert mensaje == ""


def test_acepta_exactamente_treinta_caracteres():
    valido, _ = validar_nombre("A" * 30)
    assert valido is True


def test_rechaza_treintayuno_caracteres():
    valido, mensaje = validar_nombre("A" * 31)
    assert valido is False
    assert "más de 30 caracteres" in mensaje


def test_rechaza_digitos():
    valido, mensaje = validar_nombre("Ana2")
    assert valido is False
    assert "solo puede contener letras y espacios" in mensaje


@pytest.mark.parametrize("simbolo", ["%", "#", "@"])
def test_rechaza_simbolos(simbolo):
    valido, mensaje = validar_nombre(f"An{simbolo}a")
    assert valido is False
    assert "solo puede contener letras y espacios" in mensaje


def test_rechaza_guion():
    valido, mensaje = validar_nombre("Ana-Luz")
    assert valido is False
    assert "solo puede contener letras y espacios" in mensaje


def test_rechaza_apostrofe():
    valido, mensaje = validar_nombre("O'Brian")
    assert valido is False
    assert "solo puede contener letras y espacios" in mensaje


@pytest.mark.parametrize("nombre", ["áéíóú", "ÁÉÍÓÚ", "Muñoz", "Ñoño", "Güemes"])
def test_acepta_acentos_y_enie(nombre):
    valido, _ = validar_nombre(nombre)
    assert valido is True


def test_acepta_nombre_compuesto_con_espacio():
    valido, mensaje = validar_nombre("María José")
    assert valido is True
    assert mensaje == ""


def test_usa_etiqueta_dada_en_mensaje_de_obligatorio():
    _, mensaje = validar_nombre("", campo="apellido paterno")
    assert mensaje == "El apellido paterno es obligatorio."


def test_usa_nombre_como_etiqueta_por_defecto():
    _, mensaje = validar_nombre("")
    assert mensaje == "El nombre es obligatorio."

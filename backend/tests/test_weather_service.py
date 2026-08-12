from app.services import weather_service


def test_clasifica_temperatura_normal_como_cero():
    assert weather_service._classify_temperature_score(24) == 0


def test_clasifica_calor_extremo_como_cien():
    assert weather_service._classify_temperature_score(37.2) == 100


def test_clasifica_frio_extremo_como_cien():
    assert weather_service._classify_temperature_score(2) == 100


def test_clasifica_condicion_normal_como_cero():
    assert weather_service._classify_condition_score(800) == 0


def test_clasifica_lluvia_moderada_como_cincuenta():
    assert weather_service._classify_condition_score(501) == 50


def test_clasifica_lluvia_intensa_como_cien():
    assert weather_service._classify_condition_score(502) == 100


def test_clasifica_tormenta_electrica_como_cien():
    assert weather_service._classify_condition_score(211) == 100


def test_gana_el_riesgo_mas_alto_entre_temperatura_y_condicion():
    assert weather_service._classify_score(temperature_c=24, condition_code=502) == 100
    assert weather_service._classify_score(temperature_c=37, condition_code=800) == 100
    assert weather_service._classify_score(temperature_c=24, condition_code=501) == 50
    assert weather_service._classify_score(temperature_c=24, condition_code=800) == 0

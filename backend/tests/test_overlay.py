import pytest
from app.location import _sample_indices
from app.overlay import parse_overlay_text


def test_parse_overlay_text_extracts_sewer_operational_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_OVERLAY_CITIES", "Musterstadt")
    parsed = parse_overlay_text(
        """
        Musterstadt
        Musterweg
        100000001
        100000002
        Flr.:in
        DN250 Beton
        9,06m 00:01:29
        Neigung: -0,9 %
        09:44:17
        17.01.25
        """
    )

    assert parsed["city"] == "Musterstadt"
    assert parsed["street"] == "Musterweg"
    assert parsed["dn"] == "DN 250"
    assert parsed["material"] == "Beton"
    assert parsed["distance_m"] == 9.06
    assert parsed["inspection_time"] == "09:44:17"
    assert parsed["inspection_date"] == "17.01.25"
    assert parsed["tilt_percent"] == -0.9


def test_parse_overlay_text_extracts_labelled_street() -> None:
    parsed = parse_overlay_text(
        """
        Erfassung nach DIN EN 13508-2
        Straße: BEISPIELSTRASSE
        Von S.: 100000003
        Nach S.: 100000004
        Nennw.: 400
        Material: Steinzeug
        """
    )

    assert parsed["street"] == "BEISPIELSTRASSE"
    assert parsed["upstream_id"] == "100000003"
    assert parsed["downstream_id"] == "100000004"
    assert parsed["dn"] == "DN 400"
    assert parsed["material"] == "Steinzeug"


def test_ocr_sampling_uses_initial_frames_only() -> None:
    assert _sample_indices(frame_count=1200, max_frames=6) == [0, 1, 2, 3, 4, 5]


def test_parse_overlay_text_handles_ocr_meter_variants(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_OVERLAY_CITIES", "Musterstadt")
    parsed = parse_overlay_text(
        """
        Musterstadt
        Musterweg
        Fir.:in DN250 7,84" 00:01:24 -0,5%
        """
    )

    assert parsed["street"] == "Musterweg"
    assert parsed["dn"] == "DN 250"
    assert parsed["distance_m"] == 7.84

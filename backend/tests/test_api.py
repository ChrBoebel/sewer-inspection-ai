from pathlib import Path

from app.analysis.detectors import PlaceholderDetector


def upload_sample(client, sample_video: Path) -> dict:
    with sample_video.open("rb") as handle:
        response = client.post(
            "/api/videos/upload",
            files={"file": ("sample.mp4", handle, "video/mp4")},
            data={"meter_start": "0", "meter_end": "12.5"},
        )
    assert response.status_code == 201, response.text
    return response.json()


def test_upload_accepts_optional_location(client, sample_video: Path) -> None:
    with sample_video.open("rb") as handle:
        response = client.post(
            "/api/videos/upload",
            files={"file": ("sample.mp4", handle, "video/mp4")},
            data={
                "meter_start": "0",
                "meter_end": "12.5",
                "location_label": "Beispielstraße",
                "location_address": "Beispielstraße, Musterstadt",
                "location_latitude": "47.999",
                "location_longitude": "7.842",
            },
        )
    assert response.status_code == 201, response.text
    location = response.json()["location"]
    assert location["status"] == "confirmed"
    assert location["source"] == "manual"
    assert location["label"] == "Beispielstraße"
    assert location["latitude"] == 47.999
    assert location["longitude"] == 7.842


def test_upload_persists_stammdaten_and_overlay(
    client,
    monkeypatch,
    sample_video: Path,
) -> None:
    from app import overlay as overlay_service

    monkeypatch.setattr(
        overlay_service,
        "extract_overlay_metadata",
        lambda path, max_frames: {
            "raw_text": "Musterstadt\nMusterweg\nDN250 Beton\n9,06m",
            "confidence": 0.75,
            "street": "Musterweg",
            "city": "Musterstadt",
            "dn": "DN 250",
            "material": "Beton",
            "distance_m": 9.06,
            "direction": "Flr.:in",
            "inspection_date": "17.01.25",
            "inspection_time": "09:44:17",
            "upstream_id": "100000001",
            "downstream_id": "100000002",
            "clock_position": "Uhrbild erkannt",
            "tilt_percent": -0.9,
        },
    )

    with sample_video.open("rb") as handle:
        response = client.post(
            "/api/videos/upload",
            files={"file": ("sample.mp4", handle, "video/mp4")},
            data={
                "meter_start": "3",
                "meter_end": "15.5",
                "route_name": "Beispielstraße",
                "pipe_diameter": "DN 300",
                "pipe_material": "Beton",
                "inspection_date": "2026-05-10",
            },
        )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["route_name"] == "Beispielstraße"
    assert payload["pipe_diameter"] == "DN 300"
    assert payload["pipe_material"] == "Beton"
    assert payload["inspection_date"] == "2026-05-10"
    assert payload["overlay"]["street"] == "Musterweg"
    assert payload["overlay"]["dn"] == "DN 250"
    assert payload["overlay"]["distance_m"] == 9.06


def test_upload_list_and_get_video(client, sample_video: Path) -> None:
    uploaded = upload_sample(client, sample_video)
    assert uploaded["original_filename"] == "sample.mp4"
    assert uploaded["duration_seconds"] > 0
    assert uploaded["width"] == 160
    assert uploaded["height"] == 120
    assert uploaded["video_url"].startswith("/files/uploads/")
    assert uploaded["location"]["status"] == "missing"

    listed = client.get("/api/videos")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == uploaded["id"]

    detail = client.get(f"/api/videos/{uploaded['id']}")
    assert detail.status_code == 200
    assert detail.json()["id"] == uploaded["id"]


def test_patch_video_location_validates_coordinates(client, sample_video: Path) -> None:
    video = upload_sample(client, sample_video)
    response = client.patch(
        f"/api/videos/{video['id']}/location",
        json={
            "latitude": 48.005,
            "longitude": 7.853,
            "label": "Schacht 12",
            "address": "Schacht 12, Musterstadt",
            "status": "confirmed",
        },
    )
    assert response.status_code == 200, response.text
    location = response.json()["location"]
    assert location["status"] == "confirmed"
    assert location["source"] == "manual"
    assert location["latitude"] == 48.005
    assert location["longitude"] == 7.853

    invalid = client.patch(
        f"/api/videos/{video['id']}/location",
        json={"latitude": 48.005, "status": "confirmed"},
    )
    assert invalid.status_code == 400


def test_suggest_video_location_uses_service_and_can_be_confirmed(
    client,
    monkeypatch,
    sample_video: Path,
) -> None:
    from app import location as location_service

    video = upload_sample(client, sample_video)

    monkeypatch.setattr(
        location_service,
        "suggest_video_location",
        lambda video, settings, repo, query=None: {
            "latitude": 47.997,
            "longitude": 7.851,
            "label": "OCR Beispielstraße",
            "address": "Beispielstraße, Musterstadt",
            "source": "ocr",
            "status": "suggested",
            "confidence": 0.64,
            "raw_text": "Beispielstraße",
        },
    )

    suggested = client.post(f"/api/videos/{video['id']}/location/suggest")
    assert suggested.status_code == 200, suggested.text
    location = suggested.json()["location"]
    assert location["status"] == "suggested"
    assert location["source"] == "ocr"

    confirmed = client.patch(
        f"/api/videos/{video['id']}/location",
        json={**location, "status": "confirmed"},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["location"]["status"] == "confirmed"


def test_list_models(client) -> None:
    response = client.get("/api/models")
    assert response.status_code == 200
    models = response.json()
    assert [model["id"] for model in models] == ["placeholder", "sewer-hybrid-review"]
    assert models[1]["cached"] is False
    assert models[1]["lazy_download"] is False
    assert "roots" in models[1]["classes"]
    assert "deposit" in models[1]["classes"]


def test_analyze_review_report_and_websocket(
    client,
    monkeypatch,
    sample_video: Path,
) -> None:
    from app.analysis import pipeline as pipeline_module

    monkeypatch.setattr(
        pipeline_module,
        "build_detector",
        lambda model_id, settings: PlaceholderDetector(),
    )
    monkeypatch.setattr(
        pipeline_module.overlay_service,
        "extract_overlay_metadata_from_frame",
        lambda frame: {
            "raw_text": "Musterstadt\nMusterweg\nDN250 Beton\n9,06m",
            "confidence": 0.83,
            "street": "Musterweg",
            "city": "Musterstadt",
            "dn": "DN 250",
            "material": "Beton",
            "distance_m": 9.06,
            "direction": "Flr.:in",
            "inspection_date": "17.01.25",
            "inspection_time": "09:44:17",
            "upstream_id": "100000001",
            "downstream_id": "100000002",
            "clock_position": None,
            "tilt_percent": -0.9,
        },
    )
    video = upload_sample(client, sample_video)
    analyze = client.post(f"/api/videos/{video['id']}/analyze")
    assert analyze.status_code == 202, analyze.text
    job = analyze.json()
    assert job["status"] == "completed"
    assert job["progress"] == 100
    assert job["model_id"] == "placeholder"

    job_response = client.get(f"/api/jobs/{job['id']}")
    assert job_response.status_code == 200
    assert job_response.json()["status"] == "completed"

    latest_job_response = client.get(f"/api/videos/{video['id']}/jobs/latest")
    assert latest_job_response.status_code == 200
    assert latest_job_response.json()["id"] == job["id"]

    events_response = client.get(f"/api/videos/{video['id']}/events")
    assert events_response.status_code == 200
    events = events_response.json()
    assert events
    assert events[0]["review_status"] == "pending"
    assert events[0]["snapshot_frame_index"] is not None
    assert events[0]["snapshot_url"].startswith(f"/files/frames/{video['id']}/")
    assert events[0]["snapshot_detections"]
    assert events[0]["snapshot_detections"][0]["source_model"] == "placeholder"
    assert len(events[0]["snapshot_detections"][0]["bbox"]) == 4
    assert events[0]["overlay"]["street"] == "Musterweg"
    assert events[0]["overlay"]["distance_m"] == 9.06
    assert events[0]["meter_start"] == 9.06
    snapshot_response = client.get(events[0]["snapshot_url"])
    assert snapshot_response.status_code == 200

    review = client.patch(
        f"/api/events/{events[0]['id']}/review",
        json={
            "status": "accepted",
            "note": "validated in test",
            "reminder_due_at": "2020-01-01T00:00:00Z",
        },
    )
    assert review.status_code == 200, review.text
    assert review.json()["review_status"] == "accepted"
    assert review.json()["reminder_due_at"] == "2020-01-01T00:00:00Z"
    assert review.json()["reminder_created_at"] is not None
    assert review.json()["reminder_resolved_at"] is None

    resolved = client.patch(
        f"/api/events/{events[0]['id']}/review",
        json={"status": "accepted", "note": "validated again", "resolve_reminder": True},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["reminder_resolved_at"] is not None

    report = client.get(f"/api/videos/{video['id']}/report")
    assert report.status_code == 200, report.text
    assert report.json()["summary"]["event_count"] == len(events)
    assert report.json()["summary"]["accepted"] == 1

    with client.websocket_connect(f"/api/jobs/{job['id']}/stream") as websocket:
        streamed = websocket.receive_json()
    assert streamed["status"] == "completed"


def test_active_jobs_endpoint_lists_queued_and_running(client, sample_video: Path) -> None:
    from app.config import get_settings
    from app.repository import Repository

    video = upload_sample(client, sample_video)
    repo = Repository(get_settings().db_path)
    repo.initialize()
    queued_job = repo.create_job(video["id"])
    # Der Placeholder ist in diesem Build öffentlich — für den Filtertest
    # braucht es ein registriertes, aber nicht öffentliches Modell.
    hidden_model_job = repo.create_job(video["id"], model_id="iswds-yolov8n")
    completed_job = repo.create_job(video["id"])
    repo.update_job(completed_job["id"], status="completed", progress=100)

    response = client.get("/api/jobs/active")
    assert response.status_code == 200
    active_ids = {job["id"] for job in response.json()}
    assert queued_job["id"] in active_ids
    assert hidden_model_job["id"] not in active_ids
    assert completed_job["id"] not in active_ids


def test_missing_video_returns_404(client) -> None:
    response = client.get("/api/videos/does-not-exist")
    assert response.status_code == 404


def test_unknown_model_id_returns_400(client, sample_video: Path) -> None:
    video = upload_sample(client, sample_video)
    response = client.post(f"/api/videos/{video['id']}/analyze", json={"model_id": "missing"})
    assert response.status_code == 400


def test_placeholder_model_is_public_api(client, sample_video: Path) -> None:
    # Ohne mitgelieferte Gewichte ist der Placeholder der Default und muss
    # über die öffentliche API erreichbar sein — siehe DATA.md.
    video = upload_sample(client, sample_video)
    response = client.post(
        f"/api/videos/{video['id']}/analyze",
        json={"model_id": "placeholder"},
    )
    assert response.status_code == 202


def test_non_public_model_is_rejected(client, sample_video: Path) -> None:
    video = upload_sample(client, sample_video)
    response = client.post(
        f"/api/videos/{video['id']}/analyze",
        json={"model_id": "iswds-yolov8n"},
    )
    assert response.status_code == 400

from pathlib import Path

import pytest
from app.ml.train_smoke import create_synthetic_yolo_dataset, run_train_smoke


def test_train_smoke_dataset_creation(tmp_path: Path) -> None:
    yaml_path = create_synthetic_yolo_dataset(tmp_path, imgsz=64)
    assert yaml_path.exists()
    assert "smoke_damage" in yaml_path.read_text(encoding="utf-8")
    assert (tmp_path / "synthetic_yolo" / "images" / "train" / "sample_0.jpg").exists()
    assert (tmp_path / "synthetic_yolo" / "labels" / "train" / "sample_0.txt").exists()


@pytest.mark.train_smoke
def test_ultralytics_train_smoke_runs(tmp_path: Path) -> None:
    pytest.importorskip("ultralytics")
    result = run_train_smoke(tmp_path, epochs=1, imgsz=64)
    assert Path(result["best"]).exists()

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.analysis.detectors import (
    ISWDS_CLASS_NAMES,
    DamageDetector,
    OnnxRtDetrDetector,
    OnnxYoloDetector,
    PlaceholderDetector,
    RoutedEnsembleDetector,
    YoloDetector,
)
from app.config import Settings, project_root

PLACEHOLDER_MODEL_ID = "placeholder"
HYBRID_MODEL_ID = "sewer-hybrid-review"
# Ohne mitgelieferte Gewichte ist der deterministische Placeholder der
# einzige Detektor, der out of the box läuft. Siehe DATA.md.
DEFAULT_MODEL_ID = PLACEHOLDER_MODEL_ID
PUBLIC_MODEL_IDS = (PLACEHOLDER_MODEL_ID, HYBRID_MODEL_ID)
ISWDS_REPO_ID = "mogurlu/Istanbul_Sewer_Defect_Dataset_ISWDS_Models"
ISWDS_LICENSE = "Fair Non-Commercial Research License"
ISWDS_SOURCE_URL = f"https://huggingface.co/{ISWDS_REPO_ID}"
SEWER_CLASS_NAMES = (
    "crack",
    "joint_fault",
    "roots",
    "connection_defect",
    "deposit",
    "obstruction_or_other",
)
SEWER_YOLO26M_PATH = (
    "data/models/sewer/yolo26m_1024/best.pt"
)
SEWER_FINETUNE_YOLO26S_PATH = (
    "data/models/sewer/yolo26s_finetune_640/last.pt"
)


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    architecture: str
    source: str
    source_url: str
    license: str
    detector_type: str
    filename: Optional[str] = None
    local_path: Optional[str] = None
    extra_local_paths: tuple[str, ...] = ()
    classes: tuple[str, ...] = ()
    image_size: int = 640
    description: str = ""


MODEL_SPECS: Dict[str, ModelSpec] = {
    PLACEHOLDER_MODEL_ID: ModelSpec(
        id=PLACEHOLDER_MODEL_ID,
        label="Placeholder Detector",
        architecture="deterministic-demo",
        source="local",
        source_url="",
        license="internal demo",
        detector_type="placeholder",
        classes=PlaceholderDetector.classes,
        description="Deterministische Demo-Boxen ohne externes Modell.",
    ),
    "sewer-yolo26m": ModelSpec(
        id="sewer-yolo26m",
        label="Sewer YOLO26m",
        architecture="YOLO26m PT",
        source="local RunPod training",
        source_url="",
        license="weights not distributed (see DATA.md)",
        detector_type="ultralytics-yolo",
        local_path=SEWER_YOLO26M_PATH,
        classes=SEWER_CLASS_NAMES,
        image_size=1024,
        description=(
            "Lokales lokales Modell aus dem RunPod-Training; aktuell bester Kandidat "
            "fuer markierte markierte Wurzeln."
        ),
    ),
    HYBRID_MODEL_ID: ModelSpec(
        id=HYBRID_MODEL_ID,
        label="Hybrid Review",
        architecture="YOLO26m + YOLO26s fine-tune",
        source="local routed ensemble",
        source_url="",
        license="weights not distributed (see DATA.md)",
        detector_type="routed-hybrid",
        local_path=SEWER_YOLO26M_PATH,
        extra_local_paths=(SEWER_FINETUNE_YOLO26S_PATH,),
        classes=SEWER_CLASS_NAMES,
        image_size=1024,
        description=(
            "Experimenteller Review-Hybrid: YOLO26m fuer crack/joint_fault/roots "
            "plus high-recall Fine-Tune fuer crack/connection_defect/deposit."
        ),
    ),
    "iswds-yolov8n": ModelSpec(
        id="iswds-yolov8n",
        label="ISWDS YOLOv8n",
        architecture="YOLOv8n ONNX",
        source="Hugging Face",
        source_url=ISWDS_SOURCE_URL,
        license=ISWDS_LICENSE,
        detector_type="onnx-yolo",
        filename="ISWDS_yolov8n_16b_50e.onnx",
        classes=ISWDS_CLASS_NAMES,
        description="Kleinstes ISWDS-YOLO-Modell, gut fuer CPU-Smokes und schnelle Demos.",
    ),
    "iswds-yolov11n": ModelSpec(
        id="iswds-yolov11n",
        label="ISWDS YOLOv11n",
        architecture="YOLOv11n ONNX",
        source="Hugging Face",
        source_url=ISWDS_SOURCE_URL,
        license=ISWDS_LICENSE,
        detector_type="onnx-yolo",
        filename="ISWDS_yolov11n_16b_100e.onnx",
        classes=ISWDS_CLASS_NAMES,
        description="YOLOv11n-Export aus dem ISWDS-Modellpaket.",
    ),
    "iswds-yolov12n": ModelSpec(
        id="iswds-yolov12n",
        label="ISWDS YOLOv12n",
        architecture="YOLOv12n ONNX",
        source="Hugging Face",
        source_url=ISWDS_SOURCE_URL,
        license=ISWDS_LICENSE,
        detector_type="onnx-yolo",
        filename="ISWDS_yolov12n_12b_50e.onnx",
        classes=ISWDS_CLASS_NAMES,
        description="YOLOv12n-Export aus dem ISWDS-Modellpaket.",
    ),
    "iswds-rtdetr-v2": ModelSpec(
        id="iswds-rtdetr-v2",
        label="ISWDS RT-DETR v2",
        architecture="RT-DETR v2 ONNX",
        source="Hugging Face",
        source_url=ISWDS_SOURCE_URL,
        license=ISWDS_LICENSE,
        detector_type="onnx-rtdetr",
        filename="ISWDS_RT-DETR_v2_model.onnx",
        classes=ISWDS_CLASS_NAMES,
        description="Staerkerer ISWDS-Kandidat, auf CPU typischerweise langsamer.",
    ),
}


def list_model_specs() -> List[ModelSpec]:
    return [MODEL_SPECS[model_id] for model_id in PUBLIC_MODEL_IDS]


def get_model_spec(model_id: str) -> Optional[ModelSpec]:
    return MODEL_SPECS.get(model_id)


def get_public_model_spec(model_id: str) -> Optional[ModelSpec]:
    if model_id not in PUBLIC_MODEL_IDS:
        return None
    return MODEL_SPECS.get(model_id)


def model_cache_path(settings: Settings, spec: ModelSpec) -> Optional[Path]:
    if spec.local_path is not None:
        return (project_root() / spec.local_path).resolve()
    if spec.filename is None:
        return None
    return settings.models_dir / "iswds" / spec.filename


def model_cache_paths(settings: Settings, spec: ModelSpec) -> List[Path]:
    path = model_cache_path(settings, spec)
    paths = [path] if path is not None else []
    paths.extend((project_root() / local_path).resolve() for local_path in spec.extra_local_paths)
    return paths


def model_payload(settings: Settings, spec: ModelSpec) -> Dict[str, Any]:
    paths = model_cache_paths(settings, spec)
    return {
        "id": spec.id,
        "label": spec.label,
        "architecture": spec.architecture,
        "source": spec.source,
        "source_url": spec.source_url,
        "license": spec.license,
        "description": spec.description,
        "cached": bool(paths and all(model_path.exists() for model_path in paths)),
        "lazy_download": spec.filename is not None and spec.local_path is None,
        "filename": spec.filename or (Path(spec.local_path).name if spec.local_path else None),
        "classes": list(spec.classes),
    }


def ensure_model_file(settings: Settings, spec: ModelSpec) -> Path:
    path = model_cache_path(settings, spec)
    if spec.local_path is not None:
        missing_paths = [
            model_path
            for model_path in model_cache_paths(settings, spec)
            if not model_path.exists()
        ]
        if not path or missing_paths:
            missing = ", ".join(str(model_path) for model_path in missing_paths)
            raise FileNotFoundError(f"Local model file not found: {missing}")
        return path
    if path is None or spec.filename is None:
        raise ValueError(f"Model {spec.id} does not use a downloadable file")
    if path.exists():
        return path

    try:
        from huggingface_hub import hf_hub_download
    except ImportError as exc:
        raise RuntimeError(
            "huggingface_hub is required for lazy ISWDS model downloads"
        ) from exc

    path.parent.mkdir(parents=True, exist_ok=True)
    downloaded = hf_hub_download(
        repo_id=ISWDS_REPO_ID,
        filename=spec.filename,
        repo_type="model",
        local_dir=str(path.parent),
    )
    return Path(downloaded)


def build_detector(model_id: str, settings: Settings) -> DamageDetector:
    spec = get_model_spec(model_id)
    if spec is None:
        raise ValueError(f"Unknown model_id: {model_id}")
    if spec.detector_type == "placeholder":
        return PlaceholderDetector()

    model_path = ensure_model_file(settings, spec)
    if spec.detector_type == "onnx-yolo":
        return OnnxYoloDetector(model_path, source_model=spec.id)
    if spec.detector_type == "onnx-rtdetr":
        return OnnxRtDetrDetector(model_path, source_model=spec.id)
    if spec.detector_type == "ultralytics-yolo":
        return YoloDetector(model_path, image_size=spec.image_size, source_model=spec.id)
    if spec.detector_type == "routed-hybrid":
        fine_tune_path = (project_root() / SEWER_FINETUNE_YOLO26S_PATH).resolve()
        if not fine_tune_path.exists():
            raise FileNotFoundError(f"Local model file not found: {fine_tune_path}")
        return RoutedEnsembleDetector(
            routes=[
                (
                    YoloDetector(
                        model_path,
                        image_size=1024,
                        source_model="sewer-yolo26m",
                    ),
                    {"crack", "joint_fault", "roots"},
                ),
                (
                    YoloDetector(
                        fine_tune_path,
                        confidence_threshold=0.15,
                        image_size=640,
                        source_model="sewer-yolo26s-finetune",
                    ),
                    {"crack", "connection_defect", "deposit"},
                ),
            ]
        )
    raise ValueError(f"Unsupported detector type: {spec.detector_type}")

import argparse
from pathlib import Path
from typing import Dict

from PIL import Image, ImageDraw


def create_synthetic_yolo_dataset(output: Path, imgsz: int = 64) -> Path:
    output = output.resolve()
    dataset_dir = output / "synthetic_yolo"
    for split in ("train", "val"):
        (dataset_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (dataset_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    samples = [("train", 0), ("train", 1), ("val", 2)]
    for split, index in samples:
        image = Image.new("RGB", (imgsz, imgsz), color=(28, 31, 36))
        draw = ImageDraw.Draw(image)
        offset = 8 + index * 3
        draw.rectangle(
            [offset, offset + 6, offset + imgsz // 3, offset + imgsz // 4 + 6],
            outline=(225, 88, 82),
            width=2,
        )
        image_path = dataset_dir / "images" / split / f"sample_{index}.jpg"
        label_path = dataset_dir / "labels" / split / f"sample_{index}.txt"
        image.save(image_path)
        label_path.write_text("0 0.42 0.38 0.34 0.22\n", encoding="utf-8")

    yaml_path = dataset_dir / "sewer_smoke.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"path: {dataset_dir.resolve()}",
                "train: images/train",
                "val: images/val",
                "names:",
                "  0: smoke_damage",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return yaml_path


def run_train_smoke(output: Path, epochs: int = 1, imgsz: int = 64) -> Dict[str, str]:
    output = output.resolve()
    yaml_path = create_synthetic_yolo_dataset(output=output, imgsz=imgsz)
    from ultralytics import YOLO

    model = YOLO("yolov8n.yaml")
    model.train(
        data=str(yaml_path),
        epochs=epochs,
        imgsz=imgsz,
        batch=1,
        workers=0,
        device="cpu",
        project=str((output / "runs").resolve()),
        name="smoke",
        exist_ok=True,
        verbose=False,
    )
    best_path = output / "runs" / "smoke" / "weights" / "best.pt"
    return {"dataset": str(yaml_path), "best": str(best_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a synthetic Ultralytics training smoke test.")
    parser.add_argument("--output", type=Path, default=Path("data/training_smoke"))
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--imgsz", type=int, default=64)
    args = parser.parse_args()
    result = run_train_smoke(output=args.output, epochs=args.epochs, imgsz=args.imgsz)
    print(result)


if __name__ == "__main__":
    main()

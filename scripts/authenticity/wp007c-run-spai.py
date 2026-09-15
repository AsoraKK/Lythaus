import argparse
import csv
import json
import logging
import pathlib
import sys
import time

import torch


def patch_cpu_cuda() -> None:
    torch.nn.Module.cuda = lambda self, *args, **kwargs: self
    torch.Tensor.cuda = lambda self, *args, **kwargs: self
    torch.cuda.synchronize = lambda *args, **kwargs: None
    torch.cuda.empty_cache = lambda *args, **kwargs: None
    torch.cuda.max_memory_allocated = lambda *args, **kwargs: 0


def load_rows(input_csv: pathlib.Path) -> list[dict]:
    with input_csv.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", choices=["SPAI_NATIVE_CPU_OPT", "SPAI_C512"], required=True)
    parser.add_argument("--spai-root", required=True, type=pathlib.Path)
    parser.add_argument("--checkpoint", required=True, type=pathlib.Path)
    parser.add_argument("--config", required=True, type=pathlib.Path)
    parser.add_argument("--input-csv", required=True, type=pathlib.Path)
    parser.add_argument("--input-root", required=True, type=pathlib.Path)
    parser.add_argument("--output-json", required=True, type=pathlib.Path)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--optimized", action="store_true")
    args = parser.parse_args()

    if args.candidate == "SPAI_C512" and not args.input_csv.stem.startswith("c512"):
        raise RuntimeError("C512_REQUIRES_C512_INPUT_CSV")
    if not args.spai_root.is_dir() or not args.checkpoint.is_file():
        raise RuntimeError("SPAI_RUNTIME_INPUT_MISSING")

    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    patch_cpu_cuda()
    sys.path.insert(0, str(args.spai_root))
    from spai.config import get_config
    from spai.data import build_loader_test
    from spai.models import build_cls_model
    from spai.utils import load_pretrained

    logging.basicConfig(level=logging.WARNING)
    logger = logging.getLogger("wp007c-spai")
    output_dir = args.output_json.parent / f"{args.output_json.stem}-runtime"
    output_dir.mkdir(parents=True, exist_ok=True)
    config = get_config({
        "cfg": str(args.config),
        "batch_size": 1,
        "test_csv": [str(args.input_csv)],
        "test_csv_root": [str(args.input_root)],
        "output": str(output_dir),
        "tag": f"wp007c-{args.candidate}",
        "pretrained": str(args.checkpoint),
        "resize_to": None,
        "opts": (),
    })
    config.defrost()
    config.DATA.BATCH_SIZE = 1
    config.DATA.TEST_BATCH_SIZE = 1
    config.DATA.NUM_WORKERS = 0
    config.DATA.PREFETCH_FACTOR = None
    config.DATA.TEST_PREFETCH_FACTOR = None
    config.TEST.ORIGINAL_RESOLUTION = True
    config.TEST.VIEWS_GENERATION_APPROACH = None
    config.MODEL.FEATURE_EXTRACTION_BATCH = 400
    config.freeze()

    _, datasets, loaders = build_loader_test(config, logger, split="test", dummy_csv_dir=output_dir)
    model = build_cls_model(config)
    model.cuda()
    load_pretrained(config, model, logger, checkpoint_path=args.checkpoint, verbose=False)
    model.eval()
    dataset = datasets[0]
    loader = loaders[0]
    csv_rows = load_rows(args.input_csv)
    if len(dataset) != len(csv_rows):
        raise RuntimeError("SPAI_DATASET_CSV_COUNT_MISMATCH")

    records = []
    iterator = iter(loader)
    while True:
        started = time.perf_counter()
        try:
            images, _, dataset_idx = next(iterator)
        except StopIteration:
            break
        with (torch.inference_mode() if args.optimized else torch.no_grad()):
            if isinstance(images, list):
                prepared = [image.cuda(non_blocking=True).squeeze(dim=1) for image in images]
                if args.candidate == "SPAI_C512":
                    for image in prepared:
                        if tuple(image.shape[-2:]) != (512, 512):
                            raise RuntimeError("C512_MODEL_INPUT_NOT_512")
                output = model(prepared, config.MODEL.FEATURE_EXTRACTION_BATCH)
            else:
                image = images.cuda(non_blocking=True).squeeze(dim=1)
                output = model(image)
            score = float(torch.sigmoid(output).reshape(-1)[0].detach().cpu().item())
        elapsed = time.perf_counter() - started
        index = int(dataset_idx.reshape(-1)[0].item())
        records.append({
            "sampleId": pathlib.Path(dataset.entries[index]["image"]).stem,
            "score": score,
            "runtimeSeconds": round(elapsed, 6),
        })

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "schemaVersion": "lythaus-wp007c-spai-score-run-v1",
        "candidateId": args.candidate,
        "scoreDirection": "HIGHER_SCORE_SYNTHETIC",
        "checkpointSha256": "24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55",
        "optimized": args.optimized,
        "cpuThreads": args.threads,
        "inputCount": len(records),
        "records": records,
        "inferenceMode": "torch.inference_mode" if args.optimized else "torch.no_grad",
    }
    args.output_json.write_text(f"{json.dumps(result, indent=2)}\n", encoding="utf-8")
    print(f"CANDIDATE={args.candidate}")
    print(f"RECORDS={len(records)}")
    if records:
        times = sorted(record["runtimeSeconds"] for record in records)
        print(f"RUNTIME_MIN={times[0]:.6f}")
        print(f"RUNTIME_MAX={times[-1]:.6f}")


if __name__ == "__main__":
    main()

"""Bounded, read-only CSAFE ZIP audit and selective extraction helper.

The outer archive contains six stored nested ZIP members. This helper reads
central directories through bounded seekable views and never extracts the
complete dataset. It emits only sanitized structural metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Iterable


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".jpe"}
MAX_COMPRESSION_RATIO = 1000.0
MAX_SELECTIVE_IMAGES = 120
MAX_SELECTIVE_BYTES = 2 * 1024 * 1024 * 1024
ZIP_LOCAL_HEADER_SIGNATURE = bytes((80, 75, 3, 4))
ARCHIVE_LABEL = "CSAFE_ARCHIVE_26932084_ZIP"


class SectionReader:
    def __init__(self, base: BinaryIO, start: int, length: int) -> None:
        self.base = base
        self.start = start
        self.length = length
        self.position = 0

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == 0:
            next_position = offset
        elif whence == 1:
            next_position = self.position + offset
        elif whence == 2:
            next_position = self.length + offset
        else:
            raise ValueError("unsupported_seek_mode")
        if next_position < 0:
            raise ValueError("negative_seek")
        self.position = min(next_position, self.length)
        return self.position

    def tell(self) -> int:
        return self.position

    def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            size = self.length - self.position
        size = min(size, self.length - self.position)
        if size <= 0:
            return b""
        self.base.seek(self.start + self.position)
        value = self.base.read(size)
        self.position += len(value)
        return value

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def close(self) -> None:
        return None


def safe_member_name(name: str) -> bool:
    normalized = name.replace("\\", "/")
    if not normalized or normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        return False
    parts = normalized.split("/")
    return all(part not in {"", ".."} for part in parts)


def open_nested_view(base: BinaryIO, info: zipfile.ZipInfo) -> SectionReader:
    base.seek(info.header_offset)
    header = base.read(30)
    if len(header) != 30 or header[:4] != ZIP_LOCAL_HEADER_SIGNATURE:
        raise RuntimeError(f"invalid_outer_local_header:{info.filename}")
    fields = struct.unpack("<4s5H3I2H", header)
    filename_length, extra_length = fields[-2], fields[-1]
    data_start = info.header_offset + 30 + filename_length + extra_length
    return SectionReader(base, data_start, info.compress_size)


def compression_ratio(uncompressed: int, compressed: int) -> float | None:
    if compressed == 0:
        return None if uncompressed == 0 else float("inf")
    return uncompressed / compressed


def digest_rows(rows: Iterable[tuple[object, ...]]) -> str:
    digest = hashlib.sha256()
    for row in sorted(rows):
        digest.update(("\0".join(str(value) for value in row) + "\n").encode("utf-8"))
    return digest.hexdigest()


def parse_image_path(name: str, outer_member: str) -> dict[str, str | None]:
    parts = name.replace("\\", "/").split("/")
    if len(parts) < 5:
        return {
            "outerMember": outer_member,
            "member": name,
            "model": None,
            "deviceFamilyId": None,
            "sceneType": None,
            "lens": None,
        }
    return {
        "outerMember": outer_member,
        "member": name,
        "model": parts[0],
        "deviceFamilyId": parts[1],
        "sceneType": parts[2],
        "lens": parts[3],
    }


def validate_ratio(uncompressed: int, compressed: int, label: str) -> None:
    ratio = compression_ratio(uncompressed, compressed)
    if ratio is not None and ratio > MAX_COMPRESSION_RATIO:
        raise RuntimeError(f"zip_bomb_ratio_exceeded:{label}")


def audit_archive(archive_path: Path) -> dict[str, object]:
    if not archive_path.is_file():
        raise RuntimeError("csafe_archive_not_found")
    outer_rows: list[tuple[object, ...]] = []
    inner_rows: list[tuple[object, ...]] = []
    nested_summaries: list[dict[str, object]] = []
    device_state: dict[str, dict[str, object]] = {}
    model_counts: Counter[str] = Counter()
    scene_counts: Counter[str] = Counter()
    extension_counts: Counter[str] = Counter()
    unsafe_members: list[str] = []
    encrypted_members: list[str] = []
    total_image_count = 0
    total_nested_entries = 0
    readme_digest: str | None = None

    with archive_path.open("rb") as base, zipfile.ZipFile(base) as outer:
        for info in outer.infolist():
            outer_rows.append((info.filename, info.file_size, info.compress_size, info.CRC))
            if not safe_member_name(info.filename):
                unsafe_members.append(info.filename)
            if info.flag_bits & 0x1:
                encrypted_members.append(info.filename)
            validate_ratio(info.file_size, info.compress_size, info.filename)

        readme_info = next((info for info in outer.infolist() if info.filename.lower().endswith("readme.pdf")), None)
        if readme_info is not None:
            readme_digest = hashlib.sha256(outer.open(readme_info).read()).hexdigest()

        nested_infos = [info for info in outer.infolist() if info.filename.lower().endswith(".zip")]
        for outer_info in nested_infos:
            nested_reader = open_nested_view(base, outer_info)
            with zipfile.ZipFile(nested_reader) as inner:
                infos = inner.infolist()
                image_count = 0
                total_uncompressed = 0
                total_compressed = 0
                nested_unsafe = 0
                nested_encrypted = 0
                nested_scene_counts: Counter[str] = Counter()
                nested_extension_counts: Counter[str] = Counter()
                for info in infos:
                    total_nested_entries += 1
                    total_uncompressed += info.file_size
                    total_compressed += info.compress_size
                    inner_rows.append((outer_info.filename, info.filename, info.file_size, info.compress_size, info.CRC))
                    if not safe_member_name(info.filename):
                        nested_unsafe += 1
                        unsafe_members.append(f"{outer_info.filename}::{info.filename}")
                    if info.flag_bits & 0x1:
                        nested_encrypted += 1
                        encrypted_members.append(f"{outer_info.filename}::{info.filename}")
                    validate_ratio(info.file_size, info.compress_size, f"{outer_info.filename}::{info.filename}")
                    extension = Path(info.filename).suffix.lower()
                    nested_extension_counts[extension] += 1
                    extension_counts[extension] += 1
                    if extension not in IMAGE_EXTENSIONS:
                        continue
                    image_count += 1
                    total_image_count += 1
                    parsed = parse_image_path(info.filename, outer_info.filename)
                    model = parsed["model"]
                    device = parsed["deviceFamilyId"]
                    scene = parsed["sceneType"]
                    lens = parsed["lens"]
                    if model is None or device is None or scene is None or lens is None:
                        continue
                    model_counts[str(model)] += 1
                    scene_counts[str(scene)] += 1
                    nested_scene_counts[str(scene)] += 1
                    device_key = f"{model}/{device}"
                    state = device_state.setdefault(device_key, {
                        "deviceFamilyId": device,
                        "model": model,
                        "manufacturer": "Apple" if str(model).startswith("iPhone") else "Samsung" if str(model) in {"note10", "s20", "s21"} else "UNKNOWN",
                        "archiveMember": outer_info.filename,
                        "imageCount": 0,
                        "sceneCounts": Counter(),
                        "lensCounts": Counter(),
                        "sceneIdentifiersAvailable": False,
                    })
                    state["imageCount"] = int(state["imageCount"]) + 1
                    state["sceneCounts"][str(scene)] += 1
                    state["lensCounts"][str(lens)] += 1
                nested_summaries.append({
                    "member": outer_info.filename,
                    "entryCount": len(infos),
                    "imageCount": image_count,
                    "declaredUncompressedBytes": total_uncompressed,
                    "declaredCompressedBytes": total_compressed,
                    "compressionRatio": compression_ratio(total_uncompressed, total_compressed),
                    "unsafeEntries": nested_unsafe,
                    "encryptedEntries": nested_encrypted,
                    "extensionCounts": dict(sorted(nested_extension_counts.items())),
                    "sceneCounts": dict(sorted(nested_scene_counts.items())),
                })

    if unsafe_members or encrypted_members:
        raise RuntimeError("csafe_archive_member_safety_failure")
    devices = []
    for state in sorted(device_state.values(), key=lambda item: str(item["deviceFamilyId"])):
        devices.append({
            "deviceFamilyId": state["deviceFamilyId"],
            "model": state["model"],
            "manufacturer": state["manufacturer"],
            "archiveMember": state["archiveMember"],
            "imageCount": state["imageCount"],
            "sceneCounts": dict(sorted(state["sceneCounts"].items())),
            "lensCounts": dict(sorted(state["lensCounts"].items())),
            "sceneIdentifiersAvailable": False,
            "directoryPattern": f"{state['model']}/{state['deviceFamilyId']}/<scene>/<lens>/<image>.jpg",
        })
    outer_rows_with_tag = [("OUTER", *row) for row in outer_rows]
    return {
        "schemaVersion": "lythaus-wp006d-csafe-archive-audit-v1",
        "archiveLabel": ARCHIVE_LABEL,
        "archiveFormat": "ZIP_WITH_STORED_NESTED_ZIPS",
        "outerArchiveSizeBytes": archive_path.stat().st_size,
        "outerEntryCount": len(outer_rows),
        "nestedArchiveCount": len(nested_summaries),
        "nestedArchives": nested_summaries,
        "totalNestedEntries": total_nested_entries,
        "totalImageFiles": total_image_count,
        "modelCounts": dict(sorted(model_counts.items())),
        "sceneCounts": dict(sorted(scene_counts.items())),
        "extensionCounts": dict(sorted(extension_counts.items())),
        "deviceCount": len(devices),
        "devices": devices,
        "pathSafety": {
            "unsafeEntryCount": len(unsafe_members),
            "encryptedEntryCount": len(encrypted_members),
            "maxCompressionRatio": MAX_COMPRESSION_RATIO,
            "fullExtractionPerformed": False,
        },
        "readme": {
            "member": readme_info.filename if readme_info is not None else None,
            "sha256": readme_digest,
        },
        "outerDirectoryFingerprintSha256": digest_rows(outer_rows),
        "directoryFingerprintSha256": digest_rows(inner_rows + outer_rows_with_tag),
    }


def list_members(archive_path: Path, devices: set[str]) -> dict[str, object]:
    if not devices:
        raise RuntimeError("csafe_list_devices_empty")
    members: list[dict[str, object]] = []
    seen_devices: set[str] = set()
    with archive_path.open("rb") as base, zipfile.ZipFile(base) as outer:
        for outer_info in outer.infolist():
            if not outer_info.filename.lower().endswith(".zip"):
                continue
            with zipfile.ZipFile(open_nested_view(base, outer_info)) as inner:
                for info in inner.infolist():
                    if Path(info.filename).suffix.lower() not in IMAGE_EXTENSIONS:
                        continue
                    if not safe_member_name(info.filename):
                        raise RuntimeError("csafe_archive_member_unsafe")
                    parsed = parse_image_path(info.filename, outer_info.filename)
                    device = parsed["deviceFamilyId"]
                    if device not in devices:
                        continue
                    seen_devices.add(str(device))
                    members.append({
                        **parsed,
                        "declaredSizeBytes": info.file_size,
                        "compressedSizeBytes": info.compress_size,
                        "crc32": info.CRC,
                    })
    if seen_devices != devices:
        missing = sorted(devices - seen_devices)
        raise RuntimeError(f"csafe_device_members_missing:{','.join(missing)}")
    members.sort(key=lambda item: (str(item["deviceFamilyId"]), str(item["sceneType"]), str(item["lens"]), str(item["member"])))
    return {"schemaVersion": "lythaus-wp006d-csafe-member-list-v1", "members": members}


def extract_members(archive_path: Path, selection_path: Path, output_dir: Path, replication_devices: set[str], holdout_devices: set[str]) -> dict[str, object]:
    selections = json.loads(selection_path.read_text(encoding="utf-8"))
    if not isinstance(selections, list) or not selections:
        raise RuntimeError("csafe_selection_empty")
    if len(selections) > MAX_SELECTIVE_IMAGES:
        raise RuntimeError("csafe_selective_image_cap_exceeded")
    keys: set[str] = set()
    declared_total = 0
    for selected in selections:
        if not isinstance(selected, dict):
            raise RuntimeError("csafe_selection_record_invalid")
        outer_member = selected.get("outerMember")
        member = selected.get("member")
        device = selected.get("deviceFamilyId")
        key = f"{outer_member}::{member}"
        if not isinstance(outer_member, str) or not isinstance(member, str) or not safe_member_name(member):
            raise RuntimeError("csafe_selection_member_unsafe")
        if key in keys:
            raise RuntimeError("csafe_selection_duplicate")
        if device not in replication_devices or device in holdout_devices:
            raise RuntimeError("csafe_selection_holdout_or_device_boundary")
        keys.add(key)
        declared_total += int(selected.get("declaredSizeBytes", -1))
    if declared_total > MAX_SELECTIVE_BYTES:
        raise RuntimeError("csafe_selective_byte_cap_exceeded")
    output_dir.mkdir(parents=True, exist_ok=True)
    existing = list(output_dir.iterdir())
    if existing:
        raise RuntimeError("csafe_output_directory_must_be_empty")
    records: list[dict[str, object]] = []
    by_outer: dict[str, list[dict[str, object]]] = defaultdict(list)
    for selected in selections:
        by_outer[str(selected["outerMember"])].append(selected)
    with archive_path.open("rb") as base, zipfile.ZipFile(base) as outer:
        for outer_member, selected_items in sorted(by_outer.items()):
            try:
                outer_info = outer.getinfo(outer_member)
            except KeyError as error:
                raise RuntimeError(f"csafe_outer_member_missing:{outer_member}") from error
            with zipfile.ZipFile(open_nested_view(base, outer_info)) as inner:
                for index, selected in enumerate(sorted(selected_items, key=lambda item: str(item["member"]))):
                    try:
                        info = inner.getinfo(str(selected["member"]))
                    except KeyError as error:
                        raise RuntimeError(f"csafe_inner_member_missing:{selected['member']}") from error
                    if info.file_size != int(selected["declaredSizeBytes"]):
                        raise RuntimeError(f"csafe_member_size_changed:{selected['member']}")
                    if info.file_size > MAX_SELECTIVE_BYTES:
                        raise RuntimeError("csafe_member_size_cap_exceeded")
                    relative = f"{selected['deviceFamilyId']}/{index:04d}.jpg"
                    destination = output_dir / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    payload = inner.open(info).read()
                    if len(payload) != info.file_size:
                        raise RuntimeError(f"csafe_extraction_size_mismatch:{selected['member']}")
                    destination.write_bytes(payload)
                    records.append({
                        "outerMember": outer_member,
                        "member": selected["member"],
                        "deviceFamilyId": selected["deviceFamilyId"],
                        "model": selected.get("model"),
                        "sceneType": selected.get("sceneType"),
                        "lens": selected.get("lens"),
                        "declaredSizeBytes": info.file_size,
                        "crc32": info.CRC,
                        "cacheRelativePath": relative,
                        "contentSha256": hashlib.sha256(payload).hexdigest(),
                    })
    actual_total = sum(int(record["declaredSizeBytes"]) for record in records)
    if len(records) != len(selections) or actual_total != declared_total:
        raise RuntimeError("csafe_extraction_accounting_mismatch")
    return {
        "schemaVersion": "lythaus-wp006d-csafe-selective-extraction-v1",
        "archiveLabel": ARCHIVE_LABEL,
        "selectedImageCount": len(records),
        "declaredBytes": actual_total,
        "fullExtractionPerformed": False,
        "holdoutDevicesOpened": [],
        "records": sorted(records, key=lambda item: str(item["cacheRelativePath"])),
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("audit", "list", "extract"))
    parser.add_argument("--archive", required=True)
    parser.add_argument("--devices-json")
    parser.add_argument("--selection-json")
    parser.add_argument("--output-dir")
    parser.add_argument("--replication-devices-json")
    parser.add_argument("--holdout-devices-json")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    archive_path = Path(args.archive)
    if args.operation == "audit":
        result = audit_archive(archive_path)
    elif args.operation == "list":
        if not args.devices_json:
            raise RuntimeError("csafe_list_devices_required")
        result = list_members(archive_path, set(json.loads(Path(args.devices_json).read_text(encoding="utf-8"))))
    else:
        if not args.selection_json or not args.output_dir or not args.replication_devices_json or not args.holdout_devices_json:
            raise RuntimeError("csafe_extract_arguments_required")
        result = extract_members(
            archive_path,
            Path(args.selection_json),
            Path(args.output_dir),
            set(json.loads(Path(args.replication_devices_json).read_text(encoding="utf-8"))),
            set(json.loads(Path(args.holdout_devices_json).read_text(encoding="utf-8"))),
        )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as error:  # noqa: BLE001 - sanitized CLI failure only
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

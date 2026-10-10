#!/usr/bin/env python3
"""Validate a repository archive completely before writing any imported files."""
import argparse
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

MAX_FILES = 2000
MAX_MEMBER_SIZE = 25 * 1024 * 1024
MAX_TOTAL_SIZE = 100 * 1024 * 1024
FORBIDDEN_COMPONENTS = {".git", ".github", ".gitmodules", ".edge-profile", ".edge-headless"}

def safe_parts(name):
    if not name or name.startswith("/") or "\\" in name:
        raise ValueError("unsafe ZIP member pathname")
    raw = name.rstrip("/")
    segments = raw.split("/")
    if any(part in ("", ".", "..") or ":" in part or "\x00" in part for part in segments):
        raise ValueError("unsafe ZIP member component")
    if any(part in FORBIDDEN_COMPONENTS or part.lower() in {".env", "id_rsa"} for part in segments):
        raise ValueError("reserved or private ZIP member")
    return tuple(segments)

def validate_members(archive, strip):
    members = []
    tops = set()
    total = 0
    for info in archive.infolist():
        parts = safe_parts(info.filename)
        mode = info.external_attr >> 16
        if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError("ZIP symlinks and special files are not accepted")
        if info.file_size > MAX_MEMBER_SIZE:
            raise ValueError("ZIP member exceeds size limit")
        total += info.file_size
        if total > MAX_TOTAL_SIZE or len(members) >= MAX_FILES:
            raise ValueError("ZIP exceeds size or file-count limit")
        tops.add(parts[0])
        members.append((info, parts))
    if not members:
        raise ValueError("empty ZIP")
    if strip:
        if len(tops) != 1 or any(len(parts) < 2 for _, parts in members if not _.is_dir()):
            raise ValueError("strip_top_folder requires exactly one enclosing directory")
    paths = set()
    result = []
    for info, parts in members:
        relparts = parts[1:] if strip else parts
        if not relparts:
            continue
        rel = PurePosixPath(*relparts)
        if not info.is_dir():
            if rel in paths:
                raise ValueError("duplicate ZIP destination")
            paths.add(rel)
        result.append((info, rel))
    return result

def extract(archive_path, repository, strip):
    repository = repository.resolve(strict=True)
    with zipfile.ZipFile(archive_path, "r") as archive:
        plan = validate_members(archive, strip)
        with tempfile.TemporaryDirectory(prefix="mcb-archive-") as tmp:
            staging = Path(tmp)
            for info, rel in plan:
                if info.is_dir():
                    continue
                dst = staging.joinpath(*rel.parts)
                dst.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, dst.open("wb") as output:
                    shutil.copyfileobj(source, output)
            # Check every destination before touching the working tree.
            for _, rel in plan:
                dst = repository.joinpath(*rel.parts)
                for candidate in (dst, *dst.parents):
                    if candidate == repository.parent:
                        break
                    if candidate.is_symlink():
                        raise ValueError("destination path passes through a symlink")
                if dst.is_dir() and any(info for info, p in plan if p == rel and not info.is_dir()):
                    raise ValueError("file destination is a directory")
            for info, rel in plan:
                if info.is_dir():
                    continue
                target = repository.joinpath(*rel.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(staging.joinpath(*rel.parts), target)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--strip", choices=["true", "false"], required=True)
    args = parser.parse_args()
    extract(Path(args.zip), Path(args.repo), args.strip == "true")

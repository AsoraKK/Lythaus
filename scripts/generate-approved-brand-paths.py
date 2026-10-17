"""Translate the approved SVG subset to synchronous Flutter Canvas operations."""
import argparse
import hashlib
import re
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/brand/lythaus-v1'
OUTPUT = ROOT / 'lib/design_system/widgets/approved_brand_paths.g.dart'
FILES = [
    'lythaus-symbol-square-black.6a1b6d025e69.svg',
    'lythaus-symbol-square-warm.fb697a91817f.svg',
    'lythaus-wordmark-black.e450176663e0.svg',
    'lythaus-wordmark-white.5ba0451347e2.svg',
]
NUMBER = r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?'
COMMANDS = {'M': ('moveTo', 2), 'L': ('lineTo', 2), 'H': ('lineTo', 1),
            'V': ('lineTo', 1), 'C': ('cubicTo', 6), 'Q': ('quadraticBezierTo', 4)}

def number(value):
    return repr(float(value))

def path_calls(source):
    tokens = re.findall(r'[A-Za-z]|' + NUMBER, source)
    assert not re.sub(r'[A-Za-z]|' + NUMBER + r'|[\s,]', '', source)
    i, command, x, y = 0, None, 0.0, 0.0
    result = ['Path()']
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]
            i += 1
            if command == 'Z':
                result.append('..close()')
                command = None
                continue
        assert command in COMMANDS, f'Unsupported path command: {command}'
        method, count = COMMANDS[command]
        values = [float(v) for v in tokens[i:i+count]]
        assert len(values) == count
        i += count
        if command == 'H':
            values = [values[0], y]
        elif command == 'V':
            values = [x, values[0]]
        x, y = values[-2:]
        result.append(f'..{method}({", ".join(number(v) for v in values)})')
        if command == 'M':
            command = 'L'
    return ''.join(result)

def generate():
    lines = ['// GENERATED from approved SVGs; run scripts/generate-approved-brand-paths.py.',
             '// ignore_for_file: public_member_api_docs', "import 'dart:ui';", '',
             'typedef ApprovedBrandPaint = void Function(Canvas canvas);', '',
             'final approvedBrandPaths = <String, ApprovedBrandPaint>{']
    for index, filename in enumerate(FILES):
        lines.append(f"  '{filename}': _paint{index},")
    lines += ['};', '', 'const approvedBrandViewBoxes = <String, Rect>{']
    for filename in FILES:
        root = ET.fromstring((ASSETS / filename).read_bytes())
        bounds = root.attrib['viewBox'].split()
        lines.append(f"  '{filename}': Rect.fromLTWH({', '.join(number(n) for n in bounds)}),")
    lines += ['};', '']
    for index, filename in enumerate(FILES):
        raw = (ASSETS / filename).read_bytes()
        root = ET.fromstring(raw)
        lines += [f'// Source SHA-256: {hashlib.sha256(raw).hexdigest()}', f'void _paint{index}(Canvas canvas) {{']
        def walk(node, fill=None):
            tag = node.tag.rsplit('}', 1)[-1]
            assert tag in {'svg', 'g', 'path', 'title', 'desc'}, tag
            if tag in {'title', 'desc'}:
                return
            assert not any(key in node.attrib for key in ['opacity', 'stroke', 'style', 'clip-path', 'fill-rule'])
            fill = node.get('fill', fill)
            lines.append('  canvas.save();')
            transform = node.get('transform', '')
            operations = re.findall(r'(translate|scale)\(([^)]*)\)', transform)
            assert not re.sub(r'(translate|scale)\([^)]*\)|\s', '', transform), transform
            for operation, args in operations:
                nums = re.findall(NUMBER, args)
                assert len(nums) in (1, 2)
                if len(nums) == 1:
                    nums.append(nums[0] if operation == 'scale' else '0')
                lines.append(f'  canvas.{operation}({", ".join(number(n) for n in nums)});')
            if tag == 'path':
                assert re.fullmatch(r'#[0-9A-Fa-f]{6}', fill or '')
                lines.append(f'  canvas.drawPath({path_calls(node.attrib["d"])}, Paint()..color = const Color(0xff{fill[1:]}));')
            for child in node:
                walk(child, fill)
            lines.append('  canvas.restore();')
        walk(root)
        lines += ['}', '']
    return subprocess.run(
        ['dart', 'format', '--output=show', '--summary=none'],
        input='\n'.join(lines), text=True, capture_output=True, check=True,
    ).stdout

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    generated = generate()
    if args.check:
        assert OUTPUT.read_text() == generated, 'Generated brand paths differ from approved SVGs'
    else:
        OUTPUT.write_text(generated)

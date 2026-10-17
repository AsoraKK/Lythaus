"""Reject SVG features that the deliberately narrow brand generator cannot preserve."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'brand_generator', Path(__file__).resolve().parents[1] / 'generate-approved-brand-paths.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class GeneratorRejectionTests(unittest.TestCase):
    def test_unsupported_or_malformed_paths_fail_closed(self):
        for path in ['m0 0l1 1z', 'M0 0A1 1 0 0 0 2 2Z', 'M0 0L1', 'M0 0@L1 1Z']:
            with self.subTest(path=path), self.assertRaises((AssertionError, ValueError)):
                generator.path_calls(path)

    def test_unsupported_paint_and_transforms_fail_closed(self):
        for attr in ['opacity="0.5"', 'fill-opacity="0.5"', 'filter="url(#blur)"',
                     'mask="url(#mask)"', 'fill-rule="evenodd"', 'stroke="red"',
                     'transform="rotate(30)"', 'unknown="ignored"',
                     'transform="translate(1 rubbish 2)"', 'transform="scale(1 2 3)"',
                     'transform="scale(1,)"', 'transform="scale(1e999)"']:
            with self.subTest(attr=attr), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                for name in generator.FILES:
                    (root / name).write_text(
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
                        f'<path fill="#11110F" {attr} d="M0 0L10 10Z"/></svg>')
                with patch.object(generator, 'ASSETS', root), self.assertRaises(AssertionError):
                    generator.generate()


if __name__ == '__main__':
    unittest.main()

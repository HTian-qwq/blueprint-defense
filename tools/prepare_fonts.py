"""Split the retained HarmonyOS font into variable WOFF2 Unicode-range subsets.

Optional preparation: pip install -r requirements-fonts.txt
Normal builds use the committed subsets and require only Python's standard library.
"""
import hashlib
import json
import logging
from pathlib import Path

from fontTools import __version__ as fonttools_version, subset
from fontTools.ttLib import TTFont
from font_assets import game_characters

ROOT = Path(__file__).resolve().parents[1]


def ranges(points):
    spans = []
    for cp in sorted(points):
        if spans and cp == spans[-1][1]+1:
            spans[-1][1] = cp
        else:
            spans.append([cp, cp])
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in spans)


def main():
    logging.getLogger('fontTools.subset').setLevel(logging.ERROR)
    source = ROOT/'assets/fonts/HarmonyOS_Sans_SC.ttf'
    target = ROOT/'assets/fonts/subsets'
    target.mkdir(exist_ok=True)
    with TTFont(source) as original:
        coverage = set(original.getBestCmap())
    latin = {cp for cp in coverage if cp <= 0x24F}
    game = (game_characters(ROOT) & coverage) - latin
    remaining = sorted(coverage - latin - game)
    groups = [('latin', latin), ('game', game)] + [
        (f'extra-{i//512:02d}', set(remaining[i:i+512])) for i in range(0, len(remaining), 512)]
    parts = []
    for name, points in groups:
        with TTFont(source, recalcTimestamp=False) as font:
            options = subset.Options()
            options.layout_features = ['*']
            options.name_IDs = ['*']  # Keep family, attribution and embedded license.
            options.name_languages = ['*']
            options.name_legacy = True
            worker = subset.Subsetter(options=options)
            worker.populate(unicodes=points)
            worker.subset(font)
            font.flavor = 'woff2'
            path = target/f'{name}.woff2'
            font.save(path)
        with TTFont(path) as result:
            assert set(result.getBestCmap()) == points, name
            assert [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in result['fvar'].axes] == [('wght', 40, 400, 900)]
        data = path.read_bytes()
        parts.append(dict(file=path.name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                          codepoints=sorted(points), unicodeRange=ranges(points)))
        print(f'{name}: {len(points)} characters, {len(data)/1024:.1f} KiB', flush=True)
    manifest = dict(family='HarmonyOS Sans SC', fontTools=fonttools_version,
                    sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), sourceBytes=source.stat().st_size,
                    characters=len(coverage), totalBytes=sum(p['bytes'] for p in parts),
                    startupBytes=sum(p['bytes'] for p in parts[:2]), subsets=parts)
    (target/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f"Complete: {len(parts)} subsets; startup {manifest['startupBytes']/1024:.1f} KiB; all {manifest['totalBytes']/1024/1024:.2f} MiB")


if __name__ == '__main__':
    main()

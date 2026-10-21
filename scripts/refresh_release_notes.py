"""Plan all existing release descriptions before editing any of them."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from release_notes import release_notes


def build_plan(releases):
    plans = []
    for item in releases:
        if item['draft']:
            continue
        tag = item['tag_name']
        if not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
            raise ValueError(f'Unrecognized release tag: {tag}')
        version = tag[1:]
        expected = {f'VRM-Desktop-Companion-v{version}-{suffix}.zip'
                    for suffix in ['Windows-x64', 'Update', 'Source']} | {'SHA256SUMS.txt'}
        actual = {a['name'] for a in item['assets']}
        if actual != expected:
            raise ValueError(f'Check download instructions for {tag}: {sorted(actual)}')
        body = release_notes(version)
        # Keep the compatibility range recorded in the original release.
        supported = re.search(r'0\.1\.0[〜～]0\.1\.\d+', item.get('body') or '')
        if supported:
            body = body.replace('## 更新方法\n\n', f'## 更新方法\n\n対応する更新元：{supported.group(0)}。\n\n')
        # Link the manual belonging to this version, rather than implying that
        # all features in the current README were already available then.
        body = body.replace('/blob/main/README.md', f'/blob/{tag}/README.md')
        if tuple(map(int, version.split('.'))) < (0, 1, 17):
            body = re.sub(r' · \[音声の導入\]\([^)]*\)', '', body)
        plans.append({'tag': tag, 'body': body})
    if not plans:
        raise ValueError('No published releases found')
    if len({p['tag'] for p in plans}) != len(plans):
        raise ValueError('Duplicate release tags')
    return plans


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--releases', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    raw = json.loads(args.releases.read_text(encoding='utf-8'))
    releases = [item for page in raw for item in page] if raw and isinstance(raw[0], list) else raw
    plans = build_plan(releases)
    args.output.mkdir(parents=True, exist_ok=True)
    for plan in plans:
        (args.output / f"{plan['tag']}.md").write_text(plan['body'], encoding='utf-8')
    print(f'Prepared {len(plans)} release descriptions')
    if args.apply:
        for plan in plans:
            subprocess.run(['gh', 'release', 'edit', plan['tag'], '--notes-file',
                            str(args.output / f"{plan['tag']}.md")], check=True)
            print(f"Updated {plan['tag']}", flush=True)


if __name__ == '__main__':
    main()

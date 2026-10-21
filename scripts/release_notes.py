"""Build concise Japanese notes from exactly one UPDATE.md version section."""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = 'https://github.com/laptan45p/VRM-Desktop-Companion'


def release_notes(version, changelog=None):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Expected a numeric release version')
    text = (ROOT / 'UPDATE.md').read_text(encoding='utf-8') if changelog is None else changelog
    heading = re.search(r'^## ' + re.escape(version) + r'\s*$', text, re.MULTILINE)
    if heading is None:
        raise ValueError(f'UPDATE.md has no section for {version}')
    remainder = text[heading.end():]
    next_heading = re.search(r'^## ', remainder, re.MULTILINE)
    changes = remainder[:next_heading.start() if next_heading else len(remainder)].strip()
    if not changes:
        raise ValueError(f'UPDATE.md section {version} is empty')
    app = f'VRM-Desktop-Companion-v{version}'
    return f'''## 今回の変更点

{changes}

## ダウンロード

- **{app}-Windows-x64.zip**：初めて使う方向け。すべて展開してexeを起動します。
- **{app}-Update.zip**：既存環境の更新用。
- **{app}-Source.zip**：ビルド済み描画コードを含むソース一式。
- **SHA256SUMS.txt**：ZIPの照合用ハッシュ。

## 更新方法

1. トレイからアプリを完全に終了します。
2. Update.zipをすべて展開し、中身をexeのあるフォルダーへコピーします。
3. apply_update.batを実行し、従来のexeから起動します。

設定・会話履歴は引き継ぎます。VRM・LLM・音声モデルなどは同梱していません。

[使い方]({REPO}/blob/main/README.md) · [音声の導入]({REPO}/blob/main/TTS_SETUP.md) · [全更新履歴]({REPO}/blob/main/UPDATE.md)
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(release_notes(args.version), encoding='utf-8')


if __name__ == '__main__':
    main()

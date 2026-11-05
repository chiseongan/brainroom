# 팀원에게 보낼 확장 zip을 만든다: python tools/build_extension_zip.py
# 개발용 localhost 권한과 주소는 빼고 넣는다 (이 PC의 5173 포트에 뜬 아무 페이지나 대화를 받지 못하게).
import json, os, re, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, 'extension')

def release_file(name, raw):
    if name == 'manifest.json':
        m = json.loads(raw)
        m['host_permissions'] = [h for h in m['host_permissions'] if 'localhost' not in h]
        for c in m['content_scripts']:
            c['matches'] = [u for u in c['matches'] if 'localhost' not in u]
        return json.dumps(m, ensure_ascii=False, indent=2)
    if name == 'background.js':
        out = re.sub(r"\n\s*local: 'http://localhost:5173/',", '', raw)
        return out.replace(", 'http://localhost:5173/*'", '')
    if name == 'popup.html':
        return re.sub(r'\s*<option value="local">.*?</option>', '', raw)
    return raw

version = json.load(open(os.path.join(EXT, 'manifest.json'), encoding='utf-8'))['version']
guide = open(os.path.join(ROOT, 'tools', 'extension-install.txt'), encoding='utf-8').read().replace('{version}', version)
out_dir = os.path.join(ROOT, 'release')
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f'brainroom-extension-{version}.zip')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in sorted(os.listdir(EXT)):
        path = os.path.join(EXT, name)
        if os.path.isfile(path):
            text = release_file(name, open(path, encoding='utf-8').read())
            assert 'localhost' not in text, name
            z.writestr(f'brainroom-extension/{name}', text.encode('utf-8'))
    z.writestr('설치 방법.txt', guide.replace('\n', '\r\n').encode('utf-8-sig'))
print(out)

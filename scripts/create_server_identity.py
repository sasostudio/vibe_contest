"""서버 전용 Firebase 계정을 만들고 토큰을 .env.local 과 Vercel 환경 변수에 넣는다. 토큰은 출력하지 않는다.

Firestore 규칙은 이 계정의 uid만 허용한다. uid는 비밀이 아니고 refresh token이 비밀이다.
"""
import json
import re
import subprocess
import urllib.request

key = re.search(r"apiKey: '([^']+)'", open('public/firebase-config.js', encoding='utf-8').read()).group(1)
req = urllib.request.Request(
    f'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={key}',
    data=b'{"returnSecureToken":true}',
    headers={'Content-Type': 'application/json'},
)
account = json.load(urllib.request.urlopen(req, timeout=15))
token = account['refreshToken']

with open('.env.local', encoding='utf-8') as f:
    lines = [line for line in f.read().splitlines() if not line.startswith('FIREBASE_SERVER_REFRESH_TOKEN=')]
lines.append(f'FIREBASE_SERVER_REFRESH_TOKEN={token}')
with open('.env.local', 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(lines) + '\n')

done = subprocess.run(
    'vercel.cmd env add FIREBASE_SERVER_REFRESH_TOKEN production',
    input=token, text=True, capture_output=True, shell=True,
)
print('vercel env add exit', done.returncode)
print('SERVER_UID', account['localId'])

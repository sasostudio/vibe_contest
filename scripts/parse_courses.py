"""원본 xlsx 2개를 public/data/courses.js 로 변환한다. 교수 이름은 의도적으로 넣지 않는다.

실행: python scripts/parse_courses.py <종합강의시간표.xlsx> <교양정원공지.xlsx>
"""
import json
import re
import sys
from collections import Counter

import openpyxl

sys.stdout.reconfigure(encoding='utf-8')

DAYS = '월화수목금토일'
BLOCK = re.compile(r'\[([^\]:]*):([^\]]*)\]')
SLOT = re.compile(r'([월화수목금토일]?)\((\d\d):(\d\d)~(\d\d):(\d\d)\)')
ROOM_NAME = re.compile(r'(제?[^,\[]*?)-[^,\[]*\[([^\]]+)\]')
MERGE_GAP = 15  # 75분 교시의 쉬는 시간. 이 이하로 붙은 같은 강의실 칸은 한 덩어리 수업이다
NON_DEPT = {'교양', '교직', '일선', '군사학', 'HUSS(타대학)'}
# 일반 재학생이 시간표에 담지 않는 수업구분
SPECIAL_KINDS = {'교환학생,복수학위제대상', '외국인,교환학생,복수학위제대상', '사회봉사', '해외인턴십', '현장실습'}


def load(path):
    rows = list(openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    head = rows[1]
    return [dict(zip(head, r)) for r in rows[2:] if r[0]]


def parse_slots(text, stats):
    """요일이 생략된 칸은 직전 요일을 상속한다 (강의실이 여러 곳인 강의의 원본 표기)."""
    slots, day = [], None
    for room, body in BLOCK.findall(text or ''):
        for d, h1, m1, h2, m2 in SLOT.findall(body):
            if d:
                day = d
            else:
                stats['상속'] += 1
            if day is None:
                raise ValueError(f'요일 없는 칸: {text}')
            slots.append([DAYS.index(day), int(h1) * 60 + int(m1), int(h2) * 60 + int(m2), room.strip()])
    slots.sort(key=lambda s: (s[0], s[1]))
    merged = []
    for s in slots:
        last = merged[-1] if merged else None
        if last and last[0] == s[0] and last[3] == s[3] and s[1] - last[2] <= MERGE_GAP:
            last[2] = max(last[2], s[2])
        else:
            merged.append(s)
    return merged


def building_of(room):
    return room.split('-')[0]


def main(timetable_path, capacity_path):
    rows = load(timetable_path)
    caps = {r['학수번호']: r for r in load(capacity_path)}
    stats = Counter()
    buildings = {}
    courses = []
    for r in rows:
        if r['수업구분'] in SPECIAL_KINDS or r['학점'] > 6:
            stats['제외'] += 1
            continue
        for name, code in ROOM_NAME.findall(r['강의실'] or ''):
            buildings.setdefault(building_of(code), name.strip())
        cap = caps.get(r['학수번호'])
        course = {
            'id': r['학수번호'],
            'code': r['학수번호'][:7],
            'dept': r['학과(부)'],
            'grade': r['학년'],
            'type': r['이수구분'],
            'area': r['이수영역'],
            'name': r['교과목명'],
            'credits': r['학점'],
            'mode': r['수업유형'],
            'slots': parse_slots(r['시간표(시간)'], stats),
        }
        if cap:
            stats['정원 연결'] += 1
            course['cap'] = cap['정원']
            if (cap['수강대상'] or '').strip():
                course['target'] = cap['수강대상'].strip()
        courses.append(course)
    depts = sorted({c['dept'] for c in courses} - NON_DEPT)
    data = {'source': '2026-2 종합강의시간표(2026-08-04 기준)', 'buildings': buildings, 'depts': depts, 'courses': courses}
    with open('public/data/courses.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write('// scripts/parse_courses.py 로 생성한 파일이다. 직접 고치지 않는다.\n')
        f.write('export const DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(len(rows), '행 →', len(courses), '분반 ·', len(depts), '학과 ·', dict(stats))
    print('시간 없음', sum(1 for c in courses if not c['slots']))
    print('건물', buildings)
    print('수강대상 예', Counter(c.get('target') for c in courses if c.get('target')).most_common(25))
    print('토요일', sum(1 for c in courses if any(s[0] >= 5 for s in c['slots'])))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

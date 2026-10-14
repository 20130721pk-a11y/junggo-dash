# 시·군·구 / 읍·면·동 중심 좌표 표 만들기 → collector/places.json
# 원자료: vuski/admdongkor parquet/simplified/{sgg,emd}_20260701_light.parquet (WGS84)
#   = 통계청 SGIS 행정동 경계(공공누리 제1유형)를 vuski/admdongkor 가 가공(CC BY 4.0)
# 사용: python3 -I places_build.py <sgg.parquet> <emd.parquet> <out.json>
import json, re, sys
import pyarrow.parquet as pq
from shapely import wkb

SIDO = {
    '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천', '대전광역시': '대전', '울산광역시': '울산',
    '세종특별자치시': '세종', '경기도': '경기', '충청북도': '충북', '충청남도': '충남', '경상북도': '경북', '경상남도': '경남',
    '제주특별자치도': '제주', '강원특별자치도': '강원', '전북특별자치도': '전북', '전남광주통합특별시': '전남광주',
}
sgg_path, emd_path, out_path = sys.argv[1:4]
sgg = pq.read_table(sgg_path, columns=['sidonm', 'sggnm', 'area', 'geometry']).to_pylist()
emd = pq.read_table(emd_path, columns=['sidonm', 'sggnm', 'emdnm', 'area', 'geometry']).to_pylist()

def center(g):
    c = wkb.loads(g).centroid
    return round(c.y, 3), round(c.x, 3)

def split_name(n):
    m = re.fullmatch(r'(.+?시)(.+구)', n)
    return (m.group(1), m.group(2)) if m else (n, None)

p = {}
full = {}
cities = {}  # (prov, city) -> [(gu, lat, lng, area)]
for r in sgg:
    prov = SIDO[r['sidonm']]
    full[prov] = r['sidonm']
    city, gu = split_name(r['sggnm'])
    key = f'{city} {gu}' if gu else city
    lat, lng = center(r['geometry'])
    p.setdefault(prov, {})[key] = [lat, lng, {}]
    if gu:
        cities.setdefault((prov, city), []).append((gu, lat, lng, r['area']))
for r in emd:
    prov = SIDO[r['sidonm']]
    city, gu = split_name(r['sggnm'])
    key = f'{city} {gu}' if gu else city
    lat, lng = center(r['geometry'])
    p[prov][key][2][r['emdnm']] = [lat, lng]
for (prov, city), gus in cities.items():
    a = sum(g[3] for g in gus)
    lat = round(sum(g[1] * g[3] for g in gus) / a, 3)
    lng = round(sum(g[2] * g[3] for g in gus) / a, 3)
    assert city not in p[prov], (prov, city)
    p[prov][city] = [lat, lng, [g[0] for g in gus]]
out = {
    'about': ('읍·면·동, 시·군·구 경계의 무게 중심(위도, 경도, 소수 셋째 자리). 2026-07-01 행정구역. '
              '본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며'
              '(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다. 중심점 계산: 꿀매 레이더.'),
    'v': '20260701',
    'sido': full,
    'p': p,
}
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print('sgg', len(sgg), 'emd', len(emd), 'cities', len(cities), file=sys.stderr)

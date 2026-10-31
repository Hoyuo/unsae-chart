# unsae-chart

사주(四柱)·자미두수·서양 점성술 차트를 계산하는 작은 HTTP 서버입니다. 출생 정보를 JSON으로 보내면
LLM 입력용 차트 텍스트, 화면용 데이터(view), 해석 검증용 정답(facts)을 한 번에 돌려줍니다.
운세 서비스 "운세미"(unsae)에서 계산만 떼어 낸 것으로, 프롬프트·모델 호출·보고서·저장소·비밀값은 없습니다.

계산은 만세력 엔진 [`@orrery/core`](https://www.npmjs.com/package/@orrery/core)(AGPL-3.0)가 하고,
음력 변환은 `lunar-javascript`를 씁니다. `@orrery/core`가 AGPL-3.0이라 이 서버도 AGPL-3.0-only로 공개합니다 (`LICENSE`).
네트워크로 이 서버를 이용자에게 제공하면 AGPL 13조에 따라 이용자에게 소스를 제공해야 합니다.

## 실행

Node 22, pnpm 10.

```sh
pnpm install
pnpm dev          # http://localhost:8788  (PORT 환경변수로 바꿀 수 있다)
pnpm test
pnpm build && pnpm start
```

Docker (이 폴더만으로 빌드된다):

```sh
docker build -t unsae-chart .
docker run --rm -p 8788:8788 unsae-chart
```

인증이 없으므로 인터넷에 직접 열지 말고 내부 네트워크에서만 쓰세요.

## API

입력 오류는 `400 { "error": "메시지" }`, 그 밖의 오류는 `500`입니다.

### `GET /health`
`{ "ok": true }`

### `POST /compute`
요청 본문:

| 필드 | 설명 |
| --- | --- |
| `date` | `YYYY-MM-DD` (1900~2100년) |
| `time` | `HH:MM`, 생략·`null`이면 시간 미상 |
| `gender` | `"M"` \| `"F"` |
| `jasiMethod` | `"unified"`(기본) \| `"split"` (야자시) |
| `place` | `{ name, lat, lon, timezone }`, 생략하면 서울. 해외는 IANA `timezone` 필요 |
| `calendar` | `"lunar"`면 `date`를 음력으로 보고 양력으로 바꿔 계산 |
| `leapMonth` | 음력 윤달 여부 |
| `asOf` | 기준일 `YYYY-MM-DD`, 생략하면 오늘(한국). 올해·내년 세운/유년/트랜짓의 기준 |
| `systems` | `["saju","ziwei","natal"]` 중 계산할 체계, 생략하면 전부 |

응답:

```jsonc
{
  "birth": { "date": "1993-03-12", "time": "09:45", "gender": "M", "jasiMethod": "unified", "place": { } }, // 음력 입력은 양력으로 바뀐 값
  "asOf": { "date": "2026-10-29", "year": 2026 },
  "saju":  { "chartText": "", "view": { }, "facts": { }, "pillars": ["乙巳", "壬辰", "乙卯", "癸酉"] }, // 시·일·월·년, 시간 미상이면 시주는 null
  "ziwei": { "chartText": "", "view": { }, "facts": { } },  // 시간 미상이면 null (출생 시가 필수)
  "natal": { "chartText": "", "view": { }, "facts": { } }
}
```

`systems`에 넣지 않은 체계는 응답에 키가 없습니다. 타입은 `src/types.ts`에 있습니다.

### `POST /normalize`
음력 입력을 양력으로 바꾼 출생 정보 `{ "birth": { ... } }`를 돌려줍니다. 존재하지 않는 음력 날짜는 400.

### `GET /places?q=`
출생지 검색. `{ "places": [{ "name", "region", "country", "lat", "lon", "timezone" }] }`.
국내 도시는 `timezone`이 `"Asia/Seoul"`, 해외 도시는 `null`이라 호출하는 쪽이 IANA 타임존을 정해야 합니다.

## 출처와 라이선스

- 명식·자미두수·점성술 계산: [`@orrery/core`](https://www.npmjs.com/package/@orrery/core) (AGPL-3.0-only)
- 음력 변환: [`lunar-javascript`](https://www.npmjs.com/package/lunar-javascript) (MIT)
- 이 서버: AGPL-3.0-only. 전문은 `LICENSE`.

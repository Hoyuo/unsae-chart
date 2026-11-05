/**
 * 차트 계산 서버 (Hono)
 *   GET  /health
 *   POST /compute      출생 정보 → 사주·자미두수·점성술 차트 텍스트, 화면용 view, 검사용 facts
 *   POST /normalize    음력 입력을 양력으로 바꾼 출생 정보
 *   GET  /places?q=    출생지 검색 (@orrery/core 도시 목록)
 * 입력 오류는 400 { error }.
 */
import { filterCities } from "@orrery/core/cities";
import { Hono } from "hono";
import { ZodError, type ZodType } from "zod";
import { InputError, normalizeBirth, normalizePlace } from "./chart.js";
import { compute } from "./compute.js";
import { BirthInputSchema, ComputeRequestSchema, SEOUL } from "./types.js";

async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => {
    throw new InputError("JSON 본문이 필요합니다.");
  });
  return schema.parse(json);
}

export function createApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: err.issues[0]?.message ?? "잘못된 입력입니다." }, 400);
    if (err instanceof InputError) return c.json({ error: err.message }, 400);
    // orrery(천문 계산)가 입력 때문에 던지는 오류. 사용자가 고칠 수 있는 문제라 400으로 낸다
    if (err instanceof RangeError && /DST gap/i.test(err.message)) {
      return c.json({ error: "그 시각은 서머타임이 시작되며 건너뛴 시각이라 존재하지 않습니다. 출생 시각을 확인하세요." }, 400);
    }
    if (err instanceof RangeError && /time ?zone/i.test(err.message)) return c.json({ error: "알 수 없는 타임존입니다." }, 400);
    if (err.name === "InvalidDateTimeError") return c.json({ error: "존재하지 않는 날짜·시각입니다." }, 400);
    console.error(err);
    return c.json({ error: "서버 오류가 발생했습니다." }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/compute", async (c) => c.json(await compute(await body(c.req.raw, ComputeRequestSchema))));

  app.post("/normalize", async (c) => {
    const n = normalizeBirth(await body(c.req.raw, BirthInputSchema));
    return c.json({ birth: { date: n.date, time: n.time ?? null, gender: n.gender, jasiMethod: n.jasiMethod, place: n.place ? normalizePlace(n.place) : SEOUL } });
  });

  app.get("/places", (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ places: [] });
    // 국내 도시는 Asia/Seoul. 해외 도시는 타임존 정보가 없어 호출하는 쪽이 IANA 타임존을 함께 보내야 한다
    const places = filterCities(q).map((city) => ({
      name: city.country ? `${city.name}, ${city.country}` : city.name,
      region: city.region ?? null,
      country: city.country ?? null,
      lat: city.lat,
      lon: city.lon,
      timezone: city.country ? null : "Asia/Seoul",
    }));
    return c.json({ places });
  });

  return app;
}

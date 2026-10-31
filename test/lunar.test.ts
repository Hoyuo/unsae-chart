import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { lunarToSolar, normalizeBirth, InputError } from "../src/chart.js";

describe("음력 → 양력", () => {
  it("README 케이스: 음력 1993-02-20 = 양력 1993-03-12", () => expect(lunarToSolar("1993-02-20")).toBe("1993-03-12"));
  it("윤달: 2020년 윤4월 10일 = 양력 2020-06-01 (평달 4월 10일은 2020-05-02)", () => {
    expect(lunarToSolar("2020-04-10", true)).toBe("2020-06-01");
    expect(lunarToSolar("2020-04-10", false)).toBe("2020-05-02");
  });
  it("없는 윤달·없는 날짜는 거절한다 (다음 달로 넘기지 않는다)", () => {
    expect(() => lunarToSolar("2020-05-10", true)).toThrow(InputError); // 2020년은 윤4월뿐
    expect(() => lunarToSolar("1993-02-31")).toThrow(/존재하지 않는 음력/);
    expect(() => lunarToSolar("1993-13-01")).toThrow(InputError);
  });
  it("윤달 안내 문구가 상황에 맞다", () => {
    expect(() => lunarToSolar("2020-05-10", true)).toThrow(/윤달이 없습니다/);
    expect(() => lunarToSolar("1993-02-31")).toThrow(/윤달이면 윤달에 체크/);
  });

  it("normalizeBirth: 음력이면 양력으로 바꾸고 calendar·leapMonth를 지운다, 양력이면 그대로", () => {
    expect(normalizeBirth({ date: "1993-02-20", calendar: "lunar", leapMonth: false, gender: "M" })).toEqual({ date: "1993-03-12", gender: "M" });
    expect(normalizeBirth({ date: "1993-03-12", calendar: "solar", gender: "M" })).toEqual({ date: "1993-03-12", gender: "M" });
    expect(normalizeBirth({ date: "1993-03-12", leapMonth: true, gender: "M" })).toEqual({ date: "1993-03-12", gender: "M" }); // 양력에는 윤달이 없다
  });
});

describe("음력 입력 API", () => {
  const app = createApp();
  const post = (path: string, body: object) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const base = { time: "09:45", gender: "M" };
  type Out = { birth: { date: string }; saju: { chartText: string }; ziwei: { chartText: string }; natal: { chartText: string } };
  const compute = async (body: object) => (await (await post("/compute", { ...body, asOf: "2026-10-29" })).json()) as Out;

  it("음력으로 보내도 같은 양력 날짜의 명식이 나온다 (/compute)", async () => {
    const solar = await compute({ ...base, date: "1993-03-12" });
    const lunar = await compute({ ...base, date: "1993-02-20", calendar: "lunar" });
    expect(lunar.birth.date).toBe("1993-03-12");
    for (const system of ["saju", "ziwei", "natal"] as const) expect(lunar[system].chartText).toBe(solar[system].chartText);
  });
  it("/normalize는 양력 출생 정보를 돌려준다", async () => {
    const res = await post("/normalize", { ...base, date: "1993-02-20", calendar: "lunar" });
    expect(((await res.json()) as { birth: { date: string; calendar?: string } }).birth).toMatchObject({ date: "1993-03-12", time: "09:45" });
  });
  it("윤달 표시가 결과를 바꾼다", async () => {
    const leap = await compute({ ...base, date: "2020-04-10", calendar: "lunar", leapMonth: true });
    const plain = await compute({ ...base, date: "2020-04-10", calendar: "lunar" });
    expect(leap.saju.chartText).not.toBe(plain.saju.chartText);
  });
  it("없는 음력 날짜는 400과 사유", async () => {
    const res = await post("/compute", { ...base, date: "1993-02-31", calendar: "lunar" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("존재하지 않는 음력");
  });
  it("calendar 값이 이상하면 400", async () => expect((await post("/compute", { ...base, date: "1993-03-12", calendar: "julian" })).status).toBe(400));
});

describe("GET /places", () => {
  const app = createApp();
  it("빈 검색어는 빈 목록", async () => expect(await (await app.request("/places?q=")).json()).toEqual({ places: [] }));
  it("국내 도시는 Asia/Seoul", async () => {
    const { places } = (await (await app.request(`/places?q=${encodeURIComponent("서울")}`)).json()) as { places: { name: string; timezone: string | null }[] };
    expect(places.length).toBeGreaterThan(0);
    expect(places.some((p) => p.timezone === "Asia/Seoul")).toBe(true);
  });
  it("GET /health", async () => expect(await (await app.request("/health")).json()).toEqual({ ok: true }));
});
